import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { createServer, type Server } from "node:http"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { NerRecognizer } from "maskera"
import { afterEach, describe, expect, it } from "vitest"
import {
  createMaskeraEngine,
  createSseRestorer,
  extractGuardText,
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
})
