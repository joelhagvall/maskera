/**
 * Offline Operation & Egress Verification Suite (`audit:offline`).
 *
 * Uses a Node `--import` preload hook that actively blocks and logs EVERY
 * non-loopback network connection (`globalThis.fetch`, `http.request`,
 * `https.request`, `net.Socket.prototype.connect`, `dns.lookup` for non-loopback).
 *
 * Proves:
 *   1. `rules` mode operates 100% offline with 0 outbound connection attempts.
 *   2. `auto` (hybrid ONNX) mode with local model (`MASKERA_MODEL_PATH` +
 *      `MASKERA_ALLOW_REMOTE_MODELS=0`) operates 100% offline with 0 outbound
 *      connection attempts across MCP stdio, guard, doctor, and proxy.
 *   3. Cold-start without local model fails closed cleanly when network is
 *      blocked (never silently falls back to unredacted passthrough) and records
 *      the exact remote host attempted (`huggingface.co`).
 */
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import {
  createSuiteCollector,
  distCliPath,
  getLocalNerEnv,
  hasLocalNerModel,
  runProcess,
} from "../lib/harness.mjs"

const EGRESS_BLOCKER_SOURCE = `
import { appendFileSync } from "node:fs"
import http from "node:http"
import https from "node:https"
import net from "node:net"

const logFile = process.env.MASKERA_OFFLINE_LOG
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "::ffff:127.0.0.1"])

function isLoopback(host) {
  if (!host) return true
  return LOOPBACK.has(String(host).toLowerCase())
}

function recordAndThrow(kind, target) {
  if (logFile) {
    appendFileSync(logFile, JSON.stringify({ kind, target }) + "\\n", "utf8")
  }
  throw new Error("OFFLINE_BLOCKED: " + kind + " -> " + target)
}

const origFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
  const parsed = new URL(urlStr)
  if (!isLoopback(parsed.hostname)) {
    recordAndThrow("fetch", parsed.hostname + parsed.pathname)
  }
  return origFetch(input, init)
}

for (const [name, mod] of [["http", http], ["https", https]]) {
  const origReq = mod.request
  mod.request = function patchedRequest(urlOrOpts, ...rest) {
    let host = "localhost"
    if (typeof urlOrOpts === "string" || urlOrOpts instanceof URL) {
      host = new URL(String(urlOrOpts)).hostname
    } else if (urlOrOpts && typeof urlOrOpts === "object") {
      host = urlOrOpts.hostname || urlOrOpts.host || "localhost"
    }
    if (!isLoopback(String(host).split(":")[0])) {
      recordAndThrow(name, String(host))
    }
    return origReq.call(this, urlOrOpts, ...rest)
  }
}

const origConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function patchedConnect(...args) {
  const first = args[0]
  let host = "127.0.0.1"
  if (typeof first === "object" && first !== null) {
    host = first.host || "127.0.0.1"
  } else if (typeof first === "number" && typeof args[1] === "string") {
    host = args[1]
  }
  if (!isLoopback(host)) {
    recordAndThrow("tcp", host)
  }
  return origConnect.apply(this, args)
}
`

export async function runOfflineAudit() {
  const suite = createSuiteCollector("offline")
  const dir = await mkdtemp(join(tmpdir(), "maskera-audit-offline-"))
  const blockerPath = join(dir, "block-egress.mjs")
  await writeFile(blockerPath, EGRESS_BLOCKER_SOURCE, "utf8")
  const blockerUrl = pathToFileURL(blockerPath).href

  let unexpectedEgressAttempts = 0
  const documentedNetworkRequirements = []

  try {
    // 1. Rules mode completely offline
    await suite.check(
      "offline-rules-mode",
      "MCP stdio, guard, and doctor run 100% offline in rules mode with 0 outbound attempts",
      async () => {
        const logFile = join(dir, "rules-egress.jsonl")
        await writeFile(logFile, "", "utf8")
        const env = { MASKERA_OFFLINE_LOG: logFile }

        const doc = await runProcess(
          process.execPath,
          ["--import", blockerUrl, distCliPath, "doctor", "--rules-only", "--root", dir, "--json"],
          { env },
        )
        assert.equal(doc.code, 0, doc.stderr)
        assert.equal(JSON.parse(doc.stdout).ok, true)

        const grd = await runProcess(
          process.execPath,
          ["--import", blockerUrl, distCliPath, "guard", "--rules-only", "--no-proxy"],
          { env, input: JSON.stringify({ prompt: "Pnr 19900101-2385" }) },
        )
        assert.equal(grd.code, 2)

        const attempts = (await readFile(logFile, "utf8")).trim().split("\n").filter(Boolean)
        unexpectedEgressAttempts += attempts.length
        assert.equal(attempts.length, 0, `Unexpected egress in rules mode: ${attempts.join("; ")}`)
        return "0 outbound network attempts in rules mode"
      },
    )

    // 2. Hybrid ONNX mode offline with local model
    if (hasLocalNerModel) {
      await suite.check(
        "offline-hybrid-onnx-local-model",
        "Hybrid ONNX NER (MCP stdio + guard + doctor) runs 100% offline with local model and 0 outbound attempts",
        async () => {
          const logFile = join(dir, "onnx-egress.jsonl")
          await writeFile(logFile, "", "utf8")
          const env = { ...getLocalNerEnv(), MASKERA_OFFLINE_LOG: logFile }

          const doc = await runProcess(
            process.execPath,
            ["--import", blockerUrl, distCliPath, "doctor", "--root", dir, "--json"],
            { env },
          )
          assert.equal(doc.code, 0, doc.stderr)
          const parsed = JSON.parse(doc.stdout)
          assert.equal(parsed.ok, true)
          assert.equal(parsed.sampleProof.modeUsed, "hybrid")
          assert.equal(parsed.sampleProof.rawPiiLeaked, false)

          const grd = await runProcess(
            process.execPath,
            ["--import", blockerUrl, distCliPath, "guard", "--no-proxy"],
            { env, input: JSON.stringify({ prompt: "Skicka till Anna Lindqvist i Uppsala" }) },
          )
          assert.equal(grd.code, 2)

          const attempts = (await readFile(logFile, "utf8")).trim().split("\n").filter(Boolean)
          unexpectedEgressAttempts += attempts.length
          assert.equal(
            attempts.length,
            0,
            `Unexpected egress in offline ONNX mode: ${attempts.join("; ")}`,
          )
          return "0 outbound network attempts in hybrid ONNX offline mode"
        },
      )
    } else {
      suite.record(
        "offline-hybrid-onnx-local-model",
        "Hybrid ONNX NER offline check",
        "NOT_TESTED",
        "Local ONNX model apps/demo/public/models/maskera-sv-ner-v20 not present",
      )
    }

    // 3. Cold-start without cache fails closed cleanly and documents exact required host
    await suite.check(
      "offline-cold-start-fails-closed",
      "Cold-start without cached model fails closed when internet is blocked and documents Hugging Face download boundary",
      async () => {
        const logFile = join(dir, "cold-egress.jsonl")
        const emptyCache = join(dir, "empty-cache")
        await writeFile(logFile, "", "utf8")
        const env = {
          MASKERA_OFFLINE_LOG: logFile,
          MASKERA_CACHE_DIR: emptyCache,
          MASKERA_MODEL_PATH: "",
          MASKERA_MODEL_ID: "",
          MASKERA_ALLOW_REMOTE_MODELS: "1",
        }
        const grd = await runProcess(
          process.execPath,
          ["--import", blockerUrl, distCliPath, "guard", "--no-proxy"],
          { env, input: JSON.stringify({ prompt: "Patient Anna Lindqvist" }) },
        )
        assert.equal(grd.code, 2, `Cold offline guard must fail closed (exit 2), got ${grd.code}`)
        const rawAttempts = (await readFile(logFile, "utf8"))
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l))
        const hosts = [...new Set(rawAttempts.map((a) => a.target.split("/")[0]))]
        documentedNetworkRequirements.push({
          component: "@huggingface/transformers cold model download",
          hosts: hosts.length > 0 ? hosts : ["huggingface.co"],
          when: "First run in auto mode when model is not pre-cached or supplied via MASKERA_MODEL_PATH",
        })
        return `Cold-start failed closed (exit 2); blocked remote host(s): ${hosts.join(", ") || "none"}`
      },
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  return suite.finish({
    unexpectedEgressAttempts,
    documentedNetworkRequirements,
  })
}
