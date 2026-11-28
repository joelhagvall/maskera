import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { createServer, type Server } from "node:http"
import { connect } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { brotliCompressSync } from "node:zlib"
import type { NerRecognizer } from "maskera"
import { afterEach, describe, expect, it } from "vitest"
import {
  createMaskeraEngine,
  createSseRestorer,
  deriveProxySessionId,
  extractGuardText,
  isLikelyEnglishSystemPrompt,
  type RunningMaskeraProxy,
  runGuard,
  StreamingRestorer,
  startMaskeraProxy,
} from "../src/index"

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const cliDistPath = join(pkgRoot, "dist", "cli.js")

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) {
    const fn = cleanups.pop()
    if (fn) await fn()
  }
})

function stubRecognizer(entities: Array<{ value: string; label: string }>): NerRecognizer {
  return {
    ready: Promise.resolve(),
    async detect(text: string) {
      const out = []
      for (const entity of entities) {
        let from = 0
        for (;;) {
          const idx = text.indexOf(entity.value, from)
          if (idx < 0) break
          out.push({
            start: idx,
            end: idx + entity.value.length,
            value: entity.value,
            label: entity.label,
          })
          from = idx + entity.value.length
        }
      }
      return out
    },
  }
}

async function startMockUpstream(
  handler: (req: {
    method: string
    url: string
    headers: Record<string, string | string[] | undefined>
    body: string
  }) => {
    status?: number
    headers?: Record<string, string>
    body?: string
    chunks?: string[]
  },
): Promise<{ url: string; server: Server; seen: Array<{ url: string; body: string }> }> {
  const seen: Array<{ url: string; body: string }> = []
  const server = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)))
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8")
      seen.push({ url: req.url ?? "/", body })
      const reply = handler({
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: req.headers,
        body,
      })
      res.writeHead(reply.status ?? 200, reply.headers ?? { "content-type": "application/json" })
      if (reply.chunks) {
        for (const c of reply.chunks) res.write(c)
        res.end()
      } else {
        res.end(reply.body ?? "{}")
      }
    })
  })
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen))
  const addr = server.address()
  const port = typeof addr === "object" && addr ? addr.port : 0
  cleanups.push(
    () =>
      new Promise<void>((resolveClose, rejectClose) =>
        server.close((err) => (err ? rejectClose(err) : resolveClose())),
      ),
  )
  return { url: `http://127.0.0.1:${port}`, server, seen }
}

describe("StreamingRestorer", () => {
  it("restores placeholders split across arbitrary byte/char boundaries and keeps literal brackets", () => {
    const r = new StreamingRestorer({
      "[NAMN_1]": "Anna Lindqvist",
      "[TELEFON_1]": "070-174 06 58",
    })
    const pieces = ["Hej [N", "AMN_", "1], arr[0] och [TEL", "EFON_1] + [OKÄND", "]!"]
    let out = ""
    for (const p of pieces) out += r.push(p)
    out += r.flush()
    expect(out).toBe("Hej Anna Lindqvist, arr[0] och 070-174 06 58 + [OKÄND]!")
  })

  it("escapes quotes when restoring inside streamed JSON arguments", () => {
    const r = new StreamingRestorer(
      { "[EGENT_1]": 'Projekt "Orion"' },
      { escapeForJsonString: true },
    )
    const out = `${r.push('{"note":"Se [EGE')}${r.push('NT_1]"}')}${r.flush()}`
    expect(JSON.parse(out)).toEqual({ note: 'Se Projekt "Orion"' })
  })
})

describe("createSseRestorer", () => {
  it("restores Anthropic text_delta and input_json_delta split across SSE events", () => {
    const sse = createSseRestorer({ "[NAMN_1]": "Anna Lindqvist" })
    const raw = [
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hej [NA"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"MN_1]!"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
    ]
    const out = `${raw.map((c) => sse.push(c)).join("")}${sse.flush()}`
    expect(out).toContain("Anna Lindqvist")
    expect(out).not.toContain("[NAMN_1]")
  })
})

describe("startMaskeraProxy (harness-agnostic LLM proxy)", () => {
  it("redacts Anthropic Messages JSON + tool_result upstream and restores text + tool_use locally", async () => {
    const upstream = await startMockUpstream(({ body }) => {
      const parsed = JSON.parse(body) as { messages: Array<{ content: string }> }
      // Echo back using placeholders only (simulating cloud LLM)
      return {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: `Uppfattat ${parsed.messages[0]?.content}` },
            {
              type: "tool_use",
              id: "tu_1",
              name: "write_note",
              input: { recipient: "[NAMN_1]", phone: "[TELEFON_1]" },
            },
          ],
        }),
      }
    })

    const engine = createMaskeraEngine({
      defaultMode: "auto",
      recognizer: stubRecognizer([{ value: "Anna Lindqvist", label: "NAMN" }]),
    })
    const proxy: RunningMaskeraProxy = await startMaskeraProxy({
      port: 0,
      anthropicUpstream: upstream.url,
      engine,
      customTerms: ["Projekt Orion"],
    })
    cleanups.push(() => proxy.close())

    const res = await fetch(`${proxy.url}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        messages: [
          {
            role: "user",
            content: "Kontakta Anna Lindqvist på 070-174 06 58 om Projekt Orion (19900101-2385).",
          },
        ],
      }),
    })

    expect(res.status).toBe(200)
    expect(Number(res.headers.get("x-maskera-redacted"))).toBeGreaterThanOrEqual(4)

    // Verify ZERO raw PII ever reached the upstream cloud API!
    const upstreamBody = upstream.seen[0]?.body ?? ""
    for (const secret of ["Anna Lindqvist", "070-174 06 58", "Projekt Orion", "19900101-2385"]) {
      expect(upstreamBody).not.toContain(secret)
    }
    expect(upstreamBody).toContain("[NAMN_1]")
    expect(upstreamBody).toContain("[TELEFON_1]")
    expect(upstreamBody).toContain("[EGENT_1]")
    expect(upstreamBody).toContain("[PERSONNUMMER_1]")

    // Verify the local client received the fully restored response + tool input!
    const json = (await res.json()) as {
      content: Array<{ text?: string; input?: { recipient: string; phone: string } }>
    }
    expect(json.content[0]?.text).toBe(
      "Uppfattat Kontakta Anna Lindqvist på 070-174 06 58 om Projekt Orion (19900101-2385).",
    )
    expect(json.content[1]?.input).toEqual({
      recipient: "Anna Lindqvist",
      phone: "070-174 06 58",
    })
  })

  it("redacts OpenAI Chat Completions SSE streaming and restores split placeholders", async () => {
    const upstream = await startMockUpstream(() => ({
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      chunks: [
        'data: {"id":"cmpl_1","choices":[{"index":0,"delta":{"content":"Ring [TEL"}}]}\n\n',
        'data: {"id":"cmpl_1","choices":[{"index":0,"delta":{"content":"EFON_1] eller mejla [EP"}}]}\n\n',
        'data: {"id":"cmpl_1","choices":[{"index":0,"delta":{"content":"OST_1]."}}]}\n\n',
        'data: {"id":"cmpl_1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ],
    }))

    const proxy = await startMaskeraProxy({
      port: 0,
      openaiUpstream: upstream.url,
      defaultMode: "rules",
    })
    cleanups.push(() => proxy.close())

    const res = await fetch(`${proxy.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        stream: true,
        messages: [{ role: "user", content: "Tel 070-174 06 58, anna@example.com" }],
      }),
    })

    expect(res.status).toBe(200)
    expect(upstream.seen[0]?.body).not.toContain("070-174 06 58")
    expect(upstream.seen[0]?.body).not.toContain("anna@example.com")

    const sseText = await res.text()
    const assembled = sseText
      .split("\n")
      .filter((l) => l.startsWith("data: ") && !l.includes("[DONE]"))
      .map((l) => JSON.parse(l.slice(6)) as { choices: Array<{ delta: { content?: string } }> })
      .map((chunk) => chunk.choices[0]?.delta.content ?? "")
      .join("")
    expect(assembled).toBe("Ring 070-174 06 58 eller mejla anna@example.com.")
  })

  it("redacts OpenAI Responses API requests and restores streaming output_text deltas", async () => {
    const upstream = await startMockUpstream(() => ({
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      chunks: [
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"Org [ORGANISA"}\n\n',
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"TIONSNUMMER_1]"}\n\n',
        'event: response.output_text.done\ndata: {"type":"response.output_text.done","output_index":0,"content_index":0,"text":"Org [ORGANISATIONSNUMMER_1]"}\n\n',
      ],
    }))

    const proxy = await startMaskeraProxy({
      port: 0,
      openaiUpstream: upstream.url,
      defaultMode: "rules",
    })
    cleanups.push(() => proxy.close())

    const res = await fetch(`${proxy.url}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5",
        stream: true,
        input: "Bolaget har org.nr 202100-4748.",
      }),
    })

    expect(res.status).toBe(200)
    expect(upstream.seen[0]?.body).not.toContain("202100-4748")
    const sseText = await res.text()
    expect(sseText).toContain("Org 202100-4748")
    expect(sseText).not.toContain("[ORGANISATIONSNUMMER_1]")

    // Status endpoint reports counts only, never raw PII
    const statusRes = await fetch(`${proxy.url}/_maskera/status`)
    const statusText = await statusRes.text()
    expect(statusRes.status).toBe(200)
    expect(statusText).not.toContain("202100-4748")
  })

  it("fails closed (502) and never forwards raw PII upstream if NER throws", async () => {
    const upstream = await startMockUpstream(() => ({ body: '{"ok":true}' }))
    const failingRecognizer: NerRecognizer = {
      get ready() {
        return Promise.reject(new Error("ner broken"))
      },
      async detect() {
        throw new Error("ner broken")
      },
    }
    const proxy = await startMaskeraProxy({
      port: 0,
      anthropicUpstream: upstream.url,
      engine: createMaskeraEngine({ defaultMode: "auto", recognizer: failingRecognizer }),
    })
    cleanups.push(() => proxy.close())

    const res = await fetch(`${proxy.url}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "Anna Lindqvist 19900101-2385" }],
      }),
    })
    expect(res.status).toBe(502)
    expect(upstream.seen).toHaveLength(0)
  })

  it("serves local inspector UI, keeps vault reveal opt-in, writes metadata-only audit log, and clears memory", async () => {
    const dir = await mkdtemp(join(tmpdir(), "maskera-audit-"))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const auditFile = join(dir, "audit.jsonl")

    const upstream = await startMockUpstream(() => ({
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        choices: [{ message: { role: "assistant", content: "Klart [TELEFON_1]" } }],
      }),
    }))

    const proxy = await startMaskeraProxy({
      port: 0,
      openaiUpstream: upstream.url,
      defaultMode: "rules",
      auditLogPath: auditFile,
    })
    cleanups.push(() => proxy.close())

    // HTML inspector serves cleanly
    const htmlRes = await fetch(proxy.inspectorUrl)
    expect(htmlRes.status).toBe(200)
    const html = await htmlRes.text()
    expect(html).toContain("Maskera lokal proxy-inspektör")
    expect(html).toContain("/_maskera/events")

    // Send one proxied request with PII
    const res = await fetch(`${proxy.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1",
        messages: [{ role: "user", content: "Ring 070-174 06 58 angående 19900101-2385" }],
      }),
    })
    expect(res.status).toBe(200)

    // Inspector keeps only redacted preview, never raw PII
    const recorded = proxy.inspector.list()
    expect(recorded).toHaveLength(1)
    expect(recorded[0]?.redactions).toBe(2)
    expect(recorded[0]?.counts).toEqual({ TELEFON: 1, PERSONNUMMER: 1 })
    expect(recorded[0]?.redactedPreview[0]).toBe("Ring [TELEFON_1] angående [PERSONNUMMER_1]")
    expect(JSON.stringify(recorded)).not.toContain("070-174 06 58")
    expect(JSON.stringify(recorded)).not.toContain("19900101-2385")

    // Vault endpoint refuses without explicit reveal header, returns entries when revealed
    const deniedVault = await fetch(`${proxy.url}/_maskera/vault`)
    expect(deniedVault.status).toBe(403)
    const revealedVault = await fetch(`${proxy.url}/_maskera/vault`, {
      headers: { "x-maskera-reveal": "1" },
    })
    expect(revealedVault.status).toBe(200)
    const vaultJson = (await revealedVault.json()) as {
      entries: Array<{ token: string; value: string }>
    }
    expect(
      vaultJson.entries.some((e) => e.token === "[TELEFON_1]" && e.value === "070-174 06 58"),
    ).toBe(true)

    // Audit JSONL contains counts only, never raw PII or previews
    await new Promise((r) => setTimeout(r, 30))
    const auditRaw = await readFile(auditFile, "utf8")
    expect(auditRaw).not.toContain("070-174 06 58")
    expect(auditRaw).not.toContain("19900101-2385")
    expect(auditRaw).not.toContain("Ring ")
    const auditLine = JSON.parse(auditRaw.trim()) as {
      redactions: number
      counts: Record<string, number>
    }
    expect(auditLine.redactions).toBe(2)
    expect(auditLine.counts).toEqual({ TELEFON: 1, PERSONNUMMER: 1 })

    // Clear requires explicit action header (blocks cross-origin simple POST CSRF)
    const deniedClear = await fetch(`${proxy.url}/_maskera/clear`, { method: "POST" })
    expect(deniedClear.status).toBe(403)
    const clearRes = await fetch(`${proxy.url}/_maskera/clear`, {
      method: "POST",
      headers: { "x-maskera-action": "clear" },
    })
    expect(clearRes.status).toBe(200)
    expect(proxy.inspector.list()).toHaveLength(0)
    expect(proxy.vault.size).toBe(0)
    const sse = createSseRestorer({ "[NAMN_1]": "Anna Lind", "[PERSONNUMMER_1]": "19900101-2385" })
    const out1 = sse.push(
      `event: content_block_delta\r\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hej [NAM" } })}\r\n\r`,
    )
    const out2 = sse.push(
      `\nevent: content_block_stop\r\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\r\n\r\n`,
    )
    const out3 = sse.push(
      `event: response.output_item.done\ndata: ${JSON.stringify({
        type: "response.output_item.done",
        item: {
          type: "function_call",
          arguments: '{"name":"[NAMN_1]"}',
          content: [{ type: "output_text", text: "Pnr [PERSONNUMMER_1]" }],
        },
      })}\n\n`,
    )
    const out4 = sse.push(
      `event: response.content_part.done\ndata: ${JSON.stringify({
        type: "response.content_part.done",
        part: { type: "output_text", text: "Del [NAMN_1]" },
      })}\n\n`,
    )
    const out5 = sse.push(
      `event: response.incomplete\ndata: ${JSON.stringify({
        type: "response.incomplete",
        response: { output_text: "Avbruten [PERSONNUMMER_1]" },
      })}\n\n`,
    )
    const out6 = sse.flush()
    expect(out1).toBe("")
    expect(out2.indexOf("Hej ")).toBeLessThan(out2.indexOf("[NAM"))
    expect(out3).toContain('\\"Anna Lind\\"')
    expect(out3).toContain("Pnr 19900101-2385")
    expect(out4).toContain("Del Anna Lind")
    expect(out5).toContain("Avbruten 19900101-2385")
    expect(out6).toBe("")
  })

  it("rejects WebSocket upgrades with 426 so Codex falls back to HTTP SSE immediately", async () => {
    const upstream = await startMockUpstream(() => ({ body: '{"ok":true}' }))
    const proxy = await startMaskeraProxy({
      port: 0,
      openaiUpstream: upstream.url,
      defaultMode: "rules",
    })
    cleanups.push(() => proxy.close())

    const rawRes = await new Promise<string>((resolveRes, rejectRes) => {
      const socket = connect(proxy.port, "127.0.0.1")
      let data = ""
      socket.on("connect", () => {
        socket.write(
          `GET /v1/responses HTTP/1.1\r\nHost: 127.0.0.1:${proxy.port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n`,
        )
      })
      socket.on("data", (c) => {
        data += c.toString("utf8")
      })
      socket.on("end", () => resolveRes(data))
      socket.on("error", rejectRes)
    })

    expect(rawRes).toMatch(/^HTTP\/1\.1 426 Upgrade Required/)
    expect(upstream.seen).toHaveLength(0)
  })

  it("shields Maskera MCP write/restore tool arguments from proxy placeholder overwrite across Claude, Codex, and OpenCode", () => {
    const map = { "[NAMN_1]": "ProxyName", "[EPOST_1]": "proxy@example.com" }

    // 1. Anthropic SSE: mcp__maskera__maskera_write_file stays untouched, other tools restore
    const anth = createSseRestorer(map)
    const anthOut =
      anth.push(
        `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "t1", name: "mcp__maskera__maskera_write_file", input: {} } })}\n\n` +
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"text":"Hej [NAMN_1] [EPOST_1]"}' } })}\n\n` +
          `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 0 })}\n\n` +
          `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "t2", name: "write_note", input: {} } })}\n\n` +
          `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"text":"Hej [NAMN_1]"}' } })}\n\n` +
          `event: content_block_stop\ndata: ${JSON.stringify({ type: "content_block_stop", index: 1 })}\n\n`,
      ) + anth.flush()
    expect(anthOut).toContain('{\\"text\\":\\"Hej [NAMN_1] [EPOST_1]\\"}')
    expect(anthOut).toContain('{\\"text\\":\\"Hej ProxyName\\"}')

    // 2. OpenAI Responses SSE: Codex maskera_write_file stays untouched
    const codex = createSseRestorer(map)
    const codexOut =
      codex.push(
        `event: response.output_item.added\ndata: ${JSON.stringify({ type: "response.output_item.added", output_index: 0, item: { type: "function_call", name: "maskera_write_file", arguments: "" } })}\n\n` +
          `event: response.function_call_arguments.delta\ndata: ${JSON.stringify({ type: "response.function_call_arguments.delta", output_index: 0, delta: '{"text":"[NAMN_1]"}' })}\n\n` +
          `event: response.function_call_arguments.done\ndata: ${JSON.stringify({ type: "response.function_call_arguments.done", output_index: 0, arguments: '{"text":"[NAMN_1]"}' })}\n\n` +
          `event: response.output_item.done\ndata: ${JSON.stringify({ type: "response.output_item.done", output_index: 0, item: { type: "function_call", name: "maskera_write_file", arguments: '{"text":"[NAMN_1]"}' } })}\n\n`,
      ) + codex.flush()
    expect(codexOut).not.toContain("ProxyName")
    expect(codexOut).toContain("[NAMN_1]")

    // 3. OpenAI Chat SSE: OpenCode Code Mode `execute` calling maskera_write_file stays untouched,
    //    while non-Maskera `execute` restores proxy placeholders.
    const oc = createSseRestorer(map)
    const ocMaskera =
      oc.push(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: "execute", arguments: '{"code":"await tools.maskera.maskera_write_file({ text: \\"[EPOST_1]\\" })"}' } }] } }] })}\n\n` +
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
      ) + oc.flush()
    expect(ocMaskera).toContain("[EPOST_1]")
    expect(ocMaskera).not.toContain("proxy@example.com")

    const ocOther = createSseRestorer(map)
    const ocRestored =
      ocOther.push(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: "execute", arguments: '{"code":"return \\"[EPOST_1]\\""}' } }] } }] })}\n\n` +
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
      ) + ocOther.flush()
    expect(ocRestored).toContain("proxy@example.com")

    // 3b. OpenAI-compatible providers (e.g. GLM) emit `finish_reason: ""` on
    //     intermediate SSE chunks; empty finish_reason must not flush early or
    //     clear the `execute` / Maskera tool shield across chunks.
    const ocEmptyFinish = createSseRestorer(map)
    const ocEmptyFinishOut =
      ocEmptyFinish.push(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: "execute", arguments: '{"code":"await tools.maskera.' } }] }, finish_reason: "" }] })}\n\n` +
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'maskera_write_file({ text: \\"Hej [NAMN_1] [EPOST_1]\\" })"}' } }] }, finish_reason: "" }] })}\n\n` +
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
      ) + ocEmptyFinish.flush()
    expect(ocEmptyFinishOut).toContain("[NAMN_1]")
    expect(ocEmptyFinishOut).toContain("[EPOST_1]")
    expect(ocEmptyFinishOut).not.toContain("ProxyName")
    expect(ocEmptyFinishOut).not.toContain("proxy@example.com")

    // Split text placeholder across chunks with `finish_reason: ""` still restores
    const splitEmptyFinish = createSseRestorer(map)
    const splitEmptyFinishOut =
      splitEmptyFinish.push(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "Hej [NA" }, finish_reason: "" }] })}\n\n` +
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "MN_1]!" }, finish_reason: "stop" }] })}\n\n`,
      ) + splitEmptyFinish.flush()
    expect(splitEmptyFinishOut).toContain("ProxyName!")

    // Single-underscore MCP tool prefix (e.g. `maskera_maskera_write_file`) stays shielded
    const singlePrefix = createSseRestorer(map)
    const singlePrefixOut =
      singlePrefix.push(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: "maskera_maskera_write_file", arguments: '{"text":"[NAMN_1]"}' } }] }, finish_reason: "" }] })}\n\n` +
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] })}\n\n`,
      ) + singlePrefix.flush()
    expect(singlePrefixOut).toContain("[NAMN_1]")
    expect(singlePrefixOut).not.toContain("ProxyName")

    // 4. Reasoning deltas (OpenAI Chat reasoning_content + Responses reasoning_summary_text)
    const reasonSse = createSseRestorer(map)
    const reasonOut =
      reasonSse.push(
        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { reasoning_content: "Tänker [NA" } }] })}\n\n` +
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { reasoning_content: "MN_1]" }, finish_reason: "stop" }] })}\n\n` +
          `event: response.reasoning_summary_text.delta\ndata: ${JSON.stringify({ type: "response.reasoning_summary_text.delta", output_index: 0, summary_index: 0, delta: "Not [EP" })}\n\n` +
          `event: response.reasoning_summary_text.delta\ndata: ${JSON.stringify({ type: "response.reasoning_summary_text.delta", output_index: 0, summary_index: 0, delta: "OST_1]" })}\n\n` +
          `event: response.reasoning_summary_text.done\ndata: ${JSON.stringify({ type: "response.reasoning_summary_text.done", output_index: 0, summary_index: 0, text: "Not [EPOST_1]" })}\n\n`,
      ) + reasonSse.flush()
    expect(reasonOut).toContain("ProxyName")
    expect(reasonOut).toContain("proxy@example.com")
  })

  it("decompresses Brotli request bodies, rejects unsupported encodings with 415, and redacts Codex namespace tools with rules only", async () => {
    let nerCalls = 0
    const upstream = await startMockUpstream(() => ({
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    }))
    const proxy = await startMaskeraProxy({
      port: 0,
      openaiUpstream: upstream.url,
      customTerms: ["Projekt Orion"],
      engine: createMaskeraEngine({
        defaultMode: "auto",
        recognizer: {
          ready: Promise.resolve(),
          async detect(text) {
            nerCalls += 1
            return stubRecognizer([{ value: "Anna Lindqvist", label: "NAMN" }]).detect(text)
          },
        },
      }),
    })
    cleanups.push(() => proxy.close())

    const brPayload = brotliCompressSync(
      Buffer.from(
        JSON.stringify({
          model: "gpt-5.4",
          tools: [
            {
              type: "namespace",
              name: "mcp__custom",
              description: "Runs a command for Projekt Orion",
              tools: [
                {
                  type: "function",
                  name: "lookup",
                  description: "Call 070-174 06 58 for Projekt Orion",
                },
              ],
            },
          ],
          input: "Hej Anna Lindqvist",
        }),
      ),
    )

    const okRes = await fetch(`${proxy.url}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-encoding": "br" },
      body: brPayload,
    })
    expect(okRes.status).toBe(200)
    // Tool descriptions must run rules + customTerms (0 NER calls), user input runs NER (1 call).
    expect(nerCalls).toBe(1)
    const sent = upstream.seen[0]?.body ?? ""
    expect(sent).not.toContain("070-174 06 58")
    expect(sent).not.toContain("Projekt Orion")
    expect(sent).not.toContain("Anna Lindqvist")
    expect(sent).toContain("[NAMN_1]")

    const badEnc = await fetch(`${proxy.url}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json", "content-encoding": "lz4" },
      body: "not-decoded",
    })
    expect(badEnc.status).toBe(415)
    expect(upstream.seen).toHaveLength(1)
  })
})

describe("guard (harness-agnostic pre-prompt / pre-tool / pipe check)", () => {
  it("extracts text from plain strings and Claude/Cursor JSON hook envelopes", () => {
    expect(extractGuardText('{"prompt":"Hej 19900101-2385"}')).toEqual({
      text: "Hej 19900101-2385",
      isHookEnvelope: true,
    })
    expect(extractGuardText('{"tool_input":{"content":"Ring 070-174 06 58"}}')).toEqual({
      text: "Ring 070-174 06 58",
      isHookEnvelope: true,
    })
    expect(extractGuardText("Vanlig text")).toEqual({
      text: "Vanlig text",
      isHookEnvelope: false,
    })
  })

  it("blocks PII with counts and never leaks values, passes clean text", async () => {
    const engine = createMaskeraEngine({ defaultMode: "rules" })
    const blocked = await runGuard('{"prompt":"Ring 070-174 06 58"}', engine)
    expect(blocked.blocked).toBe(true)
    expect(blocked.counts).toEqual({ TELEFON: 1 })
    expect(blocked.redacted).toBe("Ring [TELEFON_1]")

    const clean = await runGuard("Skriv en funktion som sorterar en lista.", engine)
    expect(clean.blocked).toBe(false)
    expect(clean.totalRedactions).toBe(0)
  })

  it.runIf(existsSync(cliDistPath))(
    "CLI guard exits 2 on PII (without echoing raw PII) and 0 with --redact",
    async () => {
      const runCli = (args: string[], input: string) =>
        new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveRun) => {
          const child = spawn(process.execPath, [cliDistPath, ...args], {
            stdio: ["pipe", "pipe", "pipe"],
          })
          let stdout = ""
          let stderr = ""
          child.stdout.on("data", (c: Buffer) => {
            stdout += c.toString("utf8")
          })
          child.stderr.on("data", (c: Buffer) => {
            stderr += c.toString("utf8")
          })
          child.on("close", (code) => resolveRun({ code, stdout, stderr }))
          child.stdin.end(input)
        })

      const blocked = await runCli(["guard", "--rules-only"], '{"prompt":"Pnr 19900101-2385"}')
      expect(blocked.code).toBe(2)
      expect(blocked.stderr).toContain("PERSONNUMMER=1")
      expect(blocked.stderr).not.toContain("19900101-2385")

      const redacted = await runCli(["guard", "--rules-only", "--redact"], "Pnr 19900101-2385")
      expect(redacted.code).toBe(0)
      expect(redacted.stdout).toBe("Pnr [PERSONNUMMER_1]")
    },
  )

  it("serves POST /_maskera/self-test with same-origin guard, zero PII leak, and clean user stats", async () => {
    const proxy = await startMaskeraProxy({
      port: 0,
      defaultMode: "rules",
    })
    try {
      const uiHtml = await (await fetch(proxy.inspectorUrl)).text()
      expect(uiHtml).toContain("Maskera lokal proxy-inspektör")
      expect(uiHtml).toContain("Kör självtest")
      expect(uiHtml).toContain("Kopiera testmening")

      const rejected = await fetch(`${proxy.url}/_maskera/self-test`, { method: "POST" })
      expect(rejected.status).toBe(403)

      const res = await fetch(`${proxy.url}/_maskera/self-test`, {
        method: "POST",
        headers: { "x-maskera-action": "self-test" },
      })
      expect(res.status).toBe(200)
      const bodyText = await res.text()
      expect(bodyText).not.toContain("19900101-2385")
      expect(bodyText).not.toContain("provnamn.maskera@example.com")
      const report = JSON.parse(bodyText) as {
        schema: string
        ok: boolean
        sampleProof: { rawPiiLeaked: boolean; roundtripRestored: boolean }
        checks: Array<{ name: string; status: string }>
      }
      expect(report.schema).toBe("maskera-setup-receipt/v1")
      expect(report.ok).toBe(true)
      expect(report.sampleProof.rawPiiLeaked).toBe(false)
      expect(report.sampleProof.roundtripRestored).toBe(true)
      expect(report.checks.find((c) => c.name === "mcp-http")?.status).toBe("ok")
      // Self-test probe must not inflate real client request stats or pollute vault
      expect(proxy.stats().requests).toBe(0)
      expect(proxy.vault.list()).toHaveLength(0)

      // POST /_maskera/guard enforces same-origin action header and runs on warm engine
      const guardRejected = await fetch(`${proxy.url}/_maskera/guard`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ raw: "Pnr 19900101-2385" }),
      })
      expect(guardRejected.status).toBe(403)

      const { runGuardViaWarmProxy } = await import("../src/index")
      // Non-loopback URLs must be rejected safely (return null without sending data)
      const remoteSkip = await runGuardViaWarmProxy("Pnr 19900101-2385", {
        proxyUrl: "https://example.com",
      })
      expect(remoteSkip).toBeNull()

      const warmBlock = await runGuardViaWarmProxy('{"prompt":"Ring 070-174 06 58"}', {
        proxyUrl: proxy.url,
        mode: "rules",
      })
      expect(warmBlock).toBeTruthy()
      expect(warmBlock?.blocked).toBe(true)
      expect(warmBlock?.counts.TELEFON).toBe(1)
      expect(warmBlock?.redacted).toBe("")

      const warmRedact = await runGuardViaWarmProxy("Ring 070-174 06 58", {
        proxyUrl: proxy.url,
        mode: "rules",
        includeRedacted: true,
      })
      expect(warmRedact?.redacted).toBe("Ring [TELEFON_1]")
      expect(proxy.vault.list()).toHaveLength(0)
    } finally {
      await proxy.close()
    }
  })

  it("blocks fail-open bypasses, isolates /mcp and proxy vaults, refuses non-loopback bind, and redacts numeric guard JSON", async () => {
    // Non-loopback bind refused by default
    await expect(
      startMaskeraProxy({ host: [0, 0, 0, 0].join("."), port: 0, defaultMode: "rules" }),
    ).rejects.toThrow(/non-loopback/i)

    // Guard --redact masks numeric PII inside JSON envelopes
    const guardNum = await runGuard(
      JSON.stringify({ tool_input: { personnummer: 199001012385 } }),
      createMaskeraEngine({ defaultMode: "rules" }),
      { preserveJsonStructure: true },
    )
    expect(guardNum.blocked).toBe(true)
    expect(guardNum.redacted).not.toContain("199001012385")
    expect(guardNum.redacted).toContain("[PERSONNUMMER_1]")

    const upstream = await startMockUpstream(() => ({
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ok: true }),
    }))
    const proxy = await startMaskeraProxy({
      port: 0,
      upstream: upstream.url,
      defaultMode: "rules",
    })
    cleanups.push(() => proxy.close())

    // Percent-encoded path is redacted
    const pct = await fetch(`${proxy.url}/v1/%6dessages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "19900101-2385" }] }),
    })
    expect(pct.status).toBe(200)
    expect(upstream.seen[0]?.body).not.toContain("19900101-2385")

    // Non-JSON content-type on redaction path fails closed with 415
    const ctSmuggle = await fetch(`${proxy.url}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: JSON.stringify({ messages: [{ role: "user", content: "19900101-2385" }] }),
    })
    expect(ctSmuggle.status).toBe(415)
    expect(upstream.seen).toHaveLength(1)

    // Responses custom_tool_call item.input and base64 text document are redacted
    await fetch(`${proxy.url}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        input: [{ type: "custom_tool_call", name: "apply_patch", input: "Pnr 19900101-2385" }],
      }),
    })
    expect(upstream.seen[1]?.body).not.toContain("19900101-2385")

    // Cross-session isolation between /mcp sessions and proxy vault
    const initA = await fetch(proxy.mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25" },
      }),
    })
    const sidA = initA.headers.get("mcp-session-id") ?? ""
    const initB = await fetch(proxy.mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25" },
      }),
    })
    const sidB = initB.headers.get("mcp-session-id") ?? ""

    await fetch(proxy.mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json", "mcp-session-id": sidA },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "maskera_redact",
          arguments: { text: "provnamn.maskera@example.com", session_id: "s" },
        },
      }),
    })
    const steal = await (
      await fetch(proxy.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "mcp-session-id": sidB },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "maskera_restore", arguments: { text: "[EPOST_1]", session_id: "s" } },
        }),
      })
    ).text()
    expect(steal).not.toContain("provnamn.maskera@example.com")

    const stealProxy = await (
      await fetch(proxy.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "mcp-session-id": sidB },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "maskera_restore",
            arguments: { text: "[PERSONNUMMER_1]", session_id: "proxy" },
          },
        }),
      })
    ).text()
    expect(stealProxy).not.toContain("19900101-2385")
  })

  it("avoids Swedish NER over-masking on long English system prompts while keeping rules, customTerms, and Swedish prompts protected", async () => {
    const englishSystem =
      "You are a helpful coding assistant. Always read the files before editing code, use the available tools carefully, and return concise output when responding to user instructions. Never modify unrelated files or skip verification commands when checking your response. Keep tool arguments valid and follow repository conventions at all times. Contact support at provnamn.maskera@example.com for ProjectOrion issues."
    expect(isLikelyEnglishSystemPrompt(englishSystem)).toBe(true)
    expect(isLikelyEnglishSystemPrompt("Summarize patient Anna Lindqvist.")).toBe(false)
    expect(
      isLikelyEnglishSystemPrompt(
        `${englishSystem}\n\nPå svenska: sammanfatta ärendet för Anna Lindqvist.`,
      ),
    ).toBe(false)

    const upstream = await startMockUpstream(() => ({
      body: JSON.stringify({ id: "msg_1", content: [{ type: "text", text: "ok" }] }),
    }))
    const engine = createMaskeraEngine({
      defaultMode: "auto",
      recognizer: stubRecognizer([
        { value: "Always", label: "NAMN" },
        { value: "Anna Lindqvist", label: "NAMN" },
      ]),
    })
    const proxy = await startMaskeraProxy({
      port: 0,
      upstream: upstream.url,
      engine,
      customTerms: ["ProjectOrion"],
    })
    cleanups.push(() => proxy.close())

    await fetch(`${proxy.url}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        system: englishSystem,
        messages: [{ role: "user", content: "Hej Anna Lindqvist" }],
      }),
    })
    const seenBody = upstream.seen[0]?.body ?? ""
    expect(seenBody).toContain("Always read the files")
    expect(seenBody).not.toContain("provnamn.maskera@example.com")
    expect(seenBody).not.toContain("ProjectOrion")
    expect(seenBody).not.toContain("Anna Lindqvist")
  })

  it("answers browser icon probes locally (204) and handles Claude Code system-reminder + upstream error details cleanly", async () => {
    const upstream = await startMockUpstream(() => ({
      status: 429,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "error",
        error: {
          type: "rate_limit_error",
          message: "Rate limit exceeded for account provnamn.maskera@example.com.",
        },
      }),
    }))

    const engine = createMaskeraEngine({
      defaultMode: "auto",
      recognizer: stubRecognizer([
        { value: "Claude Code", label: "NAMN" },
        { value: "Anthropic", label: "ORGANISATION" },
        { value: "Always", label: "NAMN" },
        { value: "Anna Lindqvist", label: "NAMN" },
      ]),
    })
    const proxy = await startMaskeraProxy({
      port: 0,
      upstream: upstream.url,
      engine,
    })
    cleanups.push(() => proxy.close())

    // Browser icon probes must never hit upstream or pollute the inspector
    for (const probePath of [
      "/favicon.ico",
      "/apple-touch-icon.png",
      "/apple-touch-icon-precomposed.png",
      "/robots.txt",
    ]) {
      const probeRes = await fetch(`${proxy.url}${probePath}`)
      expect(probeRes.status).toBe(204)
    }
    expect(upstream.seen).toHaveLength(0)
    expect(proxy.inspector.list()).toHaveLength(0)

    // Inspector HTML uses local time formatting rather than raw UTC slicing
    const inspectorHtml = await (await fetch(proxy.inspectorUrl)).text()
    expect(inspectorHtml).toContain("toLocaleTimeString")

    // Claude Code sends CLI billing/identity headers in system[] and long
    // English <system-reminder> lists inside user messages.
    const reminderList = [
      "<system-reminder>",
      "- Always read the existing files before editing code or running git commands in this repository.",
      "- Never commit or push changes unless explicitly asked and always check test output first.",
      "- På svenska: sammanfatta ärendet för Anna Lindqvist.",
      "</system-reminder>",
      "Skriv ett kort mejl till Anna Lindqvist (19900101-2385).",
    ].join("\n")

    const res = await fetch(`${proxy.url}/v1/messages?beta=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        system: [
          { type: "text", text: "x-anthropic-billing-header: cc_version=2.1.0; cch=abc123;" },
          { type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." },
        ],
        messages: [{ role: "user", content: reminderList }],
      }),
    })
    expect(res.status).toBe(429)
    expect(upstream.seen).toHaveLength(1)

    const seenBody = upstream.seen[0]?.body ?? ""
    // CLI headers and English reminder bullets stay intact (no Swedish NER false positives)
    expect(seenBody).toContain("x-anthropic-billing-header: cc_version=2.1.0")
    expect(seenBody).toContain("You are Claude Code, Anthropic's official CLI for Claude.")
    expect(seenBody).toContain("Always read the existing files before editing code")
    // Swedish text inside reminder AND the user prompt are still fully redacted
    expect(seenBody).not.toContain("Anna Lindqvist")
    expect(seenBody).not.toContain("19900101-2385")

    // Inspector records the user prompt preview first and surfaces a redacted 429 error detail
    const recorded = proxy.inspector.list()
    expect(recorded).toHaveLength(1)
    expect(recorded[0]?.redactedPreview[0]).toContain("Skriv ett kort mejl till [NAMN_1]")
    expect(recorded[0]?.errorDetail).toContain("rate_limit_error")
    expect(recorded[0]?.errorDetail).not.toContain("provnamn.maskera@example.com")
  })

  it("isolates proxy sessions per client auth/cache key when x-maskera-session is omitted", async () => {
    expect(deriveProxySessionId({ authorization: "Bearer key-a", "user-agent": "cli/1" })).not.toBe(
      deriveProxySessionId({ authorization: "Bearer key-b", "user-agent": "cli/1" }),
    )
    expect(deriveProxySessionId({}, { prompt_cache_key: "thread-1" })).not.toBe(
      deriveProxySessionId({}, { prompt_cache_key: "thread-2" }),
    )

    const upstream = await startMockUpstream(() => ({
      body: JSON.stringify({
        id: "chatcmpl_1",
        choices: [
          {
            message: {
              role: "assistant",
              content: "Ref: [PERSONNUMMER_1]",
              reasoning: "Checking [PERSONNUMMER_1]",
            },
          },
        ],
      }),
    }))
    const proxy = await startMaskeraProxy({
      port: 0,
      upstream: upstream.url,
      defaultMode: "rules",
    })
    cleanups.push(() => proxy.close())

    // Client A populates [PERSONNUMMER_1] = 19900101-2385
    const resA = await (
      await fetch(`${proxy.url}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer client-a-key",
        },
        body: JSON.stringify({
          model: "gpt-5",
          messages: [{ role: "user", content: "Pnr 19900101-2385" }],
        }),
      })
    ).text()
    expect(resA).toContain("19900101-2385")
    expect(resA).not.toContain("[PERSONNUMMER_1]")

    // Client B with a different key must NOT restore Client A's [PERSONNUMMER_1]
    const resB = await (
      await fetch(`${proxy.url}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer client-b-key",
        },
        body: JSON.stringify({
          model: "gpt-5",
          messages: [{ role: "user", content: "No PII here" }],
        }),
      })
    ).text()
    expect(resB).not.toContain("19900101-2385")
  })

  it("warns on binary attachments by default and rejects them with 415 when blockBinary is enabled", async () => {
    const upstream = await startMockUpstream(() => ({
      body: JSON.stringify({ id: "msg_bin", content: [{ type: "text", text: "ok" }] }),
    }))
    const payload = JSON.stringify({
      model: "claude-sonnet-4-6",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", content: "Kolla bilden" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: Buffer.from([137, 80, 78, 71, 0, 1]).toString("base64"),
              },
            },
          ],
        },
      ],
    })

    const warnProxy = await startMaskeraProxy({
      port: 0,
      upstream: upstream.url,
      defaultMode: "rules",
    })
    cleanups.push(() => warnProxy.close())

    const warnRes = await fetch(`${warnProxy.url}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    })
    expect(warnRes.status).toBe(200)
    expect(warnRes.headers.get("x-maskera-warning")).toBe("uninspectable-binary-attachment")
    expect(warnProxy.inspector.list()[0]?.warnings?.[0]).toContain("image/png")
    expect(upstream.seen).toHaveLength(1)

    const strictProxy = await startMaskeraProxy({
      port: 0,
      upstream: upstream.url,
      defaultMode: "rules",
      blockBinary: true,
    })
    cleanups.push(() => strictProxy.close())

    const blockedRes = await fetch(`${strictProxy.url}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
    })
    expect(blockedRes.status).toBe(415)
    expect(upstream.seen).toHaveLength(1)
  })
})
