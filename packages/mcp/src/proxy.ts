import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import type { RedactionProfile } from "maskera"
import { createMaskeraEngine, type MaskeraEngine, type MaskMode } from "./engine"
import { SessionVault } from "./vault"

export interface ProxyOptions {
  /** Bind address. Defaults to loopback `127.0.0.1` for local safety. */
  host?: string
  /** Listening port. Defaults to `8787` (`0` picks an ephemeral port). */
  port?: number
  /** Explicit upstream base URL (overrides automatic Anthropic/OpenAI routing). */
  upstream?: string
  /** Upstream URL for Anthropic routes when `upstream` is unset. */
  anthropicUpstream?: string
  /** Upstream URL for OpenAI routes when `upstream` is unset. */
  openaiUpstream?: string
  /** Optional custom MaskeraEngine. */
  engine?: MaskeraEngine
  /** Optional custom SessionVault. */
  vault?: SessionVault
  /** Default mode if creating a new engine (`"auto"` or `"rules"`). */
  defaultMode?: MaskMode
  /** Optional built-in precision profile (`"general"` or `"clinical"`). */
  profile?: RedactionProfile
  /** Optional extra protected terms (client names, codenames, case IDs). */
  customTerms?: readonly string[]
  /** Restore placeholders in upstream responses. Default `true`. */
  restoreResponses?: boolean
  /** Optional safe metadata logger (never receives raw PII). */
  onLog?: (message: string) => void
}

export interface RunningMaskeraProxy {
  readonly url: string
  readonly host: string
  readonly port: number
  readonly server: Server
  readonly vault: SessionVault
  close(): Promise<void>
}

interface RedactStats {
  redactions: number
  counts: Record<string, number>
}

const DEFAULT_ANTHROPIC_UPSTREAM = "https://api.anthropic.com"
const DEFAULT_OPENAI_UPSTREAM = "https://api.openai.com"
const MAX_BODY_BYTES = 16 * 1024 * 1024 // 16 MiB

const HOP_BY_HOP_REQUEST_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "accept-encoding",
])

const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "content-encoding",
])

/**
 * Incremental placeholder restorer for streamed LLM responses (SSE deltas).
 *
 * Holds back only a tiny trailing suffix when it is a prefix of a known
 * placeholder (e.g. `"[NAM"` while waiting for `"N_1]"`), flushing all safe
 * characters immediately so streaming stays low-latency without dropping
 * split placeholders.
 */
export class StreamingRestorer {
  private buffer = ""
  private readonly tokens: readonly string[]
  private readonly map: Readonly<Record<string, string>>
  private readonly maxTokenLength: number
  private readonly escapeForJsonString: boolean

  constructor(
    map: Readonly<Record<string, string>>,
    options: { escapeForJsonString?: boolean } = {},
  ) {
    this.map = map
    this.tokens = Object.keys(map).sort((a, b) => b.length - a.length)
    this.maxTokenLength = this.tokens.reduce((max, t) => Math.max(max, t.length), 0)
    this.escapeForJsonString = options.escapeForJsonString === true
  }

  private formatReplacement(value: string): string {
    if (!this.escapeForJsonString) return value
    // Escape as interior of a JSON string (strip surrounding quotes).
    return JSON.stringify(value).slice(1, -1)
  }

  push(chunk: string): string {
    if (!chunk || this.tokens.length === 0) return chunk
    this.buffer += chunk
    return this.drain(false)
  }

  flush(): string {
    if (!this.buffer) return ""
    return this.drain(true)
  }

  private drain(final: boolean): string {
    let out = ""
    let cursor = 0
    const buf = this.buffer

    while (cursor < buf.length) {
      const bracket = buf.indexOf("[", cursor)
      if (bracket < 0) {
        out += buf.slice(cursor)
        cursor = buf.length
        break
      }

      if (bracket > cursor) {
        out += buf.slice(cursor, bracket)
        cursor = bracket
      }

      const remaining = buf.slice(cursor)

      // Check for an exact placeholder match at `cursor`.
      let matchedToken: string | null = null
      for (const token of this.tokens) {
        if (remaining.startsWith(token)) {
          matchedToken = token
          break
        }
      }
      if (matchedToken) {
        out += this.formatReplacement(this.map[matchedToken] ?? matchedToken)
        cursor += matchedToken.length
        continue
      }

      // If not final and `remaining` is a strict prefix of any known token,
      // wait for more streamed bytes before deciding.
      if (!final && remaining.length < this.maxTokenLength) {
        const couldMatch = this.tokens.some((token) => token.startsWith(remaining))
        if (couldMatch) {
          break
        }
      }

      // Not a placeholder: emit `[` literally and advance by 1.
      out += "["
      cursor += 1
    }

    this.buffer = buf.slice(cursor)
    return out
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function mergeCounts(target: Record<string, number>, delta: Record<string, number>): void {
  for (const [k, v] of Object.entries(delta)) {
    target[k] = (target[k] ?? 0) + v
  }
}

function escapeJsonStringValue(value: string): string {
  return JSON.stringify(value).slice(1, -1)
}

function restorePlainText(text: string, map: Readonly<Record<string, string>>): string {
  if (!text || Object.keys(map).length === 0) return text
  const r = new StreamingRestorer(map)
  return r.push(text) + r.flush()
}

function restoreJsonEncodedText(text: string, map: Readonly<Record<string, string>>): string {
  if (!text || Object.keys(map).length === 0) return text
  // Try parsing as JSON first to restore string leaves cleanly without
  // breaking JSON syntax even if restored values contain quotes or newlines.
  try {
    const parsed = JSON.parse(text) as unknown
    const restored = restoreJsonLeaves(parsed, map)
    return JSON.stringify(restored)
  } catch {
    const r = new StreamingRestorer(map, { escapeForJsonString: true })
    return r.push(text) + r.flush()
  }
}

function restoreJsonLeaves(value: unknown, map: Readonly<Record<string, string>>): unknown {
  if (typeof value === "string") return restorePlainText(value, map)
  if (Array.isArray(value)) return value.map((item) => restoreJsonLeaves(item, map))
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = restoreJsonLeaves(v, map)
    }
    return out
  }
  return value
}

/**
 * Redacts all user/tool/system text fields in an Anthropic Messages, OpenAI
 * Chat Completions, or OpenAI Responses request body before it leaves the
 * local machine.
 */
export async function redactLlmRequestBody(
  body: Record<string, unknown>,
  redactString: (text: string) => Promise<string>,
): Promise<Record<string, unknown>> {
  const clone = structuredClone(body)

  async function redactContentBlocks(blocks: unknown[]): Promise<void> {
    for (const block of blocks) {
      if (!isPlainObject(block)) continue
      if (typeof block.text === "string") {
        block.text = await redactString(block.text)
      }
      if (typeof block.content === "string") {
        block.content = await redactString(block.content)
      } else if (Array.isArray(block.content)) {
        await redactContentBlocks(block.content)
      }
      if (typeof block.output === "string") {
        block.output = await redactString(block.output)
      }
      if (typeof block.arguments === "string") {
        block.arguments = await redactJsonStringOrText(block.arguments)
      }
      if (isPlainObject(block.input)) {
        block.input = await redactObjectStrings(block.input)
      }
    }
  }

  async function redactObjectStrings(value: unknown): Promise<unknown> {
    if (typeof value === "string") return redactString(value)
    if (Array.isArray(value)) {
      const out = []
      for (const item of value) out.push(await redactObjectStrings(item))
      return out
    }
    if (isPlainObject(value)) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) {
        out[k] = await redactObjectStrings(v)
      }
      return out
    }
    return value
  }

  async function redactJsonStringOrText(raw: string): Promise<string> {
    try {
      const parsed = JSON.parse(raw) as unknown
      const redacted = await redactObjectStrings(parsed)
      return JSON.stringify(redacted)
    } catch {
      return redactString(raw)
    }
  }

  // Anthropic `system` / OpenAI Responses `instructions`
  if (typeof clone.system === "string") {
    clone.system = await redactString(clone.system)
  } else if (Array.isArray(clone.system)) {
    await redactContentBlocks(clone.system)
  }

  if (typeof clone.instructions === "string") {
    clone.instructions = await redactString(clone.instructions)
  }

  // Anthropic Messages & OpenAI Chat Completions `messages`
  if (Array.isArray(clone.messages)) {
    for (const msg of clone.messages) {
      if (!isPlainObject(msg)) continue
      if (typeof msg.content === "string") {
        msg.content = await redactString(msg.content)
      } else if (Array.isArray(msg.content)) {
        await redactContentBlocks(msg.content)
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const call of msg.tool_calls) {
          if (isPlainObject(call) && isPlainObject(call.function)) {
            if (typeof call.function.arguments === "string") {
              call.function.arguments = await redactJsonStringOrText(call.function.arguments)
            }
          }
        }
      }
    }
  }

  // OpenAI Responses API `input`
  if (typeof clone.input === "string") {
    clone.input = await redactString(clone.input)
  } else if (Array.isArray(clone.input)) {
    for (let i = 0; i < clone.input.length; i++) {
      const item = clone.input[i]
      if (typeof item === "string") {
        clone.input[i] = await redactString(item)
      } else if (isPlainObject(item)) {
        if (typeof item.text === "string") item.text = await redactString(item.text)
        if (typeof item.content === "string") {
          item.content = await redactString(item.content)
        } else if (Array.isArray(item.content)) {
          await redactContentBlocks(item.content)
        }
        if (typeof item.output === "string") {
          item.output = await redactString(item.output)
        }
        if (typeof item.arguments === "string") {
          item.arguments = await redactJsonStringOrText(item.arguments)
        }
      }
    }
  }

  return clone
}

/**
 * Restores Maskera placeholders in a non-streaming Anthropic or OpenAI JSON
 * response without touching IDs, model names, or usage metadata.
 */
export function restoreLlmResponseBody(
  body: unknown,
  map: Readonly<Record<string, string>>,
): unknown {
  if (!isPlainObject(body) || Object.keys(map).length === 0) return body
  const clone = structuredClone(body)

  // Anthropic Messages: `content: [{ type: "text", text }, { type: "tool_use", input }]`
  if (Array.isArray(clone.content)) {
    for (const block of clone.content) {
      if (!isPlainObject(block)) continue
      if (typeof block.text === "string") {
        block.text = restorePlainText(block.text, map)
      }
      if (typeof block.thinking === "string") {
        block.thinking = restorePlainText(block.thinking, map)
      }
      if (isPlainObject(block.input)) {
        block.input = restoreJsonLeaves(block.input, map)
      }
    }
  }

  // OpenAI Chat Completions: `choices[].message.{content, tool_calls[].function.arguments}`
  if (Array.isArray(clone.choices)) {
    for (const choice of clone.choices) {
      if (!isPlainObject(choice)) continue
      const msg = choice.message
      if (isPlainObject(msg)) {
        if (typeof msg.content === "string") {
          msg.content = restorePlainText(msg.content, map)
        }
        if (Array.isArray(msg.tool_calls)) {
          for (const call of msg.tool_calls) {
            if (isPlainObject(call) && isPlainObject(call.function)) {
              if (typeof call.function.arguments === "string") {
                call.function.arguments = restoreJsonEncodedText(call.function.arguments, map)
              }
            }
          }
        }
      }
      if (typeof choice.text === "string") {
        choice.text = restorePlainText(choice.text, map)
      }
    }
  }

  // OpenAI Responses API: `output[].content[].text`, `output[].arguments`, `output_text`
  if (typeof clone.output_text === "string") {
    clone.output_text = restorePlainText(clone.output_text, map)
  }
  if (Array.isArray(clone.output)) {
    for (const item of clone.output) {
      if (!isPlainObject(item)) continue
      if (typeof item.arguments === "string") {
        item.arguments = restoreJsonEncodedText(item.arguments, map)
      }
      if (Array.isArray(item.content)) {
        for (const part of item.content) {
          if (isPlainObject(part) && typeof part.text === "string") {
            part.text = restorePlainText(part.text, map)
          }
        }
      }
    }
  }

  return clone
}

/**
 * Transforms an SSE (`text/event-stream`) stream from Anthropic or OpenAI,
 * incrementally restoring Maskera placeholders even when split across chunks.
 */
export function createSseRestorer(map: Readonly<Record<string, string>>) {
  const streams = new Map<string, StreamingRestorer>()
  const getStream = (key: string, escapeForJsonString = false): StreamingRestorer => {
    let r = streams.get(key)
    if (!r) {
      r = new StreamingRestorer(map, { escapeForJsonString })
      streams.set(key, r)
    }
    return r
  }

  function flushStream(key: string): string {
    const r = streams.get(key)
    if (!r) return ""
    streams.delete(key)
    return r.flush()
  }

  let sseBuffer = ""

  function processEventBlock(block: string): string {
    const lines = block.split("\n")
    const outLines: string[] = []
    const extraEvents: string[] = []

    for (const line of lines) {
      if (!line.startsWith("data:")) {
        outLines.push(line)
        continue
      }
      const rawData = line.slice("data:".length).trimStart()
      if (!rawData || rawData === "[DONE]") {
        // Flush any remaining buffered text before `[DONE]`.
        for (const key of [...streams.keys()]) {
          const tail = flushStream(key)
          if (!tail) continue
          if (key.startsWith("openai_chat_text:")) {
            const idx = Number(key.split(":")[1] ?? 0)
            extraEvents.push(
              `data: ${JSON.stringify({ choices: [{ index: idx, delta: { content: tail } }] })}`,
            )
          } else if (key.startsWith("openai_chat_tool:")) {
            const [, cIdx, tIdx] = key.split(":")
            extraEvents.push(
              `data: ${JSON.stringify({
                choices: [
                  {
                    index: Number(cIdx ?? 0),
                    delta: {
                      tool_calls: [{ index: Number(tIdx ?? 0), function: { arguments: tail } }],
                    },
                  },
                ],
              })}`,
            )
          }
        }
        outLines.push(line)
        continue
      }

      let parsed: unknown
      try {
        parsed = JSON.parse(rawData)
      } catch {
        outLines.push(line)
        continue
      }

      if (!isPlainObject(parsed)) {
        outLines.push(line)
        continue
      }

      // 1) Anthropic Messages SSE events
      if (parsed.type === "content_block_delta" && isPlainObject(parsed.delta)) {
        const idx = typeof parsed.index === "number" ? parsed.index : 0
        if (parsed.delta.type === "text_delta" && typeof parsed.delta.text === "string") {
          parsed.delta.text = getStream(`anth_text:${idx}`).push(parsed.delta.text)
        } else if (
          parsed.delta.type === "input_json_delta" &&
          typeof parsed.delta.partial_json === "string"
        ) {
          parsed.delta.partial_json = getStream(`anth_json:${idx}`, true).push(
            parsed.delta.partial_json,
          )
        }
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }

      if (parsed.type === "content_block_stop") {
        const idx = typeof parsed.index === "number" ? parsed.index : 0
        const textTail = flushStream(`anth_text:${idx}`)
        if (textTail) {
          extraEvents.push(
            `event: content_block_delta\ndata: ${JSON.stringify({
              type: "content_block_delta",
              index: idx,
              delta: { type: "text_delta", text: textTail },
            })}`,
          )
        }
        const jsonTail = flushStream(`anth_json:${idx}`)
        if (jsonTail) {
          extraEvents.push(
            `event: content_block_delta\ndata: ${JSON.stringify({
              type: "content_block_delta",
              index: idx,
              delta: { type: "input_json_delta", partial_json: jsonTail },
            })}`,
          )
        }
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }

      // 2) OpenAI Chat Completions SSE events
      if (Array.isArray(parsed.choices)) {
        for (const choice of parsed.choices) {
          if (!isPlainObject(choice)) continue
          const cIdx = typeof choice.index === "number" ? choice.index : 0
          const delta = choice.delta
          if (isPlainObject(delta)) {
            if (typeof delta.content === "string") {
              delta.content = getStream(`openai_chat_text:${cIdx}`).push(delta.content)
            }
            if (Array.isArray(delta.tool_calls)) {
              for (const call of delta.tool_calls) {
                if (!isPlainObject(call)) continue
                const tIdx = typeof call.index === "number" ? call.index : 0
                if (isPlainObject(call.function) && typeof call.function.arguments === "string") {
                  call.function.arguments = getStream(
                    `openai_chat_tool:${cIdx}:${tIdx}`,
                    true,
                  ).push(call.function.arguments)
                }
              }
            }
          }
          if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
            const textTail = flushStream(`openai_chat_text:${cIdx}`)
            if (textTail) {
              if (!isPlainObject(choice.delta)) choice.delta = {}
              const d = choice.delta as Record<string, unknown>
              d.content = (typeof d.content === "string" ? d.content : "") + textTail
            }
          }
        }
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }

      // 3) OpenAI Responses API SSE events
      if (parsed.type === "response.output_text.delta" && typeof parsed.delta === "string") {
        const key = `resp_text:${String(parsed.output_index ?? 0)}:${String(parsed.content_index ?? 0)}`
        parsed.delta = getStream(key).push(parsed.delta)
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }
      if (parsed.type === "response.output_text.done") {
        const key = `resp_text:${String(parsed.output_index ?? 0)}:${String(parsed.content_index ?? 0)}`
        const tail = flushStream(key)
        if (tail) {
          extraEvents.push(
            `event: response.output_text.delta\ndata: ${JSON.stringify({
              type: "response.output_text.delta",
              output_index: parsed.output_index ?? 0,
              content_index: parsed.content_index ?? 0,
              delta: tail,
            })}`,
          )
        }
        if (typeof parsed.text === "string") {
          parsed.text = restorePlainText(parsed.text, map)
        }
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }
      if (
        parsed.type === "response.function_call_arguments.delta" &&
        typeof parsed.delta === "string"
      ) {
        const key = `resp_args:${String(parsed.output_index ?? 0)}`
        parsed.delta = getStream(key, true).push(parsed.delta)
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }
      if (parsed.type === "response.function_call_arguments.done") {
        const key = `resp_args:${String(parsed.output_index ?? 0)}`
        const tail = flushStream(key)
        if (tail) {
          extraEvents.push(
            `event: response.function_call_arguments.delta\ndata: ${JSON.stringify({
              type: "response.function_call_arguments.delta",
              output_index: parsed.output_index ?? 0,
              delta: tail,
            })}`,
          )
        }
        if (typeof parsed.arguments === "string") {
          parsed.arguments = restoreJsonEncodedText(parsed.arguments, map)
        }
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }
      if (parsed.type === "response.completed" && isPlainObject(parsed.response)) {
        parsed.response = restoreLlmResponseBody(parsed.response, map)
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }

      outLines.push(`data: ${JSON.stringify(parsed)}`)
    }

    const joined = outLines.join("\n")
    return extraEvents.length > 0 ? `${extraEvents.join("\n\n")}\n\n${joined}` : joined
  }

  return {
    push(chunk: string): string {
      sseBuffer += chunk.replace(/\r\n/g, "\n")
      let out = ""
      for (;;) {
        const sep = sseBuffer.indexOf("\n\n")
        if (sep < 0) break
        const block = sseBuffer.slice(0, sep)
        sseBuffer = sseBuffer.slice(sep + 2)
        out += `${processEventBlock(block)}\n\n`
      }
      return out
    },
    flush(): string {
      if (!sseBuffer) return ""
      const tail = processEventBlock(sseBuffer)
      sseBuffer = ""
      return tail
    },
  }
}

function resolveUpstreamTarget(
  urlPath: string,
  headers: IncomingMessage["headers"],
  options: {
    explicitUpstream?: string
    anthropicUpstream: string
    openaiUpstream: string
  },
): { baseUrl: string; forwardPath: string } {
  if (urlPath.startsWith("/anthropic/")) {
    return {
      baseUrl: options.anthropicUpstream.replace(/\/$/, ""),
      forwardPath: urlPath.slice("/anthropic".length),
    }
  }
  if (urlPath.startsWith("/openai/")) {
    return {
      baseUrl: options.openaiUpstream.replace(/\/$/, ""),
      forwardPath: urlPath.slice("/openai".length),
    }
  }
  if (options.explicitUpstream) {
    return {
      baseUrl: options.explicitUpstream.replace(/\/$/, ""),
      forwardPath: urlPath,
    }
  }
  const isAnthropic =
    urlPath.startsWith("/v1/messages") ||
    typeof headers["anthropic-version"] === "string" ||
    typeof headers["x-api-key"] === "string"
  return {
    baseUrl: (isAnthropic ? options.anthropicUpstream : options.openaiUpstream).replace(/\/$/, ""),
    forwardPath: urlPath,
  }
}

async function readRequestBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.byteLength
    if (total > MAX_BODY_BYTES) {
      throw new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes.`)
    }
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

function shouldRedactPath(pathname: string): boolean {
  const clean = pathname.split("?")[0] ?? pathname
  return (
    clean.endsWith("/messages") ||
    clean.endsWith("/chat/completions") ||
    clean.endsWith("/responses")
  )
}

/**
 * Starts a local, harness-agnostic LLM HTTP reverse proxy.
 *
 * Point `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, or any OpenAI/Anthropic SDK
 * at this proxy to automatically redact Swedish PII locally before prompts or
 * tool results leave the machine, and transparently restore placeholders in
 * both JSON and SSE streaming responses.
 */
export async function startMaskeraProxy(options: ProxyOptions = {}): Promise<RunningMaskeraProxy> {
  const host = options.host ?? "127.0.0.1"
  const requestedPort = options.port ?? 8787
  const engine = options.engine ?? createMaskeraEngine({ defaultMode: options.defaultMode })
  const vault = options.vault ?? new SessionVault()
  const restoreResponses = options.restoreResponses !== false
  const anthropicUpstream = options.anthropicUpstream ?? DEFAULT_ANTHROPIC_UPSTREAM
  const openaiUpstream = options.openaiUpstream ?? DEFAULT_OPENAI_UPSTREAM
  const log = options.onLog ?? (() => {})

  let totalRequests = 0
  let totalRedactions = 0

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startedAt = Date.now()
    const method = req.method ?? "GET"
    const urlPath = req.url ?? "/"

    if (method === "GET" && (urlPath === "/healthz" || urlPath === "/_maskera/status")) {
      const payload = {
        status: "ok",
        engine: engine.status(),
        requests_proxied: totalRequests,
        total_redactions: totalRedactions,
        sessions: vault.list(),
      }
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" })
      res.end(JSON.stringify(payload, null, 2))
      return
    }

    const { baseUrl, forwardPath } = resolveUpstreamTarget(urlPath, req.headers, {
      explicitUpstream: options.upstream,
      anthropicUpstream,
      openaiUpstream,
    })
    const upstreamUrl = `${baseUrl}${forwardPath}`

    const rawBody = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req)

    const sessionHeader = req.headers["x-maskera-session"]
    const sessionId =
      typeof sessionHeader === "string" && sessionHeader.trim() ? sessionHeader.trim() : "proxy"

    const stats: RedactStats = { redactions: 0, counts: {} }
    let outgoingBody: Buffer | undefined = rawBody
    const contentType = String(req.headers["content-type"] ?? "")

    if (
      rawBody &&
      rawBody.byteLength > 0 &&
      shouldRedactPath(forwardPath) &&
      contentType.includes("application/json")
    ) {
      let parsed: unknown
      try {
        parsed = JSON.parse(rawBody.toString("utf8"))
      } catch {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" })
        res.end(JSON.stringify({ error: { message: "Invalid JSON request body." } }))
        return
      }
      if (isPlainObject(parsed)) {
        const redactedObj = await redactLlmRequestBody(parsed, async (text) => {
          if (!text.trim()) return text
          const { result } = await engine.redact(text, {
            profile: options.profile,
            customTerms: options.customTerms,
          })
          const applied = vault.apply(text, result, sessionId)
          stats.redactions += applied.totalRedactions
          mergeCounts(stats.counts, applied.counts)
          return applied.redacted
        })
        outgoingBody = Buffer.from(JSON.stringify(redactedObj), "utf8")
      }
    }

    totalRequests += 1
    totalRedactions += stats.redactions

    const forwardHeaders = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue
      const lower = k.toLowerCase()
      if (HOP_BY_HOP_REQUEST_HEADERS.has(lower) || lower === "x-maskera-session") continue
      if (Array.isArray(v)) {
        for (const item of v) forwardHeaders.append(k, item)
      } else {
        forwardHeaders.set(k, v)
      }
    }
    forwardHeaders.set("accept-encoding", "identity")

    const upstreamRes = await fetch(upstreamUrl, {
      method,
      headers: forwardHeaders,
      body: outgoingBody ? new Uint8Array(outgoingBody) : undefined,
    })

    const outHeaders: Record<string, string> = {}
    upstreamRes.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
        outHeaders[key] = value
      }
    })
    outHeaders["x-maskera-redacted"] = String(stats.redactions)

    const sessionMap = restoreResponses ? vault.getMap(sessionId) : {}
    const hasMap = Object.keys(sessionMap).length > 0
    const resContentType = upstreamRes.headers.get("content-type") ?? ""

    if (hasMap && resContentType.includes("text/event-stream") && upstreamRes.body) {
      res.writeHead(upstreamRes.status, outHeaders)
      const sse = createSseRestorer(sessionMap)
      const decoder = new TextDecoder()
      const reader = upstreamRes.body.getReader()
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          const chunkText = decoder.decode(value, { stream: true })
          const transformed = sse.push(chunkText)
          if (transformed) res.write(transformed)
        }
        const finalText = decoder.decode()
        const tail = (finalText ? sse.push(finalText) : "") + sse.flush()
        if (tail) res.write(tail)
      } finally {
        reader.releaseLock()
        res.end()
      }
      log(
        `[maskera-proxy] ${method} ${forwardPath} ${upstreamRes.status} sse redacted=${stats.redactions} ${Date.now() - startedAt}ms`,
      )
      return
    }

    const resBuf = Buffer.from(await upstreamRes.arrayBuffer())
    if (hasMap && resContentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(resBuf.toString("utf8")) as unknown
        const restored = restoreLlmResponseBody(parsed, sessionMap)
        const restoredBuf = Buffer.from(JSON.stringify(restored), "utf8")
        res.writeHead(upstreamRes.status, outHeaders)
        res.end(restoredBuf)
        log(
          `[maskera-proxy] ${method} ${forwardPath} ${upstreamRes.status} json redacted=${stats.redactions} ${Date.now() - startedAt}ms`,
        )
        return
      } catch {
        // Fall through and send raw bytes if JSON failed to parse.
      }
    }

    res.writeHead(upstreamRes.status, outHeaders)
    res.end(resBuf)
    log(
      `[maskera-proxy] ${method} ${forwardPath} ${upstreamRes.status} redacted=${stats.redactions} ${Date.now() - startedAt}ms`,
    )
  }

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      log(`[maskera-proxy] error: ${message}`)
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "application/json; charset=utf-8" })
        res.end(JSON.stringify({ error: { message: `maskera-proxy error: ${message}` } }))
      } else {
        res.end()
      }
    })
  })

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen)
    server.listen(requestedPort, host, () => {
      server.off("error", rejectListen)
      resolveListen()
    })
  })

  const addr = server.address()
  const actualPort = typeof addr === "object" && addr ? addr.port : requestedPort

  return {
    host,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    server,
    vault,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()))
      }),
  }
}

export { escapeJsonStringValue }
