#!/usr/bin/env node
/**
 * Reusable performance benchmark for `@maskera/mcp`:
 *   1. CLI cold-start latency (`--version`, MCP stdio handshake, guard rules)
 *   2. Multi-turn LLM proxy redaction latency (rules & real ONNX NER) on a
 *      realistic coding-agent payload (system prompt + 25 tools + 10 turns)
 *   3. StreamingRestorer throughput on chunk-split SSE streams
 *   4. SessionVault throughput and collision resistance
 *
 * Usage:
 *   node scripts/bench-mcp.mjs
 *   node scripts/bench-mcp.mjs --json
 */

import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  createMaskeraEngine,
  redactLlmRequestBody,
  SessionVault,
  StreamingRestorer,
} from "../dist/index.js"

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, "..")
const cliPath = resolve(pkgRoot, "dist/cli.js")
const localModelsDir = resolve(pkgRoot, "../../apps/demo/public/models")
const hasLocalNerModel = existsSync(join(localModelsDir, "maskera-sv-ner-v20"))
const jsonOut = process.argv.includes("--json")

if (!existsSync(cliPath)) {
  throw new Error(
    `Built CLI not found at ${cliPath}. Run "pnpm --filter @maskera/mcp build" first.`,
  )
}

function runCli(args, stdinText = "") {
  return new Promise((resolveRun, rejectRun) => {
    const t0 = performance.now()
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8")
    })
    child.on("error", rejectRun)
    child.on("close", (code) => resolveRun({ code, ms: performance.now() - t0, stdout }))
    child.stdin.end(stdinText)
  })
}

function round(n) {
  return Math.round(n * 100) / 100
}

// 1. CLI cold-start measurements
const versionRun = await runCli(["--version"])
const mcpHandshake = await runCli(
  ["--rules-only"],
  `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } })}\n${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`,
)
const guardRules = await runCli(
  ["guard", "--rules-only"],
  JSON.stringify({ prompt: "Ring 070-174 06 58 om 19900101-2385" }),
)

// 2. Realistic multi-turn proxy body (12.6 KB system + 25 tools + 10 turns)
const sysPrompt =
  "You are a careful software engineering assistant operating in a local Swedish repository. ".repeat(
    140,
  )
const tools = Array.from({ length: 25 }, (_, i) => ({
  name: `tool_${i}`,
  description: `Executes local workspace action ${i} with strict schema validation and safety boundaries.`,
}))
const messages = Array.from({ length: 10 }, (_, i) => ({
  role: i % 2 === 0 ? "user" : "assistant",
  content:
    i === 0
      ? "Patient Anna Lindqvist (19900101-2385) i Uppsala ringde 070-174 06 58 om journalen."
      : `Turn ${i}: analyserar ärendet och kontrollerar detaljer i underlaget.`,
}))
const body1 = { model: "claude-sonnet-4-6", system: sysPrompt, tools, messages }
const body2 = {
  ...body1,
  messages: [
    ...messages,
    {
      role: "user",
      content: "Lägg även till Erik Svensson i Malmö och 070-174 06 59.",
    },
  ],
}

async function benchProxyTurns(mode) {
  const engine = createMaskeraEngine({
    defaultMode: mode,
    nerOptions:
      mode === "auto"
        ? {
            localModelPath: localModelsDir,
            model: "maskera-sv-ner-v20",
            allowRemoteModels: false,
          }
        : undefined,
  })
  const vault = new SessionVault()
  const runBody = (b) =>
    redactLlmRequestBody(
      structuredClone(b),
      async (t) => {
        if (!t.trim()) return t
        const { result } = await engine.redact(t)
        return vault.apply(t, result, "bench").redacted
      },
      { mutate: true },
    )

  const t0 = performance.now()
  await runBody(body1)
  const turn1Ms = performance.now() - t0

  const t1 = performance.now()
  await runBody(body2)
  const turn2Ms = performance.now() - t1

  const st = engine.status()
  return {
    turn1Ms: round(turn1Ms),
    turn2Ms: round(turn2Ms),
    speedup: turn2Ms > 0 ? round(turn1Ms / turn2Ms) : null,
    cacheHits: st.cacheHits,
    cacheMisses: st.cacheMisses,
  }
}

const proxyRules = await benchProxyTurns("rules")
const proxyOnnx = hasLocalNerModel ? await benchProxyTurns("auto") : null

// 3. StreamingRestorer throughput (10,000 chunks, mix of plain tokens & split placeholders)
const restorerMap = {
  "[NAMN_1]": "Anna Lindqvist",
  "[PERSONNUMMER_1]": "19900101-2385",
  "[TELEFON_1]": "070-174 06 58",
  "[EPOST_1]": "anna@example.com",
}
const restorer = new StreamingRestorer(restorerMap)
const sampleChunks = [
  "Här är svaret ",
  "till [NA",
  "MN_1] med personnummer [PERSON",
  "NUMMER_1] och telefon ",
  "[TELEFON_1]. Vanlig text utan klamrar. ",
]
const srStart = performance.now()
let srBytes = 0
for (let i = 0; i < 10_000; i++) {
  const out = restorer.push(sampleChunks[i % sampleChunks.length])
  srBytes += out.length
}
srBytes += restorer.flush().length
const srMs = performance.now() - srStart

// 4. SessionVault throughput (5,000 distinct entities + 10,000 seeded literal collisions)
const vaultBench = new SessionVault()
const rulesEngine = createMaskeraEngine({ defaultMode: "rules" })
const seededText = `${Array.from({ length: 10_000 }, (_, i) => `[EPOST_${i + 1}]`).join(" ")} test@example.com`
const { result: seededResult } = await rulesEngine.redact(seededText)
const vbStart = performance.now()
vaultBench.apply(seededText, seededResult, "v1")
const vaultCollisionMs = performance.now() - vbStart

const report = {
  cli: {
    versionMs: round(versionRun.ms),
    mcpHandshakeMs: round(mcpHandshake.ms),
    guardRulesMs: round(guardRules.ms),
  },
  proxyMultiTurn: {
    payloadChars: JSON.stringify(body1).length,
    rules: proxyRules,
    onnx: proxyOnnx,
  },
  streamingRestorer: {
    chunks: 10_000,
    outputChars: srBytes,
    ms: round(srMs),
    chunksPerSec: Math.round(10_000 / (srMs / 1000)),
  },
  vaultCollision10kMs: round(vaultCollisionMs),
}

if (jsonOut) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log("@maskera/mcp benchmark:")
  console.log(
    `  CLI cold start:     version=${report.cli.versionMs}ms, mcp_handshake=${report.cli.mcpHandshakeMs}ms, guard_rules=${report.cli.guardRulesMs}ms`,
  )
  console.log(
    `  Proxy rules (16KB): turn1=${proxyRules.turn1Ms}ms -> turn2=${proxyRules.turn2Ms}ms (${proxyRules.speedup}x, hits=${proxyRules.cacheHits})`,
  )
  if (proxyOnnx) {
    console.log(
      `  Proxy ONNX  (16KB): turn1=${proxyOnnx.turn1Ms}ms -> turn2=${proxyOnnx.turn2Ms}ms (${proxyOnnx.speedup}x, hits=${proxyOnnx.cacheHits})`,
    )
  }
  console.log(
    `  StreamingRestorer:  10,000 chunks in ${report.streamingRestorer.ms}ms (${report.streamingRestorer.chunksPerSec.toLocaleString()} chunks/s)`,
  )
  console.log(`  Vault 10k collide:  ${report.vaultCollision10kMs}ms`)
}
