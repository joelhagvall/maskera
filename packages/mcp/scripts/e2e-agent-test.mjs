#!/usr/bin/env node
/**
 * End-to-end verification suite for `@maskera/mcp` against the built CLI binary
 * (`dist/cli.js`), covering:
 *   1. MCP stdio server (JSON-RPC 2.0, FileGuard security matrix, Vault, CLI parity)
 *   2. Guard CLI (Claude Code & Cursor hook envelopes, fail-closed exit 2)
 *   3. Local LLM proxy (Anthropic + OpenAI JSON & chunk-split SSE, count_tokens,
 *      document/function_call_output, unbuffered SSE passthrough, upstream abort)
 *   4. Live inspector (`/_maskera*` DNS rebinding, CSRF, clickjacking headers,
 *      query routing) and nested JSONL audit log with zero raw PII
 *   5. Optional real local ONNX Swedish NER lane when `apps/demo/public/models` exists
 *
 * Zero external network calls and zero paid API calls: all upstreams bind to
 * 127.0.0.1 ephemeral ports.
 */

import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { connect } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { gzipSync } from "node:zlib"

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, "..")
// MASKERA_MCP_CLI points the suite at another build of the CLI, for example
// the published package installed into a temp dir, so the same checks verify
// what readers actually install.
const cliPath = process.env.MASKERA_MCP_CLI
  ? resolve(process.env.MASKERA_MCP_CLI)
  : resolve(pkgRoot, "dist/cli.js")
const localModelsDir = resolve(pkgRoot, "../../apps/demo/public/models")
const hasLocalNerModel = existsSync(join(localModelsDir, "maskera-sv-ner-v20"))

if (!existsSync(cliPath)) {
  throw new Error(
    `CLI not found at ${cliPath}. Run "pnpm --filter @maskera/mcp build" first, or fix MASKERA_MCP_CLI.`,
  )
}

let passed = 0
async function test(name, fn) {
  const t0 = Date.now()
  await fn()
  passed += 1
  console.log(`  ok  ${name} (${Date.now() - t0}ms)`)
}

function runCli(args, stdinText = "", envExtra = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...envExtra },
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8")
    })
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8")
    })
    child.on("error", rejectRun)
    child.on("close", (code) => resolveRun({ code, stdout, stderr }))
    child.stdin.end(stdinText)
  })
}

async function startHttpServer(handler) {
  const server = createServer(handler)
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen)
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen)
      resolveListen()
    })
  })
  const addr = server.address()
  const port = typeof addr === "object" && addr ? addr.port : 0
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise((resolveClose, rejectClose) =>
        server.close((err) => (err ? rejectClose(err) : resolveClose())),
      ),
  }
}

async function startProxyCli(args, envExtra = {}) {
  const child = spawn(process.execPath, [cliPath, "proxy", "--port", "0", ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...envExtra },
  })
  let stderr = ""
  const url = await new Promise((resolveReady, rejectReady) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      rejectReady(new Error(`proxy did not start in time. stderr:\n${stderr}`))
    }, 10_000)
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8")
      const match = stderr.match(/listening on (http:\/\/[^\s]+)/)
      if (match) {
        clearTimeout(timer)
        resolveReady(match[1])
      }
    })
    child.on("exit", (code) => {
      clearTimeout(timer)
      rejectReady(new Error(`proxy exited early with code ${code}. stderr:\n${stderr}`))
    })
  })
  const port = Number(new URL(url).port)
  return {
    url,
    port,
    getStderr: () => stderr,
    async stop() {
      if (child.exitCode !== null) return
      const done = new Promise((r) => child.once("close", r))
      child.kill("SIGTERM")
      await done
    },
  }
}

function sendRawHttp(port, rawRequest) {
  return new Promise((resolveRes, rejectRes) => {
    const socket = connect(port, "127.0.0.1")
    let data = ""
    socket.on("connect", () => socket.write(rawRequest))
    socket.on("data", (chunk) => {
      data += chunk.toString("utf8")
    })
    socket.on("end", () => resolveRes(data))
    socket.on("error", rejectRes)
  })
}

async function runMcpSession(args, messages, envExtra = {}) {
  const input = `${messages.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join("\n")}\n`
  const res = await runCli(args, input, envExtra)
  const responses = res.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  return { ...res, responses }
}

const workDir = await mkdtemp(join(tmpdir(), "maskera-mcp-e2e-"))
try {
  console.log("Running @maskera/mcp E2E suite...")

  // ---------------------------------------------------------------------------
  // 1. MCP stdio server & FileGuard security matrix
  // ---------------------------------------------------------------------------
  await test("MCP full lifecycle, session consistency, zero PII leak, and CLI --custom-term", async () => {
    const root = join(workDir, "mcp-root")
    const outside = join(workDir, "mcp-outside")
    const { mkdir } = await import("node:fs/promises")
    await mkdir(root, { recursive: true })
    await mkdir(outside, { recursive: true })

    await writeFile(
      join(root, "case1.txt"),
      "Kontakt: 070-174 06 58, Acme Corporation, 19900101-2385",
      "utf8",
    )
    await writeFile(join(root, "..notes.txt"), "Fil med dubbla punkter: 070-174 06 58", "utf8")
    await writeFile(
      join(root, "latin1.txt"),
      Buffer.from("Patient Åsa Östergren i Örebro.", "latin1"),
    )
    await symlink(join(outside, "escaped.txt"), join(root, "dangling.txt"))

    const { responses, stdout, stderr } = await runMcpSession(
      ["--rules-only", "--root", root, "--custom-term=Acme", "--custom-term", "Acme Corp"],
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "maskera_read_file",
            arguments: { path: "case1.txt", session_id: " s1 " },
          },
        },
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "maskera_read_file",
            arguments: { path: "..notes.txt", session_id: "s1" },
          },
        },
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "maskera_read_file",
            arguments: { path: "latin1.txt", session_id: "s1" },
          },
        },
        {
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: {
            name: "maskera_write_file",
            arguments: {
              path: "dangling.txt",
              text: "LEAK [TELEFON_1]",
              session_id: " s1 ",
              overwrite: true,
            },
          },
        },
        {
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: {
            name: "maskera_write_file",
            arguments: {
              path: "out/reply.txt",
              text: "Svar till [TELEFON_1] och [PERSONNUMMER_1] ([EGENT_1]).",
              session_id: " s1 ",
            },
          },
        },
        {
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: { name: "maskera_clear_session", arguments: { session_id: " s1 " } },
        },
        { foo: "bar" },
        { jsonrpc: "2.0", id: true, method: "ping" },
      ],
    )

    assert.equal(stdout.includes("070-174 06 58"), false, "phone leaked to MCP stdout")
    assert.equal(stdout.includes("19900101-2385"), false, "personnummer leaked to MCP stdout")
    assert.equal(stderr.includes("070-174 06 58"), false, "phone leaked to MCP stderr")

    const byId = new Map(responses.map((r) => [r.id, r]))
    const r2 = byId.get(2).result.structuredContent
    assert.equal(r2.session_id, "s1")
    assert.equal(r2.redacted, "Kontakt: [TELEFON_1], [EGENT_1] Corporation, [PERSONNUMMER_1]")

    const r3 = byId.get(3).result.structuredContent
    assert.equal(r3.redacted, "Fil med dubbla punkter: [TELEFON_1]")

    // Invalid UTF-8 (Latin-1) must fail loudly rather than corrupting Swedish chars
    assert.equal(byId.get(4).result.isError, true)
    assert.match(byId.get(4).result.content[0].text, /not valid UTF-8/i)

    // Dangling symlink pointing outside root MUST be blocked even with overwrite=true
    assert.equal(byId.get(5).result.isError, true)
    assert.match(byId.get(5).result.content[0].text, /Access denied/i)
    assert.equal(existsSync(join(outside, "escaped.txt")), false, "dangling symlink escaped root!")

    // Legitimate write restores exact originals on disk
    assert.equal(byId.get(6).result.isError, undefined)
    const disk = await readFile(join(root, "out/reply.txt"), "utf8")
    assert.equal(disk, "Svar till 070-174 06 58 och 19900101-2385 (Acme).")

    // Padded session_id clear works
    assert.equal(byId.get(7).result.structuredContent.cleared, true)

    // Invalid JSON-RPC requests receive -32600 instead of silent drop
    const invalidErrors = responses.filter((r) => r.error?.code === -32600)
    assert.equal(invalidErrors.length, 2)
  })

  await test("MCP Vault O(1) collision perf budget (25,000 seeded placeholders)", async () => {
    const seeded = `${Array.from({ length: 25_000 }, (_, i) => `[EPOST_${i + 1}]`).join(" ")} test@example.com`
    const t0 = Date.now()
    const { responses } = await runMcpSession(
      ["--rules-only"],
      [
        {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "maskera_redact", arguments: { text: seeded, session_id: "perf" } },
        },
      ],
    )
    const elapsed = Date.now() - t0
    const out = responses[0].result.structuredContent.redacted
    assert.equal(out.endsWith(" [EPOST_25001]"), true)
    assert.equal(elapsed < 2500, true, `vault collision check too slow: ${elapsed}ms`)
  })

  // ---------------------------------------------------------------------------
  // 2. Guard CLI (Claude Code / Cursor hooks + fail-closed exit 2)
  // ---------------------------------------------------------------------------
  await test("Guard blocks PostToolUse, numeric PII, empty prompt + tool_input, --file=, and fails closed", async () => {
    const postTool = await runCli(
      ["guard", "--rules-only"],
      JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Read",
        tool_input: { file_path: "a.txt" },
        tool_response: { content: "Personnummer 19900101-2385" },
      }),
    )
    assert.equal(postTool.code, 2)
    assert.equal(postTool.stdout, "")
    assert.equal(postTool.stderr.includes("19900101-2385"), false)

    const numericPii = await runCli(
      ["guard", "--rules-only"],
      JSON.stringify({ tool_input: { personnummer: 199001012385 } }),
    )
    assert.equal(numericPii.code, 2)

    const emptyPromptShadow = await runCli(
      ["guard", "--rules-only"],
      JSON.stringify({ prompt: "", tool_input: { body: "Ring 070-174 06 58" } }),
    )
    assert.equal(emptyPromptShadow.code, 2)

    const piiFile = join(workDir, "guard-file.txt")
    await writeFile(piiFile, "Mejla anna@example.com nu", "utf8")
    const fileEq = await runCli(["guard", "--rules-only", `--file=${piiFile}`], "")
    assert.equal(fileEq.code, 2)

    // Unknown flag & broken NER in guard mode MUST fail closed with exit 2
    const badFlag = await runCli(["guard", "--unknown-flag"], "clean text")
    assert.equal(badFlag.code, 2)

    // Empty --port / --host rejected; leading-dash --custom-term allowed
    const emptyHost = await runCli(["proxy", "--rules-only", "--port", "0", "--host", ""], "")
    assert.notEqual(emptyHost.code, 0)
    const emptyPort = await runCli(["proxy", "--rules-only", "--port", ""], "")
    assert.notEqual(emptyPort.code, 0)
    const dashTerm = await runCli(
      ["guard", "--rules-only", "--custom-term", "-hemligt"],
      "Kod -hemligt",
    )
    assert.equal(dashTerm.code, 2)

    // Cursor beforeSubmitPrompt attachments + sibling JSON fields scanned
    const cursorAttach = await runCli(
      ["guard", "--rules-only"],
      JSON.stringify({
        hook_event_name: "beforeSubmitPrompt",
        prompt: "Summarize this file",
        attachments: [{ type: "file", text: "Patient: 19900101-2385" }],
      }),
    )
    assert.equal(cursorAttach.code, 2)

    // guard --redact preserves JSON structure on hook envelopes
    const redactHook = await runCli(
      ["guard", "--rules-only", "--redact"],
      JSON.stringify({
        hook_event_name: "UserPromptSubmit",
        prompt: "Ring 070-174 06 58",
        session_id: "s1",
      }),
    )
    assert.equal(redactHook.code, 0)
    const parsedHook = JSON.parse(redactHook.stdout)
    assert.equal(parsedHook.prompt, "Ring [TELEFON_1]")
    assert.equal(parsedHook.session_id, "s1")

    // guard --file rejects Latin-1 invalid UTF-8 and binary files (fail closed exit 2)
    const latin1Guard = join(workDir, "guard-latin1.txt")
    await writeFile(latin1Guard, Buffer.from("Patient Åsa Öberg", "latin1"))
    assert.equal((await runCli(["guard", "--rules-only", "--file", latin1Guard], "")).code, 2)

    const brokenNer = await runCli(["guard"], "Hej världen", {
      MASKERA_ALLOW_REMOTE_MODELS: "0",
      MASKERA_MODEL_PATH: join(workDir, "no-such-model"),
    })
    assert.equal(brokenNer.code, 2)
  })

  // ---------------------------------------------------------------------------
  // 3. Proxy + Live Inspector + Audit Log E2E
  // ---------------------------------------------------------------------------
  await test("Proxy zero-leak matrix, streaming restore (thinking + tool_calls + EOF), security & audit log", async () => {
    const upstreamSeen = []
    let slowStreamAborted = false

    const mockUpstream = await startHttpServer(async (req, res) => {
      const chunks = []
      for await (const c of req) chunks.push(c)
      const raw = Buffer.concat(chunks).toString("utf8")
      upstreamSeen.push({ method: req.method, url: req.url, raw })

      if (req.url === "/v1/messages/count_tokens") {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ input_tokens: 42 }))
        return
      }

      if (req.url === "/v1/messages" && raw.includes('"stream":true')) {
        res.writeHead(200, { "content-type": "text/event-stream" })
        const events = [
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Tänker på [PERSON" } })}\n\n`,
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "NUMMER_1] nu." } })}\n\n`,
          `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n`,
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hej [TELE" } })}\n\n`,
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "FON_1]!" } })}\n\n`,
          `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 1 })}\n\n`,
        ]
        for (const ev of events) res.write(ev)
        res.end()
        return
      }

      if (req.url === "/v1/chat/completions" && raw.includes("slow-sse")) {
        res.writeHead(200, { "content-type": "text/event-stream" })
        res.on("close", () => {
          if (!res.writableEnded) slowStreamAborted = true
        })
        for (let i = 0; i < 6; i++) {
          if (res.destroyed) break
          res.write(
            `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: `chunk-${i} ` } }] })}\n\n`,
          )
          await new Promise((r) => setTimeout(r, 60))
        }
        if (!res.destroyed) {
          res.write("data: [DONE]\n\n")
          res.end()
        }
        return
      }

      if (req.url === "/v1/chat/completions" && raw.includes("tool-finish")) {
        res.writeHead(200, { "content-type": "text/event-stream" })
        // Tool args end with a buffered placeholder prefix `[TELE` right before finish_reason
        res.write(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: '{"tel":"[TELE' } }] } }] })}\n\n`,
        )
        res.write(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
        )
        res.write("data: [DONE]\n\n")
        res.end()
        return
      }

      if (req.url === "/v1/chat/completions" && raw.includes("eof-no-done")) {
        res.writeHead(200, { "content-type": "text/event-stream" })
        res.write(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "Prefix [TELE" } }] })}\n\n`,
        )
        res.end()
        return
      }

      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true, echo: raw }))
    })

    const auditFile = join(workDir, "nested-audit", "proxy.jsonl")
    const proxy = await startProxyCli([
      "--rules-only",
      "--upstream",
      mockUpstream.url,
      "--custom-term=HemligKod",
      "--audit-log",
      auditFile,
    ])

    try {
      // A) Security: DNS rebinding + Host smuggling + HTTP/1.0 missing Host -> 403
      for (const badHost of [
        `evil.attacker.test:${proxy.port}`,
        `localhost:${proxy.port}@evil.com`,
        `127.0.0.1:${proxy.port} evil.com`,
        "[::1]evil.com",
      ]) {
        const resRaw = await sendRawHttp(
          proxy.port,
          `GET /_maskera/vault HTTP/1.1\r\nHost: ${badHost}\r\nx-maskera-reveal: 1\r\nConnection: close\r\n\r\n`,
        )
        assert.match(resRaw, /^HTTP\/1\.1 403 /, `Host smuggling passed: ${badHost}`)
      }
      const http10Clear = await sendRawHttp(
        proxy.port,
        "POST /_maskera/clear HTTP/1.0\r\nOrigin: http://127.0.0.1:9999\r\nx-maskera-action: clear\r\n\r\n",
      )
      assert.match(
        http10Clear,
        /^HTTP\/1\.1 403 /,
        "HTTP/1.0 missing-Host clear bypassed origin check",
      )

      // B) Security: Inspector headers & unknown/encoded /_maskera/* -> 404 (not forwarded upstream)
      const htmlRes = await fetch(`${proxy.url}/_maskera`)
      assert.equal(htmlRes.status, 200)
      assert.equal(htmlRes.headers.get("x-frame-options"), "DENY")
      assert.match(htmlRes.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/)
      for (const badPath of [
        "/_maskera/does-not-exist?x=1",
        "/%5fmaskera/vault",
        "/_MASKERA/vault",
      ]) {
        const r = await fetch(`${proxy.url}${badPath}`)
        assert.equal(r.status, 404, `expected 404 for ${badPath}`)
      }
      assert.equal(upstreamSeen.length, 0, "unknown /_maskera route leaked to upstream")

      // C) Security: Query string on /_maskera/status handled locally
      const statusQ = await fetch(`${proxy.url}/_maskera/status?t=123`)
      assert.equal(statusQ.status, 200)
      assert.equal(upstreamSeen.length, 0)

      // D) Zero-leak: count_tokens, uppercase path, omitted Content-Type, gzip body, thinking, doc title/context/source.content, tools, Responses reasoning.summary
      await fetch(`${proxy.url}/v1/MESSAGES`, {
        method: "POST",
        headers: { "content-type": "application/json", "content-encoding": "gzip" },
        body: gzipSync(
          Buffer.from(
            JSON.stringify({
              model: "claude-sonnet-4-6",
              tools: [{ name: "lookup", description: "Lookup 19900101-2385" }],
              messages: [
                {
                  role: "assistant",
                  content: [
                    { type: "thinking", thinking: "Echoed 19900101-2385", signature: "sig" },
                  ],
                },
                {
                  role: "user",
                  content: [
                    {
                      type: "document",
                      title: "Title 070-174 06 58",
                      context: "Context 19900101-2385",
                      source: {
                        type: "content",
                        content: [{ type: "text", text: "Nested HemligKod 19900101-2385" }],
                      },
                    },
                  ],
                },
              ],
            }),
          ),
        ),
      })
      await fetch(`${proxy.url}/v1/messages`, {
        method: "POST",
        // Deliberately omit Content-Type header on raw JSON body
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          messages: [{ role: "user", content: "No content-type 19900101-2385" }],
        }),
      })
      await fetch(`${proxy.url}/v1/messages/count_tokens`, {
        method: "POST",
        headers: { "content-type": "APPLICATION/JSON; charset=utf-8" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "document",
                  source: {
                    type: "text",
                    media_type: "text/plain",
                    data: "Doc 19900101-2385 HemligKod",
                  },
                },
              ],
            },
          ],
        }),
      })
      await fetch(`${proxy.url}/v1/messages/`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          messages: [{ role: "user", content: "Ring 070-174 06 58" }],
        }),
      })
      await fetch(`${proxy.url}/v1/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4.1",
          input: [
            {
              type: "reasoning",
              summary: [{ type: "summary_text", text: "Reasoning 19900101-2385" }],
            },
            {
              type: "function_call_output",
              call_id: "c1",
              output: [{ type: "input_text", text: "Array 070-174 06 58" }],
            },
          ],
        }),
      })

      for (const req of upstreamSeen) {
        assert.equal(req.raw.includes("19900101-2385"), false, `PII leaked on ${req.url}`)
        assert.equal(req.raw.includes("070-174 06 58"), false, `Phone leaked on ${req.url}`)
        assert.equal(req.raw.includes("HemligKod"), false, `Custom term leaked on ${req.url}`)
      }

      // E) Anthropic SSE thinking_delta + text_delta restoration
      const anthSse = await fetch(`${proxy.url}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          stream: true,
          messages: [{ role: "user", content: "Hej 19900101-2385 och 070-174 06 58" }],
        }),
      })
      const anthEvents = (await anthSse.text())
        .split("\n\n")
        .flatMap((block) => block.split("\n"))
        .filter((line) => line.startsWith("data:"))
        .map((line) => JSON.parse(line.slice(5).trim()))
      const anthThinking = anthEvents
        .filter((e) => e.delta?.type === "thinking_delta")
        .map((e) => e.delta.thinking)
        .join("")
      const anthText = anthEvents
        .filter((e) => e.delta?.type === "text_delta")
        .map((e) => e.delta.text)
        .join("")
      assert.equal(anthThinking, "Tänker på 19900101-2385 nu.", "thinking_delta not restored")
      assert.equal(anthText, "Hej 070-174 06 58!", "text_delta not restored")

      // F) OpenAI tool_calls flushed BEFORE finish_reason
      const toolSse = await fetch(`${proxy.url}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4.1",
          stream: true,
          messages: [{ role: "user", content: "tool-finish" }],
        }),
      })
      const toolEvents = (await toolSse.text())
        .split("\n\n")
        .filter((b) => b.startsWith("data:") && !b.includes("[DONE]"))
        .map((b) => JSON.parse(b.slice(5).trim()))
      const finishIdx = toolEvents.findIndex((e) => e.choices?.[0]?.finish_reason === "tool_calls")
      assert.equal(finishIdx, toolEvents.length - 1, "tool_calls flushed AFTER finish_reason!")
      const combinedArgs = toolEvents
        .map((e) => e.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments ?? "")
        .join("")
      assert.equal(combinedArgs, '{"tel":"[TELE')

      // G) SSE EOF without [DONE] flushes trailing prefix
      const eofSse = await fetch(`${proxy.url}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4.1",
          stream: true,
          messages: [{ role: "user", content: "eof-no-done" }],
        }),
      })
      assert.equal((await eofSse.text()).includes("[TELE"), true, "EOF dropped buffered prefix")

      // H) Unbuffered SSE streaming when 0-PII session + client disconnect aborts upstream
      const tStart = Date.now()
      const clientAbort = new AbortController()
      const slowRes = await fetch(`${proxy.url}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-maskera-session": "clean-stream" },
        body: JSON.stringify({
          model: "gpt-4.1",
          stream: true,
          messages: [{ role: "user", content: "slow-sse" }],
        }),
        signal: clientAbort.signal,
      })
      const reader = slowRes.body.getReader()
      const first = await reader.read()
      const firstChunkMs = Date.now() - tStart
      assert.equal(first.done, false)
      assert.equal(
        firstChunkMs < 240,
        true,
        `SSE appears buffered: first chunk took ${firstChunkMs}ms`,
      )
      clientAbort.abort()
      await reader.cancel().catch(() => {})
      await new Promise((r) => setTimeout(r, 140))
      assert.equal(slowStreamAborted, true, "client disconnect did not abort upstream SSE")

      // I) CSRF protection on /_maskera/clear
      const csrfFail = await fetch(`${proxy.url}/_maskera/clear`, { method: "POST" })
      assert.equal(csrfFail.status, 403)
      const crossOriginFail = await fetch(`${proxy.url}/_maskera/clear`, {
        method: "POST",
        headers: { "x-maskera-action": "clear", origin: "http://evil.test:9999" },
      })
      assert.equal(crossOriginFail.status, 403)
      const clearOk = await fetch(`${proxy.url}/_maskera/clear`, {
        method: "POST",
        headers: { "x-maskera-action": "clear" },
      })
      assert.equal(clearOk.status, 200)
    } finally {
      await proxy.stop()
      await mockUpstream.close()
    }

    // J) Audit log created in nested dir, valid JSONL, flushed on stop, zero raw PII
    const auditRaw = await readFile(auditFile, "utf8")
    const lines = auditRaw.trim().split("\n")
    assert.equal(lines.length >= 6, true, `expected >= 6 audit lines, got ${lines.length}`)
    for (const line of lines) JSON.parse(line)
    assert.equal(auditRaw.includes("19900101-2385"), false)
    assert.equal(auditRaw.includes("070-174 06 58"), false)
    assert.equal(auditRaw.includes("HemligKod"), false)
  })

  // ---------------------------------------------------------------------------
  // 3b. Claude Desktop third-party inference, as the Desktop guide in the
  // README sets it up: base URL without /v1, the API key in x-api-key.
  await test("Claude Desktop third-party inference: x-api-key routes to Anthropic, chat text masked, SSE restored", async () => {
    const seen = []
    const anthropic = await startHttpServer(async (req, res) => {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      const raw = Buffer.concat(chunks).toString("utf8")
      seen.push({
        upstream: "anthropic",
        method: req.method,
        url: req.url,
        apiKey: req.headers["x-api-key"],
        raw,
      })
      if (req.method === "GET" && req.url === "/v1/models") {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({ data: [{ id: "claude-test-model", type: "model" }] }))
        return
      }
      const placeholder = raw.match(/\[EPOST_1\]/)?.[0] ?? "MISSING"
      res.writeHead(200, { "content-type": "text/event-stream" })
      const text = `Mejlet till ${placeholder} är klart.`
      // Split the placeholder across two SSE events, as a real stream may.
      for (const part of [text.slice(0, 18), text.slice(18)]) {
        res.write(
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: part } })}\n\n`,
        )
      }
      res.end()
    })
    const openai = await startHttpServer((req, res) => {
      seen.push({ upstream: "openai", method: req.method, url: req.url })
      res.writeHead(500)
      res.end()
    })
    const proxy = await startProxyCli([
      "--rules-only",
      "--anthropic-upstream",
      anthropic.url,
      "--openai-upstream",
      openai.url,
    ])
    try {
      const headers = { "x-api-key": "sk-ant-test", "anthropic-version": "2023-06-01" }
      const models = await fetch(`${proxy.url}/v1/models`, { headers })
      assert.equal(models.status, 200)
      assert.equal((await models.json()).data[0].id, "claude-test-model")

      const email = "provnamn.maskera@example.com"
      const reply = await fetch(`${proxy.url}/v1/messages`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-test-model",
          stream: true,
          max_tokens: 64,
          messages: [
            { role: "user", content: `Skriv ett kort mejl till ${email} och bekräfta mötet.` },
          ],
        }),
      })
      const streamed = await reply.text()
      assert.equal(reply.status, 200)
      assert.ok(streamed.includes(email), `reply not restored: ${streamed}`)
      assert.equal(
        streamed.includes("[EPOST_1]"),
        false,
        `placeholder reached the client: ${streamed}`,
      )

      assert.equal(
        seen.filter((s) => s.upstream === "openai").length,
        0,
        "Desktop traffic routed to OpenAI",
      )
      const sent = seen.find((s) => s.method === "POST")
      assert.ok(sent, "no chat request reached the Anthropic upstream")
      assert.equal(sent.url, "/v1/messages")
      assert.equal(sent.apiKey, "sk-ant-test", "x-api-key was not forwarded")
      assert.equal(sent.raw.includes(email), false, "raw e-mail reached the upstream")
      assert.ok(sent.raw.includes("[EPOST_1]"), "placeholder missing upstream")
    } finally {
      await proxy.stop()
      await anthropic.close()
      await openai.close()
    }
  })

  // ---------------------------------------------------------------------------
  // 3c. Built CLI Streamable HTTP /mcp, install, and doctor E2E
  // ---------------------------------------------------------------------------
  await test("Built CLI: Streamable HTTP /mcp, scoped policy, install --dry-run, and doctor", async () => {
    const root = join(workDir, "http-mcp-root")
    const { mkdir } = await import("node:fs/promises")
    await mkdir(root, { recursive: true })
    await writeFile(join(root, "client.txt"), "Kontakt 19900101-2385 tel 070-174 06 58", "utf8")

    const proxy = await startProxyCli(["--rules-only", "--root", root])
    try {
      const init = await fetch(`${proxy.url}/mcp?no_raw_restore=1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-11-25" },
        }),
      })
      assert.equal(init.status, 200)
      const mcpSession = init.headers.get("mcp-session-id")
      assert.ok(mcpSession, "missing Mcp-Session-Id header")

      const search = await fetch(`${proxy.url}/mcp`, {
        method: "POST",
        headers: { "content-type": "application/json", "mcp-session-id": mcpSession },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "maskera_search_files",
            arguments: { query: "Kontakt", session_id: "s-http" },
          },
        }),
      })
      const searchText = await search.text()
      assert.equal(searchText.includes("19900101-2385"), false, "PII leaked from HTTP MCP search")
      assert.equal(searchText.includes("070-174 06 58"), false, "Phone leaked from HTTP MCP search")
      assert.ok(searchText.includes("[PERSONNUMMER_1]"))

      const doctorReceiptPath = join(workDir, "doctor-receipt.json")
      const doc = await runCli([
        "doctor",
        "--rules-only",
        "--root",
        root,
        "--proxy-url",
        proxy.url,
        "--receipt",
        doctorReceiptPath,
        "--json",
      ])
      assert.equal(doc.code, 0, `doctor failed: ${doc.stderr}`)
      const report = JSON.parse(doc.stdout)
      assert.equal(report.schema, "maskera-setup-receipt/v1")
      assert.equal(report.ok, true)
      assert.equal(report.sampleProof?.rawPiiLeaked, false)
      assert.equal(report.sampleProof?.roundtripRestored, true)
      assert.equal(report.checks.find((c) => c.name === "proxy")?.status, "ok")
      assert.equal(report.checks.find((c) => c.name === "mcp-http")?.status, "ok")
      const doctorReceiptDisk = await readFile(doctorReceiptPath, "utf8")
      assert.equal(doctorReceiptDisk.includes("19900101-2385"), false, "receipt leaked raw PII")
      assert.equal(JSON.parse(doctorReceiptDisk).schema, "maskera-setup-receipt/v1")

      const installReceiptPath = join(workDir, "install-receipt.json")
      const inst = await runCli([
        "install",
        "cursor",
        "--rules-only",
        "--root",
        root,
        "--no-raw-restore",
        "--proxy-url",
        proxy.url,
        "--receipt",
        installReceiptPath,
        "--dry-run",
        "--json",
      ])
      assert.equal(inst.code, 0, `install failed: ${inst.stderr}`)
      const instData = JSON.parse(inst.stdout)
      assert.equal(instData.written, false)
      assert.ok(instData.snippet.includes("--no-raw-restore"))
      assert.equal(instData.receipt?.schema, "maskera-setup-receipt/v1")
      assert.equal(instData.receipt?.ok, true)
      assert.equal(instData.receipt?.sampleProof?.rawPiiLeaked, false)
      assert.equal(instData.receipt?.checks.find((c) => c.name === "mcp-http")?.status, "ok")
      const installReceiptDisk = await readFile(installReceiptPath, "utf8")
      assert.equal(
        installReceiptDisk.includes("19900101-2385"),
        false,
        "install receipt leaked PII",
      )

      const instNoVerify = await runCli([
        "install",
        "cursor",
        "--root",
        root,
        "--dry-run",
        "--no-verify",
        "--json",
      ])
      assert.equal(instNoVerify.code, 0, `install --no-verify failed: ${instNoVerify.stderr}`)
      assert.equal(JSON.parse(instNoVerify.stdout).receipt, undefined)

      const hookCfg = join(workDir, "hook-cursor-mcp.json")
      const instHook = await runCli([
        "install",
        "cursor",
        "--rules-only",
        "--root",
        root,
        "--config",
        hookCfg,
        "--with-hook",
        "--no-verify",
        "--dry-run",
        "--json",
      ])
      assert.equal(instHook.code, 0, `install --with-hook failed: ${instHook.stderr}`)
      assert.ok(JSON.parse(instHook.stdout).hookPath?.endsWith("hooks.json"))

      const wrapReceiptPath = join(workDir, "wrap-receipt.json")
      const wrapped = await runCli([
        "wrap",
        "--rules-only",
        "--root",
        root,
        "--receipt",
        wrapReceiptPath,
        "--",
        process.execPath,
        "-e",
        "if (!process.env.ANTHROPIC_BASE_URL || !process.env.OPENAI_BASE_URL?.endsWith('/v1')) process.exit(9); console.log('wrapped-ok')",
      ])
      assert.equal(wrapped.code, 0, `wrap failed: ${wrapped.stderr}`)
      assert.ok(wrapped.stdout.includes("wrapped-ok"))
      assert.ok(wrapped.stderr.includes("0 leaks verified"))
      assert.ok(wrapped.stderr.includes("session done:"))
      const wrapReceiptDisk = await readFile(wrapReceiptPath, "utf8")
      assert.equal(wrapReceiptDisk.includes("19900101-2385"), false, "wrap receipt leaked PII")
      assert.equal(JSON.parse(wrapReceiptDisk).schema, "maskera-wrap-receipt/v1")

      const svcDry = await runCli([
        "service",
        "install",
        "--rules-only",
        "--root",
        root,
        "--dry-run",
        "--json",
      ])
      assert.equal(svcDry.code, 0, `service dry-run failed: ${svcDry.stderr}`)
      const svcData = JSON.parse(svcDry.stdout)
      assert.equal(svcData.action, "install")
      assert.ok(svcData.manager === "launchd" || svcData.manager === "systemd")

      // Warm guard through running proxy (verifies loopback POST /_maskera/guard fast path)
      const warmGuardBlock = await runCli(
        ["guard", "--rules-only", "--proxy-url", proxy.url],
        JSON.stringify({ prompt: "Pnr 19900101-2385" }),
      )
      assert.equal(warmGuardBlock.code, 2, `warm guard should block: ${warmGuardBlock.stderr}`)
      assert.equal(warmGuardBlock.stderr.includes("19900101-2385"), false)
      assert.ok(warmGuardBlock.stderr.includes("PERSONNUMMER=1"))

      const warmGuardRedact = await runCli(
        ["guard", "--rules-only", "--redact", "--proxy-url", proxy.url],
        "Ring 070-174 06 58",
      )
      assert.equal(warmGuardRedact.code, 0, `warm guard --redact failed: ${warmGuardRedact.stderr}`)
      assert.equal(warmGuardRedact.stdout, "Ring [TELEFON_1]")
    } finally {
      await proxy.stop()
    }
  })

  // 4. Optional local ONNX Swedish NER E2E lane (zero network, offline model)
  // ---------------------------------------------------------------------------
  if (hasLocalNerModel) {
    await test("Real local Swedish ONNX NER (offline): MCP + Guard + Proxy free-text names", async () => {
      const nerEnv = {
        MASKERA_MODEL_PATH: localModelsDir,
        MASKERA_MODEL_ID: "maskera-sv-ner-v20",
        MASKERA_ALLOW_REMOTE_MODELS: "0",
      }
      const { responses } = await runMcpSession(
        ["--profile=clinical"],
        [
          {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "maskera_redact",
              arguments: {
                text: "Patient Anna Lindqvist i Uppsala fick 500 mg Alvedon och CRP 45.",
                session_id: "ner",
              },
            },
          },
        ],
        nerEnv,
      )
      const redacted = responses[0].result.structuredContent.redacted
      assert.equal(redacted.includes("Anna Lindqvist"), false, `NER missed name: ${redacted}`)
      assert.equal(redacted.includes("Uppsala"), false, `NER missed place: ${redacted}`)
      assert.equal(redacted.includes("500 mg"), true, `clinical profile dropped dose: ${redacted}`)

      const guardNer = await runCli(
        ["guard"],
        JSON.stringify({ prompt: "Skicka avtalet till Erik Svensson i Malmö" }),
        nerEnv,
      )
      assert.equal(guardNer.code, 2)
      assert.equal(guardNer.stderr.includes("Erik Svensson"), false)
    })
  } else {
    console.log(
      "  skip  local ONNX NER lane (apps/demo/public/models/maskera-sv-ner-v20 not present)",
    )
  }

  console.log(`\n@maskera/mcp E2E PASS: ${passed} suites passed.`)
} finally {
  await rm(workDir, { recursive: true, force: true })
}
