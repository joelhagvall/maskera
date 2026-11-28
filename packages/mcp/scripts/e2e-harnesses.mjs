#!/usr/bin/env node
/**
 * Reusable end-to-end verification suite running the REAL locally installed
 * AI coding harnesses (`claude`, `codex`, `opencode`) against `@maskera/mcp`
 * (MCP stdio server, local LLM proxy, and hook guard) with zero paid API calls.
 *
 * Usage:
 *   node scripts/e2e-harnesses.mjs
 *   node scripts/e2e-harnesses.mjs --only claude,codex
 *   node scripts/e2e-harnesses.mjs --mode rules|auto|both
 *   node scripts/e2e-harnesses.mjs --json
 *   node scripts/e2e-harnesses.mjs --keep-tmp
 */

import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib"
import { hasLocalNerModel, localModelId, localModelsDir } from "../audit/lib/harness.mjs"
import {
  assertWithinBudget,
  DEFAULT_LIVE_MAX_USD,
  extractClaudeCostUsd,
  parseMaxUsd,
} from "../audit/lib/live-budget.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, "..")
const cliPath = process.env.MASKERA_MCP_CLI
  ? resolve(process.env.MASKERA_MCP_CLI)
  : resolve(pkgRoot, "dist/cli.js")

function parseCliFlags(argv) {
  let only = null
  let mode = hasLocalNerModel ? "both" : "rules"
  let live = false
  let maxUsd = DEFAULT_LIVE_MAX_USD
  let maxUsdExplicit = false
  let claudeModel = "haiku"
  let opencodeModel = "opencode-go/glm-5.3-flash"
  let opencodeUpstream = "https://opencode.ai/zen/go"
  let jsonOut = false
  let keepTmp = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--") continue
    if (arg === "--only") {
      only = new Set(
        (argv[++i] ?? "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      )
    } else if (arg.startsWith("--only=")) {
      only = new Set(
        arg
          .slice("--only=".length)
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      )
    } else if (arg === "--mode") {
      mode = (argv[++i] ?? "rules").trim().toLowerCase()
    } else if (arg.startsWith("--mode=")) {
      mode = arg.slice("--mode=".length).trim().toLowerCase()
    } else if (arg === "--live") {
      live = true
    } else if (arg === "--max-usd") {
      maxUsd = parseMaxUsd(argv[++i] ?? "")
      maxUsdExplicit = true
    } else if (arg.startsWith("--max-usd=")) {
      maxUsd = parseMaxUsd(arg.slice("--max-usd=".length))
      maxUsdExplicit = true
    } else if (arg === "--claude-model") {
      claudeModel = argv[++i] ?? claudeModel
    } else if (arg === "--opencode-model") {
      opencodeModel = argv[++i] ?? opencodeModel
    } else if (arg === "--opencode-upstream") {
      opencodeUpstream = argv[++i] ?? opencodeUpstream
    } else if (arg === "--json") {
      jsonOut = true
    } else if (arg === "--keep-tmp") {
      keepTmp = true
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Usage: node scripts/e2e-harnesses.mjs [options]",
          "  --only <list>             Comma-separated harnesses: claude,codex,opencode",
          "  --mode <m>                rules | auto | both (offline mock lane; default: both if local ONNX exists)",
          "  --live                    Opt-in live subscription proof (Claude Max, Codex ChatGPT, OpenCode Go)",
          `  --max-usd <amount>        USD budget cap for --live runs (default: ${DEFAULT_LIVE_MAX_USD})`,
          "  --claude-model <m>        Model alias for --live claude (default: haiku)",
          "  --opencode-model <m>      Model id for --live opencode (default: opencode-go/glm-5.3-flash)",
          "  --opencode-upstream <u>   Upstream base URL for --live opencode proxy (default: https://opencode.ai/zen/go)",
          "  --json                    Print machine-readable JSON summary",
          "  --keep-tmp                Preserve temporary directories for debugging",
        ].join("\n"),
      )
      process.exit(0)
    } else {
      throw new Error(`Unknown option: ${arg}`)
    }
  }
  if (maxUsdExplicit && !live) {
    throw new Error("--max-usd requires --live")
  }
  if (!["rules", "auto", "both"].includes(mode)) {
    throw new Error(`Invalid --mode "${mode}": expected rules, auto, or both.`)
  }
  if ((live || mode === "auto" || mode === "both") && !hasLocalNerModel) {
    throw new Error(`Local ONNX model not found at ${join(localModelsDir, localModelId)}`)
  }
  return {
    only,
    mode,
    live,
    maxUsd,
    claudeModel,
    opencodeModel,
    opencodeUpstream,
    jsonOut,
    keepTmp,
  }
}

const opts = parseCliFlags(process.argv.slice(2))

if (!existsSync(cliPath)) {
  throw new Error(
    `Built CLI not found at ${cliPath}. Run "pnpm --filter @maskera/mcp build" first.`,
  )
}

function hasBinary(name) {
  const res = spawnSync("which", [name], { encoding: "utf8" })
  return res.status === 0 && Boolean(res.stdout.trim())
}

function getBinaryVersion(name) {
  const res = spawnSync(name, ["--version"], { encoding: "utf8", timeout: 5000 })
  return (res.stdout || res.stderr || "").trim().split("\n")[0] || "unknown"
}

function runCmd(bin, args, { cwd, env = {}, timeoutMs = 30_000 } = {}) {
  return new Promise((resolveRun) => {
    const t0 = performance.now()
    const mergedEnv = { ...process.env }
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete mergedEnv[k]
      else mergedEnv[k] = v
    }
    const child = spawn(bin, args, {
      cwd,
      env: mergedEnv,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, timeoutMs)
    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8")
    })
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8")
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolveRun({
        code,
        timedOut,
        ms: Math.round(performance.now() - t0),
        stdout,
        stderr,
      })
    })
  })
}

async function startProxy(upstreamUrl, extraArgs = [], envExtra = {}) {
  const upstreamArgs = upstreamUrl ? ["--upstream", upstreamUrl] : []
  const child = spawn(
    process.execPath,
    [cliPath, "proxy", "--port", "0", ...upstreamArgs, ...extraArgs],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...envExtra },
    },
  )
  let stderr = ""
  const url = await new Promise((res, rej) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      rej(new Error(`proxy start timeout:\n${stderr}`))
    }, 10_000)
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8")
      const m = stderr.match(/listening on (http:\/\/[^\s]+)/)
      if (m) {
        clearTimeout(timer)
        res(m[1])
      }
    })
    child.on("exit", (code) => {
      clearTimeout(timer)
      rej(new Error(`proxy exited early (${code}):\n${stderr}`))
    })
  })
  return {
    url,
    getStderr: () => stderr,
    async status() {
      const r = await fetch(`${url}/_maskera/status`)
      return r.json()
    },
    async stop() {
      if (child.exitCode !== null) return
      const done = new Promise((r) => child.once("close", r))
      child.kill("SIGTERM")
      await done
    },
  }
}

function startMockUpstream(handler) {
  const seen = []
  const server = createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    let rawBuf = Buffer.concat(chunks)
    const enc = String(req.headers["content-encoding"] ?? "").toLowerCase()
    if (enc === "gzip") rawBuf = gunzipSync(rawBuf)
    else if (enc === "deflate") rawBuf = inflateSync(rawBuf)
    else if (enc === "br") rawBuf = brotliDecompressSync(rawBuf)
    const body = rawBuf.toString("utf8")
    const entry = { method: req.method, url: req.url, headers: req.headers, body }
    seen.push(entry)
    await handler(entry, res, seen)
  })
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen)
      const addr = server.address()
      resolveListen({
        url: `http://127.0.0.1:${addr.port}`,
        seen,
        close: () => new Promise((r) => server.close(r)),
      })
    })
  })
}

const NER_ENV = {
  MASKERA_MODEL_PATH: localModelsDir,
  MASKERA_MODEL_ID: localModelId,
  MASKERA_ALLOW_REMOTE_MODELS: "0",
}

const SECRETS_RULES = ["19900101-2385", "070-174 06 58", "anna@example.com"]
const SECRETS_NER = ["Anna Lindqvist", "Uppsala", ...SECRETS_RULES]

function assertNoLeaks(seen, secrets, label) {
  for (const req of seen) {
    for (const secret of secrets) {
      assert.equal(
        req.body.includes(secret),
        false,
        `[${label}] Raw PII "${secret}" leaked upstream on ${req.method} ${req.url}!`,
      )
    }
  }
}

function findToken(text, label, fallback) {
  const m = text.match(new RegExp(`\\[${label}_\\d+\\]`))
  return m ? m[0] : fallback
}

function splitTokenMidway(token) {
  const cut = Math.max(2, Math.floor(token.length / 2))
  return [token.slice(0, cut), token.slice(cut)]
}

// -----------------------------------------------------------------------------
// 1. Claude Code E2E (MCP stdio + Proxy + Guard Hook)
// -----------------------------------------------------------------------------
async function testClaudeCode(workRoot, lane) {
  const isNer = lane === "auto"
  const dir = join(workRoot, `claude-${lane}`)
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, "klient.txt"),
    "Patient Anna Lindqvist i Uppsala (19900101-2385), tel 070-174 06 58, epost anna@example.com.\n",
    "utf8",
  )

  let toolStep = 0
  let discoveredMaskeraTools = []
  let readToolResultText = ""
  let userPromptText = ""
  const mock = await startMockUpstream((req, res) => {
    if (req.method === "HEAD") {
      res.writeHead(200)
      res.end()
      return
    }
    if (req.url.includes("count_tokens")) {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ input_tokens: 64 }))
      return
    }
    const parsed = JSON.parse(req.body || "{}")
    const toolNames = (parsed.tools || []).map((t) => t.name)
    const maskeraTools = toolNames.filter((n) => n.includes("maskera_"))
    if (maskeraTools.length > 0) discoveredMaskeraTools = maskeraTools

    // Capture redacted user prompt and tool_result from maskera_read_file
    for (const msg of parsed.messages || []) {
      if (msg.role === "user") {
        const blocks =
          typeof msg.content === "string"
            ? [msg.content]
            : Array.isArray(msg.content)
              ? msg.content.filter((b) => b.type === "text").map((b) => b.text)
              : []
        const promptBlock = blocks.find(
          (t) => t.includes("klient.txt") && !t.includes("<system-reminder>"),
        )
        if (promptBlock) userPromptText = promptBlock
      }
      if (Array.isArray(msg.content)) {
        for (const blk of msg.content) {
          if (blk.type === "tool_result" && blk.tool_use_id === "toolu_read") {
            readToolResultText =
              typeof blk.content === "string" ? blk.content : JSON.stringify(blk.content)
          }
        }
      }
    }

    const readTool = maskeraTools.find((n) => n.endsWith("maskera_read_file"))
    const writeTool = maskeraTools.find((n) => n.endsWith("maskera_write_file"))

    res.writeHead(200, { "content-type": "text/event-stream" })
    const emitSse = (blocks, stopReason) => {
      res.write(
        `event: message_start\ndata: ${JSON.stringify({
          type: "message_start",
          message: {
            id: `msg_${toolStep}`,
            type: "message",
            role: "assistant",
            model: parsed.model || "claude-sonnet-4-6",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 15, output_tokens: 1 },
          },
        })}\n\n`,
      )
      blocks.forEach((b, idx) => {
        if (b.type === "tool_use") {
          res.write(
            `event: content_block_start\ndata: ${JSON.stringify({
              type: "content_block_start",
              index: idx,
              content_block: { type: "tool_use", id: b.id, name: b.name, input: {} },
            })}\n\n`,
          )
          res.write(
            `event: content_block_delta\ndata: ${JSON.stringify({
              type: "content_block_delta",
              index: idx,
              delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) },
            })}\n\n`,
          )
        } else {
          res.write(
            `event: content_block_start\ndata: ${JSON.stringify({
              type: "content_block_start",
              index: idx,
              content_block: { type: "text", text: "" },
            })}\n\n`,
          )
          for (const part of b.chunks) {
            res.write(
              `event: content_block_delta\ndata: ${JSON.stringify({
                type: "content_block_delta",
                index: idx,
                delta: { type: "text_delta", text: part },
              })}\n\n`,
            )
          }
        }
        res.write(
          `event: content_block_stop\ndata: ${JSON.stringify({
            type: "content_block_stop",
            index: idx,
          })}\n\n`,
        )
      })
      res.write(
        `event: message_delta\ndata: ${JSON.stringify({
          type: "message_delta",
          delta: { stop_reason: stopReason, stop_sequence: null },
          usage: { output_tokens: 20 },
        })}\n\n`,
      )
      res.write(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`)
      res.end()
    }

    if (readTool && toolStep === 0) {
      toolStep = 1
      emitSse(
        [
          {
            type: "tool_use",
            id: "toolu_read",
            name: readTool,
            input: { path: "klient.txt", session_id: "claude-s1" },
          },
        ],
        "tool_use",
      )
      return
    }
    if (writeTool && toolStep === 1) {
      toolStep = 2
      const draftText = isNer
        ? "Svar till [NAMN_1] i [PLATS_1]: [PERSONNUMMER_1], [TELEFON_1], [EPOST_1]."
        : "Svar till klient: [PERSONNUMMER_1], [TELEFON_1], [EPOST_1]."
      emitSse(
        [
          {
            type: "tool_use",
            id: "toolu_write",
            name: writeTool,
            input: { path: "svar-claude.txt", session_id: "claude-s1", text: draftText },
          },
        ],
        "tool_use",
      )
      return
    }
    // Split actual prompt placeholders across SSE chunks to prove streaming restore in Claude Code!
    const pnrTok = findToken(userPromptText, "PERSONNUMMER", "[PERSONNUMMER_1]")
    const [pnrA, pnrB] = splitTokenMidway(pnrTok)
    const nameTok = findToken(userPromptText, "NAMN", "[NAMN_1]")
    const [nameA, nameB] = splitTokenMidway(nameTok)
    const chunks = isNer
      ? [`Klart för ${nameA}`, `${nameB} (${pnrA}`, `${pnrB})!`]
      : [`Klart för ${pnrA}`, `${pnrB}!`]
    emitSse([{ type: "text", chunks }], "end_turn")
  })

  const mcpArgs = isNer ? ["--root", dir] : ["--rules-only", "--root", dir]
  const proxyArgs = isNer ? [] : ["--rules-only"]
  const extraEnv = isNer ? NER_ENV : {}
  const proxy = await startProxy(mock.url, proxyArgs, extraEnv)

  try {
    const mcpCfgPath = join(dir, "mcp.json")
    await writeFile(
      mcpCfgPath,
      JSON.stringify({
        mcpServers: {
          maskera: {
            command: process.execPath,
            args: [cliPath, ...mcpArgs],
            env: extraEnv,
          },
        },
      }),
    )

    const claudeHome = join(dir, "claude-home")
    await mkdir(claudeHome, { recursive: true })
    await runCmd("git", ["init", "-q"], { cwd: dir })
    await writeFile(
      join(dir, "CLAUDE.md"),
      [
        "# Demo Repo Notes",
        "",
        "## Git",
        "",
        "Always read the existing files before editing code or running git commands in this repository.",
        "Never commit or push changes unless explicitly asked and always verify tests before finishing.",
        "Even when a long English repository guide mentions a maintainer once, keep coding instructions",
        "on deterministic rules without Swedish NER false positives.",
        "",
        "```bash",
        "pnpm --filter @maskera/mcp build",
        "```",
        "",
        "På svenska: sammanfatta ärendet kort utan att läcka personuppgifter.",
        "",
      ].join("\n"),
      "utf8",
    )

    const prompt = isNer
      ? "Läs klient.txt för Anna Lindqvist (19900101-2385) och skriv svar-claude.txt"
      : "Läs klient.txt för 19900101-2385 och skriv svar-claude.txt"

    const res = await runCmd(
      "claude",
      [
        "-p",
        "--no-session-persistence",
        "--setting-sources",
        "project",
        "--disable-slash-commands",
        "--strict-mcp-config",
        "--mcp-config",
        mcpCfgPath,
        "--permission-mode",
        "bypassPermissions",
        "--tools",
        "",
        "--model",
        "claude-sonnet-4-6",
        "--output-format",
        "json",
        prompt,
      ],
      {
        cwd: dir,
        env: {
          HOME: claudeHome,
          ANTHROPIC_BASE_URL: proxy.url,
          ANTHROPIC_API_KEY: "sk-ant-local-e2e-only",
        },
      },
    )

    assert.equal(res.timedOut, false, `claude timed out:\n${res.stderr}`)
    assert.equal(res.code, 0, `claude exited ${res.code}:\n${res.stdout}\n${res.stderr}`)
    const out = JSON.parse(res.stdout)
    assert.equal(out.is_error, false, `claude returned error: ${res.stdout}`)
    assert.equal(
      discoveredMaskeraTools.length,
      9,
      `expected 9 MCP tools in claude, got ${discoveredMaskeraTools.length}`,
    )
    assert.equal(toolStep, 2, "claude did not complete maskera_read_file + maskera_write_file")
    assert.equal(readToolResultText.includes("[PERSONNUMMER_1]"), true)

    // Verify ZERO raw PII ever reached upstream!
    assertNoLeaks(mock.seen, isNer ? SECRETS_NER : SECRETS_RULES, `claude-${lane}`)
    // Verify Claude Code actually loaded project CLAUDE.md via <system-reminder>
    // and kept English boilerplate uncorrupted while staying under the redaction cap.
    const allUpstreamBodies = mock.seen.map((entry) => entry.body).join("\n")
    assert.equal(
      allUpstreamBodies.includes("<system-reminder>") &&
        allUpstreamBodies.includes("Always read the existing files before editing code"),
      true,
      `claude [${lane}] did not preserve English project CLAUDE.md <system-reminder> boilerplate`,
    )

    // Verify restored file written directly to disk by maskera_write_file!
    const written = await readFile(join(dir, "svar-claude.txt"), "utf8")
    const expectedFile = isNer
      ? "Svar till Anna Lindqvist i Uppsala: 19900101-2385, 070-174 06 58, anna@example.com."
      : "Svar till klient: 19900101-2385, 070-174 06 58, anna@example.com."
    assert.equal(written, expectedFile, `claude restored file mismatch: ${written}`)

    // Verify chunk-split SSE restore in Claude's final text!
    assert.equal(
      out.result.includes("19900101-2385"),
      true,
      `claude SSE did not restore personnummer: ${out.result}`,
    )
    if (isNer) {
      assert.equal(
        out.result.includes("Anna Lindqvist"),
        true,
        `claude SSE did not restore NER name: ${out.result}`,
      )
    }

    const proxyStatus = await proxy.status()
    assert.equal(
      proxyStatus.engine.cacheHits > 0,
      true,
      `expected proxy span cache hits across multi-turn claude run, got ${JSON.stringify(proxyStatus.engine)}`,
    )
    const maxClaudeRedactions = isNer ? 120 : 25
    assert.equal(
      proxyStatus.total_redactions <= maxClaudeRedactions,
      true,
      `claude [${lane}] over-masked English system/boilerplate: got ${proxyStatus.total_redactions} redactions (max ${maxClaudeRedactions})`,
    )

    // Guard hook verification (rules lane is fast and covers hook protocol)
    let hookMs = 0
    if (!isNer) {
      const seenBefore = mock.seen.length
      const settingsPath = join(dir, "settings-guard.json")
      await writeFile(
        settingsPath,
        JSON.stringify({
          hooks: {
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: "command",
                    command: `${JSON.stringify(process.execPath)} ${JSON.stringify(cliPath)} guard --rules-only`,
                  },
                ],
              },
            ],
          },
        }),
      )
      const hookRes = await runCmd(
        "claude",
        [
          "-p",
          "--no-session-persistence",
          "--strict-mcp-config",
          "--settings",
          settingsPath,
          "--tools",
          "",
          "--model",
          "claude-sonnet-4-6",
          "--output-format",
          "json",
          "Ring 070-174 06 58 genast",
        ],
        {
          cwd: dir,
          env: {
            ANTHROPIC_BASE_URL: proxy.url,
            ANTHROPIC_API_KEY: "sk-ant-local-e2e-only",
          },
        },
      )
      hookMs = hookRes.ms
      const hookOut = JSON.parse(hookRes.stdout)
      assert.equal(hookOut.num_turns, 0, "guard hook failed to block PII prompt before main turn")
      // Even if Claude Code fires a background session-title call after the
      // hook blocks the main turn, maskera-mcp proxy must still redact it.
      assertNoLeaks(mock.seen.slice(seenBefore), ["070-174 06 58"], "claude-guard-hook")
    }

    return {
      ms: res.ms,
      hookMs,
      turns: out.num_turns,
      tools: discoveredMaskeraTools.length,
      cacheHits: proxyStatus.engine.cacheHits,
      cacheMisses: proxyStatus.engine.cacheMisses,
      redactions: proxyStatus.total_redactions,
    }
  } finally {
    await proxy.stop()
    await mock.close()
  }
}

// -----------------------------------------------------------------------------
// 2. Codex CLI E2E (MCP stdio + Proxy + WebSocket 426 fallback + Annotations)
// -----------------------------------------------------------------------------
async function testCodex(workRoot, lane) {
  const isNer = lane === "auto"
  const dir = join(workRoot, `codex-${lane}`)
  const codexHome = join(dir, "codex-home")
  await mkdir(codexHome, { recursive: true })
  await writeFile(
    join(dir, "klient.txt"),
    "Patient Anna Lindqvist i Uppsala (19900101-2385), tel 070-174 06 58, epost anna@example.com.\n",
    "utf8",
  )

  let turn = 0
  let discoveredTools = []
  let readOutputText = ""
  let userPromptText = ""
  const mock = await startMockUpstream((req, res) => {
    const parsed = JSON.parse(req.body || "{}")
    const nsTool = (parsed.tools || []).find((t) => t.name === "mcp__maskera")
    if (nsTool && Array.isArray(nsTool.tools)) {
      discoveredTools = nsTool.tools.map((t) => t.name)
    }
    for (const item of parsed.input || []) {
      if (item.role === "user") {
        const text =
          typeof item.content === "string"
            ? item.content
            : Array.isArray(item.content)
              ? item.content.map((c) => c.text ?? "").join("\n")
              : ""
        if (text.includes("klient.txt")) userPromptText = text
      }
      if (item.type === "function_call_output" && item.call_id === "call_read") {
        readOutputText = typeof item.output === "string" ? item.output : JSON.stringify(item.output)
      }
    }

    turn += 1
    res.writeHead(200, { "content-type": "text/event-stream" })
    const sendResponse = (items) => {
      res.write(
        `event: response.created\ndata: ${JSON.stringify({
          type: "response.created",
          response: { id: `resp_${turn}`, object: "response", status: "in_progress", output: [] },
        })}\n\n`,
      )
      items.forEach((item, idx) => {
        if (item.type === "function_call") {
          res.write(
            `event: response.output_item.added\ndata: ${JSON.stringify({
              type: "response.output_item.added",
              output_index: idx,
              item: { ...item, status: "in_progress", arguments: "" },
            })}\n\n`,
          )
          res.write(
            `event: response.function_call_arguments.delta\ndata: ${JSON.stringify({
              type: "response.function_call_arguments.delta",
              item_id: item.id,
              output_index: idx,
              delta: item.arguments,
            })}\n\n`,
          )
          res.write(
            `event: response.function_call_arguments.done\ndata: ${JSON.stringify({
              type: "response.function_call_arguments.done",
              item_id: item.id,
              output_index: idx,
              arguments: item.arguments,
            })}\n\n`,
          )
          res.write(
            `event: response.output_item.done\ndata: ${JSON.stringify({
              type: "response.output_item.done",
              output_index: idx,
              item: { ...item, status: "completed" },
            })}\n\n`,
          )
        } else {
          res.write(
            `event: response.output_item.added\ndata: ${JSON.stringify({
              type: "response.output_item.added",
              output_index: idx,
              item: { ...item, status: "in_progress", content: [] },
            })}\n\n`,
          )
          res.write(
            `event: response.content_part.added\ndata: ${JSON.stringify({
              type: "response.content_part.added",
              item_id: item.id,
              output_index: idx,
              content_index: 0,
              part: { type: "output_text", text: "" },
            })}\n\n`,
          )
          for (const part of item.chunks) {
            res.write(
              `event: response.output_text.delta\ndata: ${JSON.stringify({
                type: "response.output_text.delta",
                item_id: item.id,
                output_index: idx,
                content_index: 0,
                delta: part,
              })}\n\n`,
            )
          }
          const fullText = item.chunks.join("")
          res.write(
            `event: response.output_text.done\ndata: ${JSON.stringify({
              type: "response.output_text.done",
              item_id: item.id,
              output_index: idx,
              content_index: 0,
              text: fullText,
            })}\n\n`,
          )
          res.write(
            `event: response.content_part.done\ndata: ${JSON.stringify({
              type: "response.content_part.done",
              item_id: item.id,
              output_index: idx,
              content_index: 0,
              part: { type: "output_text", text: fullText },
            })}\n\n`,
          )
          res.write(
            `event: response.output_item.done\ndata: ${JSON.stringify({
              type: "response.output_item.done",
              output_index: idx,
              item: {
                id: item.id,
                type: "message",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text: fullText }],
              },
            })}\n\n`,
          )
        }
      })
      res.write(
        `event: response.completed\ndata: ${JSON.stringify({
          type: "response.completed",
          response: {
            id: `resp_${turn}`,
            object: "response",
            status: "completed",
            output: items.map((it) =>
              it.type === "function_call"
                ? { ...it, status: "completed" }
                : {
                    id: it.id,
                    type: "message",
                    role: "assistant",
                    status: "completed",
                    content: [{ type: "output_text", text: it.chunks.join("") }],
                  },
            ),
            usage: { input_tokens: 15, output_tokens: 15, total_tokens: 30 },
          },
        })}\n\n`,
      )
      res.end()
    }

    if (turn === 1) {
      sendResponse([
        {
          id: "fc_1",
          type: "function_call",
          call_id: "call_read",
          name: "maskera_read_file",
          namespace: "mcp__maskera",
          arguments: JSON.stringify({ path: "klient.txt", session_id: "codex-s1" }),
        },
      ])
      return
    }
    if (turn === 2) {
      const draftText = isNer
        ? "Codex svar till [NAMN_1] i [PLATS_1]: [PERSONNUMMER_1], [TELEFON_1], [EPOST_1]."
        : "Codex svar: [PERSONNUMMER_1], [TELEFON_1], [EPOST_1]."
      sendResponse([
        {
          id: "fc_2",
          type: "function_call",
          call_id: "call_write",
          name: "maskera_write_file",
          namespace: "mcp__maskera",
          arguments: JSON.stringify({
            path: "svar-codex.txt",
            session_id: "codex-s1",
            text: draftText,
          }),
        },
      ])
      return
    }
    const pnrTok = findToken(userPromptText, "PERSONNUMMER", "[PERSONNUMMER_1]")
    const [pnrA, pnrB] = splitTokenMidway(pnrTok)
    const nameTok = findToken(userPromptText, "NAMN", "[NAMN_1]")
    const [nameA, nameB] = splitTokenMidway(nameTok)
    const chunks = isNer
      ? [`Codex klart för ${nameA}`, `${nameB} (${pnrA}`, `${pnrB})!`]
      : [`Codex klart (${pnrA}`, `${pnrB})!`]
    sendResponse([{ id: "msg_final", type: "message", role: "assistant", chunks }])
  })

  const mcpArgs = isNer ? ["--root", dir] : ["--rules-only", "--root", dir]
  const proxyArgs = isNer ? [] : ["--rules-only"]
  const extraEnv = isNer ? NER_ENV : {}
  const proxy = await startProxy(mock.url, proxyArgs, extraEnv)

  try {
    const mcpArgsToml = JSON.stringify([cliPath, ...mcpArgs])
    const envTomlEntries = Object.entries(extraEnv)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(", ")

    const codexArgs = [
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--disable",
      "plugins",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      "--json",
      "-C",
      dir,
      "-c",
      'model="gpt-5.4"',
      "-c",
      `openai_base_url=${JSON.stringify(`${proxy.url}/v1`)}`,
      "-c",
      `mcp_servers.maskera.command=${JSON.stringify(process.execPath)}`,
      "-c",
      `mcp_servers.maskera.args=${mcpArgsToml}`,
      ...(envTomlEntries ? ["-c", `mcp_servers.maskera.env={${envTomlEntries}}`] : []),
      isNer
        ? "Läs klient.txt för Anna Lindqvist (19900101-2385) och skriv svar-codex.txt"
        : "Läs klient.txt för 19900101-2385 och skriv svar-codex.txt",
    ]

    const res = await runCmd("codex", codexArgs, {
      cwd: dir,
      env: {
        CODEX_HOME: codexHome,
        OPENAI_API_KEY: "sk-local-e2e-only",
        OPENAI_BASE_URL: `${proxy.url}/v1`,
      },
    })

    assert.equal(res.timedOut, false, `codex timed out:\n${res.stderr}`)
    assert.equal(res.code, 0, `codex exited ${res.code}:\n${res.stdout}\n${res.stderr}`)

    const events = res.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))

    // Verify ZERO WebSocket reconnect retries (our 426 Upgrade Required fix!)
    const reconnects = events.filter(
      (e) => e.type === "error" && String(e.message || "").includes("Reconnecting"),
    )
    assert.equal(
      reconnects.length,
      0,
      `codex had WebSocket reconnect retries: ${JSON.stringify(reconnects)}`,
    )
    assert.equal(
      discoveredTools.length,
      9,
      `expected 9 MCP tools in codex namespace, got ${discoveredTools.length}`,
    )
    assert.equal(turn, 3, `expected 3 codex turns, got ${turn}`)
    assert.equal(readOutputText.includes("[PERSONNUMMER_1]"), true)

    // Verify ZERO raw PII ever reached upstream!
    assertNoLeaks(mock.seen, isNer ? SECRETS_NER : SECRETS_RULES, `codex-${lane}`)

    // Verify restored file on disk!
    const written = await readFile(join(dir, "svar-codex.txt"), "utf8")
    const expectedFile = isNer
      ? "Codex svar till Anna Lindqvist i Uppsala: 19900101-2385, 070-174 06 58, anna@example.com."
      : "Codex svar: 19900101-2385, 070-174 06 58, anna@example.com."
    assert.equal(written, expectedFile, `codex restored file mismatch: ${written}`)

    // Verify chunk-split SSE restore in Codex's final message!
    const finalMsg = events.find((e) => e.item?.type === "agent_message")?.item?.text ?? ""
    assert.equal(
      finalMsg.includes("19900101-2385"),
      true,
      `codex SSE did not restore personnummer: ${finalMsg}`,
    )
    if (isNer) {
      assert.equal(
        finalMsg.includes("Anna Lindqvist"),
        true,
        `codex SSE did not restore NER name: ${finalMsg}`,
      )
    }

    const proxyStatus = await proxy.status()
    assert.equal(
      proxyStatus.engine.cacheHits > 0,
      true,
      `expected proxy span cache hits across multi-turn codex run`,
    )
    const maxCodexRedactions = isNer ? 100 : 20
    assert.equal(
      proxyStatus.total_redactions <= maxCodexRedactions,
      true,
      `codex [${lane}] over-masked English system/boilerplate: got ${proxyStatus.total_redactions} redactions (max ${maxCodexRedactions})`,
    )

    return {
      ms: res.ms,
      turns: turn,
      tools: discoveredTools.length,
      reconnects: reconnects.length,
      cacheHits: proxyStatus.engine.cacheHits,
      cacheMisses: proxyStatus.engine.cacheMisses,
      redactions: proxyStatus.total_redactions,
    }
  } finally {
    await proxy.stop()
    await mock.close()
  }
}

// -----------------------------------------------------------------------------
// 3. OpenCode E2E (isolated `opencode serve` + MCP stdio + Code Mode + Proxy)
// -----------------------------------------------------------------------------
async function testOpenCode(workRoot, lane) {
  const isNer = lane === "auto"
  const dir = join(workRoot, `opencode-${lane}`)
  await mkdir(dir, { recursive: true })
  await runCmd("git", ["init", "-q"], { cwd: dir })
  await writeFile(
    join(dir, "klient.txt"),
    "Patient Anna Lindqvist i Uppsala (19900101-2385), tel 070-174 06 58, epost anna@example.com.\n",
    "utf8",
  )

  let agentTurn = 0
  let execToolResult = ""
  let userPromptText = ""
  const mock = await startMockUpstream((req, res) => {
    const parsed = JSON.parse(req.body || "{}")
    const toolNames = (parsed.tools || []).map((t) => t.function?.name || t.name).filter(Boolean)
    const isMainAgentReq = toolNames.includes("execute")

    for (const msg of parsed.messages || []) {
      if (msg.role === "user") {
        const text =
          typeof msg.content === "string"
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content.map((c) => c.text ?? "").join("\n")
              : ""
        if (text.includes("klient.txt")) userPromptText = text
      }
      if (msg.role === "tool" && msg.tool_call_id === "oc_exec_1") {
        execToolResult = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
      }
    }

    res.writeHead(200, { "content-type": "text/event-stream" })
    if (!isMainAgentReq) {
      // Title / auxiliary call without tools
      res.write(
        `data: ${JSON.stringify({
          id: "oc_aux",
          object: "chat.completion.chunk",
          created: 1,
          model: "mock-model",
          choices: [
            {
              index: 0,
              delta: { role: "assistant", content: "Maskera test" },
              finish_reason: "stop",
            },
          ],
        })}\n\n`,
      )
      res.write("data: [DONE]\n\n")
      res.end()
      return
    }

    agentTurn += 1
    if (agentTurn === 1) {
      const draftText = isNer
        ? "OpenCode svar till [NAMN_1] i [PLATS_1]: [PERSONNUMMER_1], [TELEFON_1], [EPOST_1]."
        : "OpenCode svar: [PERSONNUMMER_1], [TELEFON_1], [EPOST_1]."
      const code = [
        'const r = await tools.maskera.maskera_read_file({ path: "klient.txt", session_id: "oc-s1" });',
        `const w = await tools.maskera.maskera_write_file({ path: "svar-opencode.txt", session_id: "oc-s1", text: ${JSON.stringify(draftText)} });`,
        "return { read: r, write: w };",
      ].join("\n")
      res.write(
        `data: ${JSON.stringify({
          id: "oc_t1",
          object: "chat.completion.chunk",
          created: 1,
          model: "mock-model",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: "oc_exec_1",
                    type: "function",
                    function: { name: "execute", arguments: JSON.stringify({ code }) },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        })}\n\n`,
      )
      res.write(
        `data: ${JSON.stringify({
          id: "oc_t1",
          object: "chat.completion.chunk",
          created: 1,
          model: "mock-model",
          choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        })}\n\n`,
      )
      res.write("data: [DONE]\n\n")
      res.end()
      return
    }

    const telTok = findToken(userPromptText, "TELEFON", "[TELEFON_1]")
    const [telA, telB] = splitTokenMidway(telTok)
    const nameTok = findToken(userPromptText, "NAMN", "[NAMN_1]")
    const [nameA, nameB] = splitTokenMidway(nameTok)
    const parts = isNer
      ? [`OpenCode klart för ${nameA}`, `${nameB} (${telA}`, `${telB})!`]
      : [`OpenCode klart (${telA}`, `${telB})!`]
    parts.forEach((p, i) => {
      res.write(
        `data: ${JSON.stringify({
          id: "oc_t2",
          object: "chat.completion.chunk",
          created: 1,
          model: "mock-model",
          choices: [
            {
              index: 0,
              delta: i === 0 ? { role: "assistant", content: p } : { content: p },
              finish_reason: null,
            },
          ],
        })}\n\n`,
      )
    })
    res.write(
      `data: ${JSON.stringify({
        id: "oc_t2",
        object: "chat.completion.chunk",
        created: 1,
        model: "mock-model",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      })}\n\n`,
    )
    res.write("data: [DONE]\n\n")
    res.end()
  })

  const mcpArgs = isNer ? ["--root", dir] : ["--rules-only", "--root", dir]
  const proxyArgs = isNer ? [] : ["--rules-only"]
  const extraEnv = isNer ? NER_ENV : {}
  const proxy = await startProxy(mock.url, proxyArgs, extraEnv)

  const cfgDir = join(dir, ".config", "opencode")
  await mkdir(cfgDir, { recursive: true })
  await writeFile(
    join(cfgDir, "opencode.json"),
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        provider: {
          "maskera-local": {
            npm: "@ai-sdk/openai-compatible",
            name: "Maskera Local",
            options: { baseURL: `${proxy.url}/v1`, apiKey: "sk-local-e2e" },
            models: { "mock-model": { name: "Mock Model" } },
          },
        },
        mcp: {
          servers: {
            maskera: {
              type: "local",
              command: [process.execPath, cliPath, ...mcpArgs],
              environment: extraEnv,
              disabled: false,
            },
          },
        },
      },
      null,
      2,
    ),
  )

  const baseEnv = {
    HOME: dir,
    XDG_CONFIG_HOME: join(dir, ".config"),
    XDG_DATA_HOME: join(dir, ".local", "share"),
    XDG_STATE_HOME: join(dir, ".local", "state"),
    XDG_CACHE_HOME: join(dir, ".cache"),
    OPENCODE_DISABLE_AUTOUPDATE: "true",
  }

  const srv = spawn("opencode", ["serve", "--port", "0"], {
    cwd: dir,
    env: { ...process.env, ...baseEnv },
    stdio: ["ignore", "pipe", "pipe"],
  })

  try {
    let srvLogs = ""
    const { url: ocUrl, password } = await new Promise((res, rej) => {
      const timer = setTimeout(() => {
        srv.kill("SIGKILL")
        rej(new Error(`opencode serve timeout:\n${srvLogs}`))
      }, 15_000)
      const onData = (c) => {
        srvLogs += c.toString("utf8")
        const u = srvLogs.match(/server listening on (http:\/\/127\.0\.0\.1:\d+)/)
        const p = srvLogs.match(/server password ([^\s]+)/)
        if (u && p) {
          clearTimeout(timer)
          res({ url: u[1], password: p[1] })
        }
      }
      srv.stdout.on("data", onData)
      srv.stderr.on("data", onData)
    })

    const ocEnv = { ...baseEnv, OPENCODE_PASSWORD: password }
    let mcpConnected = false
    for (let i = 0; i < 20; i++) {
      const listRes = await runCmd("opencode", ["mcp", "list", "--server", ocUrl], {
        cwd: dir,
        env: ocEnv,
        timeoutMs: 10_000,
      })
      if (/\bmaskera\s+connected\b/.test(listRes.stdout)) {
        mcpConnected = true
        break
      }
      await new Promise((r) => setTimeout(r, 200))
    }
    assert.equal(mcpConnected, true, "opencode did not connect to maskera MCP server")

    const prompt = isNer
      ? "Läs klient.txt för Anna Lindqvist (070-174 06 58) och skriv svar-opencode.txt"
      : "Läs klient.txt för 070-174 06 58 och skriv svar-opencode.txt"

    const runRes = await runCmd(
      "opencode",
      [
        "run",
        "--server",
        ocUrl,
        "--archived",
        "--auto",
        "--format",
        "json",
        "-m",
        "maskera-local/mock-model",
        prompt,
      ],
      { cwd: dir, env: ocEnv, timeoutMs: 30_000 },
    )
    assert.equal(runRes.timedOut, false, `opencode timed out:\n${runRes.stderr}`)
    assert.equal(
      runRes.code,
      0,
      `opencode exited ${runRes.code}:\n${runRes.stdout}\n${runRes.stderr}`,
    )

    assert.equal(agentTurn, 2, `expected 2 opencode agent turns, got ${agentTurn}`)
    assert.equal(
      execToolResult.includes("[PERSONNUMMER_1]"),
      true,
      `opencode execute did not return redacted file: ${execToolResult.slice(0, 300)}`,
    )

    // Verify ZERO raw PII leaked upstream!
    assertNoLeaks(mock.seen, isNer ? SECRETS_NER : SECRETS_RULES, `opencode-${lane}`)

    // Verify restored file on disk!
    const written = await readFile(join(dir, "svar-opencode.txt"), "utf8")
    const expectedFile = isNer
      ? "OpenCode svar till Anna Lindqvist i Uppsala: 19900101-2385, 070-174 06 58, anna@example.com."
      : "OpenCode svar: 19900101-2385, 070-174 06 58, anna@example.com."
    assert.equal(written, expectedFile, `opencode restored file mismatch: ${written}`)

    // Verify chunk-split SSE restore in OpenCode's final text!
    const events = runRes.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
    const finalText = events
      .filter((e) => e.type === "text")
      .map((e) => e.part?.text ?? "")
      .join("")
    assert.equal(
      finalText.includes("070-174 06 58"),
      true,
      `opencode SSE did not restore phone: ${finalText}`,
    )
    if (isNer) {
      assert.equal(
        finalText.includes("Anna Lindqvist"),
        true,
        `opencode SSE did not restore NER name: ${finalText}`,
      )
    }

    const proxyStatus = await proxy.status()
    assert.equal(
      proxyStatus.engine.cacheHits > 0,
      true,
      `expected proxy span cache hits across multi-turn opencode run`,
    )
    const maxOpenCodeRedactions = isNer ? 200 : 60
    assert.equal(
      proxyStatus.total_redactions <= maxOpenCodeRedactions,
      true,
      `opencode [${lane}] over-masked English system/boilerplate: got ${proxyStatus.total_redactions} redactions (max ${maxOpenCodeRedactions})`,
    )

    return {
      ms: runRes.ms,
      turns: agentTurn,
      cacheHits: proxyStatus.engine.cacheHits,
      cacheMisses: proxyStatus.engine.cacheMisses,
      redactions: proxyStatus.total_redactions,
    }
  } finally {
    if (srv.exitCode === null) {
      const done = new Promise((r) => srv.once("close", r))
      srv.kill("SIGTERM")
      await done
    }
    await proxy.stop()
    await mock.close()
  }
}

// -----------------------------------------------------------------------------
// 4. Opt-in live subscription runners (`--live`): uses logged-in subscriptions
//    (Claude Max, Codex ChatGPT, OpenCode Go) with local ONNX NER.
// -----------------------------------------------------------------------------
function assertRestoredAllEntities(text, label) {
  for (const expected of SECRETS_NER) {
    assert.equal(
      text.includes(expected),
      true,
      `[${label}] restored svar.txt missing "${expected}": ${text}`,
    )
  }
}

async function testClaudeLive(workRoot) {
  const dir = join(workRoot, "claude-live")
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, "klient.txt"),
    "Patient Anna Lindqvist i Uppsala (19900101-2385), tel 070-174 06 58, epost anna@example.com.\n",
    "utf8",
  )
  const proxy = await startProxy(null, [], NER_ENV)
  try {
    const mcpCfgPath = join(dir, "mcp.json")
    await writeFile(
      mcpCfgPath,
      JSON.stringify({
        mcpServers: {
          maskera: {
            command: process.execPath,
            args: [cliPath, "--root", dir],
            env: NER_ENV,
          },
        },
      }),
    )
    const env = { ANTHROPIC_BASE_URL: proxy.url, ANTHROPIC_API_KEY: undefined }
    const res = await runCmd(
      "claude",
      [
        "-p",
        "--no-session-persistence",
        "--strict-mcp-config",
        "--mcp-config",
        mcpCfgPath,
        "--setting-sources",
        "",
        "--disable-slash-commands",
        "--permission-mode",
        "bypassPermissions",
        "--tools",
        "",
        "--model",
        opts.claudeModel,
        "--max-budget-usd",
        String(opts.maxUsd),
        "--output-format",
        "json",
        'Använd verktyget maskera_read_file med path "klient.txt" och session_id "live-c1". Skriv sedan med maskera_write_file en kort svensk bekräftelse till "svar.txt" med session_id "live-c1" som inkluderar alla platshållare (namn, plats, personnummer, telefon, epost) exakt som de kom tillbaka. Svara kort på svenska.',
      ],
      { cwd: dir, env, timeoutMs: 90_000 },
    )
    assert.equal(
      res.timedOut,
      false,
      `claude live timed out:\n${res.stderr}\nproxy logs:\n${proxy.getStderr()}`,
    )
    assert.equal(
      res.code,
      0,
      `claude live exited ${res.code}:\n${res.stdout}\n${res.stderr}\nproxy logs:\n${proxy.getStderr()}`,
    )
    const costUsd = extractClaudeCostUsd(res.stdout)
    if (costUsd !== null) {
      assertWithinBudget({ spentUsd: costUsd, maxUsd: opts.maxUsd, label: "claude-live" })
    }
    const written = await readFile(join(dir, "svar.txt"), "utf8")
    assertRestoredAllEntities(written, "claude-live")
    const st = await proxy.status()
    assert.equal(st.requests_proxied > 0, true, "expected proxied Anthropic requests")
    return {
      ms: res.ms,
      requests: st.requests_proxied,
      cacheHits: st.engine.cacheHits,
      redactions: st.total_redactions,
      ...(costUsd !== null ? { costUsd } : {}),
    }
  } finally {
    await proxy.stop()
  }
}

async function testCodexLive(workRoot) {
  const dir = join(workRoot, "codex-live")
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, "klient.txt"),
    "Patient Anna Lindqvist i Uppsala (19900101-2385), tel 070-174 06 58, epost anna@example.com.\n",
    "utf8",
  )
  const envTomlEntries = Object.entries(NER_ENV)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(", ")
  const res = await runCmd(
    "codex",
    [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--dangerously-bypass-approvals-and-sandbox",
      "--json",
      "-C",
      dir,
      "-c",
      'model_reasoning_effort="low"',
      "-c",
      `mcp_servers.maskera.command=${JSON.stringify(process.execPath)}`,
      "-c",
      `mcp_servers.maskera.args=${JSON.stringify([cliPath, "--root", dir])}`,
      "-c",
      `mcp_servers.maskera.env={${envTomlEntries}}`,
      'Använd verktyget maskera_read_file med path "klient.txt" och session_id "live-cx". Skriv sedan med maskera_write_file en kort svensk bekräftelse till "svar.txt" med session_id "live-cx" som inkluderar alla platshållare (namn, plats, personnummer, telefon, epost) exakt som de kom tillbaka. Svara kort på svenska.',
    ],
    {
      cwd: dir,
      env: { OPENAI_API_KEY: undefined, OPENAI_BASE_URL: undefined },
      timeoutMs: 60_000,
    },
  )
  assert.equal(res.timedOut, false, `codex live timed out:\n${res.stderr}`)
  assert.equal(res.code, 0, `codex live exited ${res.code}:\n${res.stdout}\n${res.stderr}`)
  for (const secret of SECRETS_NER) {
    assert.equal(
      res.stdout.includes(secret),
      false,
      `[codex-live] raw PII "${secret}" appeared in Codex session events`,
    )
  }
  const written = await readFile(join(dir, "svar.txt"), "utf8")
  assertRestoredAllEntities(written, "codex-live")
  return { ms: res.ms, cacheHits: 0, redactions: SECRETS_NER.length }
}

async function testOpenCodeLive(workRoot) {
  const dir = join(workRoot, "opencode-live")
  await mkdir(dir, { recursive: true })
  await runCmd("git", ["init", "-q"], { cwd: dir })
  await writeFile(
    join(dir, "klient.txt"),
    "Patient Anna Lindqvist i Uppsala (19900101-2385), tel 070-174 06 58, epost anna@example.com.\n",
    "utf8",
  )
  const providerId = opts.opencodeModel.split("/")[0] || "opencode-go"
  const proxy = await startProxy(opts.opencodeUpstream, [], NER_ENV)
  const ocConfig = join(dir, "opencode.json")
  await writeFile(
    ocConfig,
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        provider: {
          [providerId]: { options: { baseURL: `${proxy.url}/v1` } },
        },
        mcp: {
          servers: {
            maskera: {
              type: "local",
              command: [process.execPath, cliPath, "--root", dir],
              environment: NER_ENV,
              disabled: false,
            },
          },
        },
      },
      null,
      2,
    ),
  )
  const baseEnv = { OPENCODE_CONFIG: ocConfig, OPENCODE_DISABLE_AUTOUPDATE: "true" }
  const srv = spawn("opencode", ["serve", "--port", "0"], {
    cwd: dir,
    env: { ...process.env, ...baseEnv },
    stdio: ["ignore", "pipe", "pipe"],
  })
  try {
    let srvLogs = ""
    const { url: ocUrl, password } = await new Promise((res, rej) => {
      const timer = setTimeout(() => {
        srv.kill("SIGKILL")
        rej(new Error(`opencode serve timeout:\n${srvLogs}`))
      }, 15_000)
      const onData = (c) => {
        srvLogs += c.toString("utf8")
        const u = srvLogs.match(/server listening on (http:\/\/127\.0\.0\.1:\d+)/)
        const p = srvLogs.match(/server password ([^\s]+)/)
        if (u && p) {
          clearTimeout(timer)
          res({ url: u[1], password: p[1] })
        }
      }
      srv.stdout.on("data", onData)
      srv.stderr.on("data", onData)
    })
    const ocEnv = { ...baseEnv, OPENCODE_PASSWORD: password }
    let mcpConnected = false
    for (let i = 0; i < 20; i++) {
      const listRes = await runCmd("opencode", ["mcp", "list", "--server", ocUrl], {
        cwd: dir,
        env: ocEnv,
        timeoutMs: 10_000,
      })
      if (/\bmaskera\s+connected\b/.test(listRes.stdout)) {
        mcpConnected = true
        break
      }
      await new Promise((r) => setTimeout(r, 250))
    }
    assert.equal(mcpConnected, true, "opencode did not connect to maskera MCP server")
    const runRes = await runCmd(
      "opencode",
      [
        "run",
        "--server",
        ocUrl,
        "--archived",
        "--auto",
        "--format",
        "json",
        "-m",
        opts.opencodeModel,
        'Use the execute tool to call await tools.maskera.maskera_read_file({ path: "klient.txt", session_id: "live-oc" }) and then await tools.maskera.maskera_write_file({ path: "svar.txt", session_id: "live-oc", text: ... }) with a short confirmation that includes ALL FIVE placeholders verbatim from maskera_read_file (name, place, personnummer, phone, email). Reply briefly.',
      ],
      { cwd: dir, env: ocEnv, timeoutMs: 90_000 },
    )
    assert.equal(
      runRes.timedOut,
      false,
      `opencode live timed out:\n${runRes.stderr}\nproxy logs:\n${proxy.getStderr()}`,
    )
    assert.equal(
      runRes.code,
      0,
      `opencode live exited ${runRes.code}:\n${runRes.stdout}\n${runRes.stderr}\nproxy logs:\n${proxy.getStderr()}`,
    )
    const written = await readFile(join(dir, "svar.txt"), "utf8")
    assertRestoredAllEntities(written, "opencode-live")
    const st = await proxy.status()
    assert.equal(st.requests_proxied > 0, true, "expected proxied OpenCode requests")
    return {
      ms: runRes.ms,
      requests: st.requests_proxied,
      cacheHits: st.engine.cacheHits,
      redactions: st.total_redactions,
    }
  } finally {
    if (srv.exitCode === null) {
      const done = new Promise((r) => srv.once("close", r))
      srv.kill("SIGTERM")
      await done
    }
    await proxy.stop()
  }
}

// -----------------------------------------------------------------------------
// Runner
// -----------------------------------------------------------------------------
const harnesses = [
  { id: "claude", bin: "claude", fn: testClaudeCode, liveFn: testClaudeLive },
  { id: "codex", bin: "codex", fn: testCodex, liveFn: testCodexLive },
  { id: "opencode", bin: "opencode", fn: testOpenCode, liveFn: testOpenCodeLive },
]

const lanes = opts.live ? ["live"] : opts.mode === "both" ? ["rules", "auto"] : [opts.mode]
const workRoot = await mkdtemp(join("/tmp", "maskera-harnesses-"))
const results = []
let failures = 0
let liveSpentUsd = 0

try {
  if (!opts.jsonOut) {
    const budgetNote = opts.live ? `, max-usd: $${opts.maxUsd.toFixed(2)}` : ""
    console.log(
      `Running @maskera/mcp real-harness E2E (lanes: ${lanes.join(", ")}${budgetNote})...`,
    )
  }
  for (const h of harnesses) {
    if (opts.only && !opts.only.has(h.id)) continue
    if (!hasBinary(h.bin)) {
      const entry = { harness: h.id, status: "skipped", reason: `"${h.bin}" not found in PATH` }
      results.push(entry)
      if (!opts.jsonOut) console.log(`  skip  ${h.id} (${entry.reason})`)
      continue
    }
    const version = getBinaryVersion(h.bin)
    for (const lane of lanes) {
      const t0 = performance.now()
      try {
        if (lane === "live" && liveSpentUsd >= opts.maxUsd) {
          throw new Error(
            `Live budget cap $${opts.maxUsd.toFixed(2)} reached (spent $${liveSpentUsd.toFixed(4)}) before running ${h.id}.`,
          )
        }
        const metrics = lane === "live" ? await h.liveFn(workRoot) : await h.fn(workRoot, lane)
        if (lane === "live" && typeof metrics.costUsd === "number") {
          liveSpentUsd += metrics.costUsd
          assertWithinBudget({ spentUsd: liveSpentUsd, maxUsd: opts.maxUsd, label: h.id })
        }
        const totalMs = Math.round(performance.now() - t0)
        const entry = {
          harness: h.id,
          version,
          lane,
          status: "pass",
          totalMs,
          ...metrics,
        }
        results.push(entry)
        if (!opts.jsonOut) {
          const costNote =
            typeof metrics.costUsd === "number" ? `, cost=$${metrics.costUsd.toFixed(4)}` : ""
          console.log(
            `  ok    ${h.id} [${lane}] (${totalMs}ms, run=${metrics.ms}ms, cacheHits=${metrics.cacheHits}, redactions=${metrics.redactions}${costNote})`,
          )
        }
      } catch (err) {
        failures += 1
        const totalMs = Math.round(performance.now() - t0)
        const message = err instanceof Error ? err.message : String(err)
        results.push({ harness: h.id, version, lane, status: "fail", totalMs, error: message })
        if (!opts.jsonOut) {
          console.error(`  FAIL  ${h.id} [${lane}] (${totalMs}ms): ${message}`)
        }
      }
    }
  }

  if (opts.jsonOut) {
    const payload = opts.live
      ? {
          ok: failures === 0,
          maxUsd: opts.maxUsd,
          spentUsd: Number(liveSpentUsd.toFixed(6)),
          results,
        }
      : { ok: failures === 0, results }
    console.log(JSON.stringify(payload, null, 2))
  } else {
    const passed = results.filter((r) => r.status === "pass").length
    const skipped = results.filter((r) => r.status === "skipped").length
    console.log(
      `\nHarness E2E ${failures === 0 ? "PASS" : "FAIL"}: ${passed} passed, ${failures} failed, ${skipped} skipped.`,
    )
  }
  if (failures > 0) process.exitCode = 1
} finally {
  if (!opts.keepTmp) {
    await rm(workRoot, { recursive: true, force: true })
  } else if (!opts.jsonOut) {
    console.log(`Kept temp workspace: ${workRoot}`)
  }
}
