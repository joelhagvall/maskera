import { createHash, randomUUID } from "node:crypto"
import { appendFile, mkdir } from "node:fs/promises"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { dirname, posix } from "node:path"
import * as zlib from "node:zlib"
import type { RedactionProfile } from "maskera"
import { ApprovalBroker, type ApprovalMode } from "./approvals"
import { runDoctor } from "./doctor"
import { createMaskeraEngine, type MaskeraEngine, type MaskMode } from "./engine"
import { runGuard } from "./guard"
import { type InspectedRequest, ProxyInspector, renderInspectorHtml } from "./inspector"
import { createMaskeraMcpServer, type MaskeraMcpPolicy } from "./server"
import { SessionVault } from "./vault"

export interface ProxyOptions {
  /** Bind address. Defaults to loopback `127.0.0.1` for local safety. */
  host?: string
  /** Allow binding to a non-loopback interface (default `false`; refuses LAN exposure of local vault/MCP). */
  allowNonLoopback?: boolean
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
  /** Optional custom ApprovalBroker for browser MCP approvals. */
  approvals?: ApprovalBroker
  /** Allowed workspace roots for the co-hosted Streamable HTTP `/mcp` endpoint. */
  mcpRoots?: readonly string[]
  /** Allow `maskera_restore` / `include_map: true` over `/mcp`. Default `true`. */
  allowRawRestore?: boolean
  /** Disable file writes and session clears over `/mcp`. Default `false`. */
  readOnly?: boolean
  /** Default approval mode for `/mcp` raw PII exports. Default `"automatic"`. */
  approvalMode?: ApprovalMode
  /** Default mode if creating a new engine (`"auto"` or `"rules"`). */
  defaultMode?: MaskMode
  /** Optional built-in precision profile (`"general"` or `"clinical"`). */
  profile?: RedactionProfile
  /** Optional extra protected terms (client names, codenames, case IDs). */
  customTerms?: readonly string[]
  /** Restore placeholders in upstream responses. Default `true`. */
  restoreResponses?: boolean
  /** Reject uninspectable binary attachments (images, PDFs, audio) with HTTP 415. Default `false` (warns in audit log/inspector). */
  blockBinary?: boolean
  /** Optional local JSONL file for metadata-only audit logs (counts only, never raw PII). */
  auditLogPath?: string
  /** Optional safe metadata logger (never receives raw PII). */
  onLog?: (message: string) => void
}

export interface ProxyStats {
  requests: number
  redactions: number
  counts: Record<string, number>
  sessions: number
}

export interface RunningMaskeraProxy {
  readonly url: string
  readonly mcpUrl: string
  readonly inspectorUrl: string
  readonly host: string
  readonly port: number
  readonly server: Server
  readonly vault: SessionVault
  readonly inspector: ProxyInspector
  readonly approvals: ApprovalBroker
  stats(): ProxyStats
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
    if (!this.buffer && !chunk.includes("[")) return chunk
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
  if (!text?.includes("[") || Object.keys(map).length === 0) return text
  const r = new StreamingRestorer(map)
  return r.push(text) + r.flush()
}

function restoreJsonEncodedText(text: string, map: Readonly<Record<string, string>>): string {
  if (!text?.includes("[") || Object.keys(map).length === 0) return text
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

const MASKERA_VAULT_TOOL_RE = /(?:^|[^a-zA-Z0-9]|_)maskera_(?:write_file|restore|clear_session)$/
const MASKERA_VAULT_CODE_RE = /\bmaskera_(?:write_file|restore)\b/

function isMaskeraVaultToolName(name: unknown): boolean {
  return typeof name === "string" && MASKERA_VAULT_TOOL_RE.test(name)
}

function shouldSkipToolArgRestore(toolName: unknown, argsText: string): boolean {
  if (isMaskeraVaultToolName(toolName)) return true
  if (toolName === "execute" && MASKERA_VAULT_CODE_RE.test(argsText)) return true
  return false
}

export type RedactFieldKind = "message" | "system" | "tool_description" | "reasoning"

const SWEDISH_DIACRITIC_RE = /[åäöÅÄÖ]/
const SWEDISH_STOP_WORDS = new Set([
  "och",
  "att",
  "det",
  "som",
  "för",
  "med",
  "har",
  "inte",
  "på",
  "är",
  "av",
  "till",
  "ett",
  "från",
  "kan",
  "ska",
  "eller",
  "vid",
  "så",
  "men",
  "den",
  "jag",
  "din",
  "ditt",
  "mitt",
  "var",
  "blev",
  "enligt",
  "kund",
  "personnummer",
  "svenska",
  "sekretess",
  "arbetsgivare",
  "utbetalning",
  "sammanfatta",
  "skriv",
  "svara",
  "nedan",
  "uppgifter",
  "vänliga",
  "hälsningar",
  "ärendet",
  "ärende",
  "mejl",
  "brev",
  "patient",
  "namn",
  "telefon",
  "adress",
])
const CLI_SYSTEM_HEADER_RE =
  /^(?:x-anthropic-billing-header:|you are claude code\b|you are a claude agent\b|you are codex\b|you are opencode\b|sessionstart:|# gitstatus\b|current branch:|recent commits:|status:)/i
const ENGLISH_BOILERPLATE_WORDS = new Set([
  "the",
  "and",
  "to",
  "of",
  "in",
  "is",
  "it",
  "on",
  "as",
  "be",
  "by",
  "or",
  "an",
  "at",
  "if",
  "do",
  "no",
  "yes",
  "so",
  "but",
  "not",
  "you",
  "your",
  "with",
  "that",
  "this",
  "from",
  "are",
  "when",
  "use",
  "must",
  "should",
  "never",
  "always",
  "tools",
  "tool",
  "files",
  "file",
  "code",
  "return",
  "output",
  "response",
  "assistant",
  "instructions",
  "command",
  "commands",
  "user",
  "for",
  "into",
  "only",
  "before",
  "after",
  "run",
  "check",
  "edit",
  "read",
  "write",
  "git",
  "branch",
  "commit",
  "push",
  "test",
  "tests",
  "error",
  "path",
  "directory",
  "repository",
  "session",
  "agent",
  "prompt",
  "message",
  "system",
  "default",
  "without",
  "can",
  "will",
  "each",
  "all",
  "any",
  "every",
  "about",
  "more",
  "also",
  "make",
  "keep",
  "does",
  "have",
  "has",
  "been",
  "its",
  "their",
  "them",
  "then",
  "than",
  "using",
  "following",
  "other",
  "same",
  "first",
  "next",
  "existing",
  "changes",
  "where",
  "which",
  "what",
  "how",
  "why",
  "because",
  "unless",
  "instead",
  "below",
  "above",
  "work",
  "working",
  "task",
  "tasks",
  "skill",
  "skills",
  "rule",
  "rules",
  "repo",
  "project",
  "build",
  "lint",
  "hook",
  "hooks",
  "memory",
  "local",
  "remote",
  "status",
  "current",
  "recent",
])
const WORD_TOKEN_RE = /[a-zåäö]{2,}/gi
const SYSTEM_REMINDER_SPLIT_RE = /(<system-reminder>[\s\S]*?<\/system-reminder>)/g
const FENCED_CODE_SPLIT_RE = /(```[\s\S]*?```)/g
const GIT_STATUS_LINE_RE = /^(?:[MADRCU?!]{1,2}\s+\S|[0-9a-f]{7,40}\s+\S)/
const XML_TAG_ONLY_RE = /^<\/?[a-z][a-z0-9_-]*(?:\s[^>]*)?>$/i
const MARKDOWN_HEADING_RE = /^#{1,6}\s+\S/
const CODE_SIGNATURE_RE =
  /(?:\/\*\*|\?\s*:\s*(?:string|number|boolean|object|unknown|any|Record|Array)\b|\b(?:string|number|boolean)\s*\||\b(?:interface|namespace|type)\s+[A-Z]\w*|\bPromise<|=>\s*\{)/
const BROWSER_PROBE_PATHS = new Set([
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png",
  "/robots.txt",
])

/**
 * Recognizes Code Mode tool-catalog JSON returned by `search(...)` inside a
 * `role: "tool"` message (`{"items":[{"path":"tools.…","description":"…"}]}`).
 * Those payloads are tool definitions (identical to top-level `tools[]`), so
 * they use deterministic rules + `customTerms` instead of Swedish NER.
 */
const PLACEHOLDER_TOKEN_RE = /\[[A-ZÅÄÖ][A-ZÅÄÖ0-9_]*_\d+\]/g

function collectPlaceholdersFromUnknown(value: unknown, out: Set<string>): void {
  if (typeof value === "string") {
    if (!value.includes("[")) return
    const matches = value.match(PLACEHOLDER_TOKEN_RE)
    if (matches) {
      for (const tok of matches) out.add(tok)
    }
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPlaceholdersFromUnknown(item, out)
    return
  }
  if (isPlainObject(value)) {
    for (const v of Object.values(value)) collectPlaceholdersFromUnknown(v, out)
  }
}

/**
 * Collects Maskera placeholder tokens that already appear verbatim inside raw
 * tool results (`role: "tool"`, Anthropic `tool_result`, OpenAI Responses
 * `function_call_output`) BEFORE proxy redaction runs. Such placeholders come
 * from an external MCP vault (e.g. `maskera_read_file` over stdio) and must
 * not be overwritten by colliding system-prompt tokens from the proxy vault.
 */
function collectExternalToolResultPlaceholders(
  body: Record<string, unknown>,
  out: Set<string>,
): void {
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (!isPlainObject(msg)) continue
      if (msg.role === "tool") {
        collectPlaceholdersFromUnknown(msg.content, out)
        continue
      }
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (isPlainObject(block) && block.type === "tool_result") {
            collectPlaceholdersFromUnknown(block.content, out)
          }
        }
      }
    }
  }
  if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (isPlainObject(item) && item.type === "function_call_output") {
        collectPlaceholdersFromUnknown(item.output, out)
      }
    }
  }
}

function isToolCatalogJson(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.startsWith("{") || !trimmed.includes('"items"') || !trimmed.includes('"tools.')) {
    return false
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (!isPlainObject(parsed) || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      return false
    }
    return parsed.items.every(
      (item) =>
        isPlainObject(item) &&
        typeof item.path === "string" &&
        item.path.startsWith("tools.") &&
        (item.description === undefined || typeof item.description === "string"),
    )
  } catch {
    return false
  }
}

function isEnglishSystemParagraph(paragraph: string): boolean {
  const trimmed = paragraph.trim()
  if (!trimmed) return true
  if (XML_TAG_ONLY_RE.test(trimmed)) return true
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) return true
  if (CLI_SYSTEM_HEADER_RE.test(trimmed)) return true

  // Git status / commit log / file-path lists inside system context
  const nonEmptyLines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  if (
    nonEmptyLines.length > 0 &&
    nonEmptyLines.every(
      (l) =>
        GIT_STATUS_LINE_RE.test(l) ||
        XML_TAG_ONLY_RE.test(l) ||
        CLI_SYSTEM_HEADER_RE.test(l) ||
        l.startsWith("(use "),
    )
  ) {
    return true
  }

  let enTotal = 0
  const enDistinct = new Set<string>()
  let svTotal = 0
  let svDiacriticWords = 0
  const lower = trimmed.toLowerCase()
  WORD_TOKEN_RE.lastIndex = 0
  for (let m = WORD_TOKEN_RE.exec(lower); m !== null; m = WORD_TOKEN_RE.exec(lower)) {
    const word = m[0]
    if (!word) continue
    if (SWEDISH_STOP_WORDS.has(word)) {
      svTotal += 1
    }
    if (SWEDISH_DIACRITIC_RE.test(word)) {
      svDiacriticWords += 1
    }
    if (ENGLISH_BOILERPLATE_WORDS.has(word)) {
      enTotal += 1
      enDistinct.add(word)
    }
  }

  // Short markdown headings without Swedish signals (e.g. "## Git", "## Code", "# gitStatus")
  if (
    nonEmptyLines.length === 1 &&
    MARKDOWN_HEADING_RE.test(trimmed) &&
    svTotal === 0 &&
    svDiacriticWords === 0 &&
    trimmed.length < 120
  ) {
    return true
  }

  // Unfenced TypeScript / JSDoc tool declarations (e.g. OpenCode Code Mode schemas)
  if (svTotal === 0 && svDiacriticWords === 0 && CODE_SIGNATURE_RE.test(trimmed)) {
    return true
  }

  // Keep short prompts (like "Summarize patient Anna Lindqvist.") on full NER.
  if (trimmed.length < 60 && enDistinct.size < 4) return false

  const svSignal = svTotal + svDiacriticWords
  if (svSignal === 0) {
    const minDistinct = trimmed.length >= 240 ? 5 : 3
    return enDistinct.size >= minDistinct
  }

  // Long predominantly-English boilerplate paragraphs (e.g. AGENTS.md or MEMORY.md
  // referencing a single Swedish proper noun or example) still stay on rules +
  // customTerms when English function words vastly outnumber Swedish signals.
  return enTotal >= 12 && enDistinct.size >= 6 && enTotal >= svSignal * 6
}

/**
 * Returns `true` when a `system` prompt block is clearly English agent
 * boilerplate (e.g. Claude Code / Codex / OpenCode system instructions,
 * billing headers, or CLAUDE.md/MEMORY.md rules) rather than Swedish text.
 * Multi-paragraph blocks return `true` only when every paragraph is English
 * boilerplate, so mixed blocks split cleanly per paragraph.
 */
export function isLikelyEnglishSystemPrompt(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.includes("\n\n")) {
    const paragraphs = trimmed
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
    return paragraphs.length > 0 && paragraphs.every((p) => isEnglishSystemParagraph(p))
  }
  return isEnglishSystemParagraph(trimmed)
}

async function redactSystemText(
  text: string,
  redactChunk: (chunk: string, forceRules: boolean, previewable: boolean) => Promise<string>,
): Promise<string> {
  if (isLikelyEnglishSystemPrompt(text)) {
    return redactChunk(text, true, false)
  }
  const redactSegment = async (segment: string): Promise<string> => {
    if (!segment.trim()) return segment
    if (segment.startsWith("```") && segment.endsWith("```")) {
      return redactChunk(segment, true, false)
    }
    if (!segment.includes("\n\n")) {
      return redactChunk(segment, isEnglishSystemParagraph(segment), false)
    }
    const parts = segment.split(/(\n{2,})/)
    for (let i = 0; i < parts.length; i += 2) {
      const para = parts[i] ?? ""
      if (!para.trim()) continue
      parts[i] = await redactChunk(para, isEnglishSystemParagraph(para), false)
    }
    return parts.join("")
  }
  if (!text.includes("```")) {
    return redactSegment(text)
  }
  const codeParts = text.split(FENCED_CODE_SPLIT_RE)
  for (let i = 0; i < codeParts.length; i += 1) {
    const part = codeParts[i] ?? ""
    if (!part.trim()) continue
    codeParts[i] = await redactSegment(part)
  }
  return codeParts.join("")
}

async function redactMessageText(
  text: string,
  redactChunk: (chunk: string, forceRules: boolean, previewable: boolean) => Promise<string>,
): Promise<string> {
  if (!text.includes("<system-reminder>")) {
    return redactChunk(text, false, true)
  }
  const parts = text.split(SYSTEM_REMINDER_SPLIT_RE)
  for (let i = 0; i < parts.length; i += 1) {
    const segment = parts[i] ?? ""
    if (!segment.trim()) continue
    if (segment.startsWith("<system-reminder>") && segment.endsWith("</system-reminder>")) {
      parts[i] = await redactSystemText(segment, redactChunk)
    } else {
      parts[i] = await redactChunk(segment, false, true)
    }
  }
  return parts.join("")
}

async function extractSafeUpstreamError(
  resBuf: Buffer,
  status: number,
  engine: MaskeraEngine,
): Promise<string | undefined> {
  if (status < 400 || resBuf.byteLength === 0) return undefined
  let summary = ""
  try {
    const parsed = JSON.parse(resBuf.toString("utf8")) as unknown
    if (isPlainObject(parsed)) {
      const errObj = isPlainObject(parsed.error) ? parsed.error : parsed
      const parts: string[] = []
      if (typeof errObj.type === "string" && errObj.type.trim()) parts.push(errObj.type.trim())
      if (typeof errObj.code === "string" && errObj.code.trim()) parts.push(errObj.code.trim())
      if (typeof errObj.message === "string" && errObj.message.trim()) {
        parts.push(errObj.message.trim())
      }
      summary = parts.join(": ")
    }
  } catch {
    const raw = resBuf.toString("utf8").trim()
    if (raw && !raw.startsWith("<")) summary = raw
  }
  if (!summary) return undefined
  const trimmed = summary.length > 240 ? `${summary.slice(0, 240)}...` : summary
  try {
    const { result } = await engine.redact(trimmed, { mode: "rules" })
    return result.text
  } catch {
    return `HTTP ${status}`
  }
}

function headerFirst(headers: IncomingMessage["headers"], name: string): string {
  const value = headers[name]
  if (typeof value === "string") return value.trim()
  if (Array.isArray(value)) return (value[0] ?? "").trim()
  return ""
}

function shortSessionHash(seed: string): string {
  return `proxy-${createHash("sha256").update(seed).digest("hex").slice(0, 12)}`
}

/**
 * Derives an isolated proxy vault session key per client/conversation when the
 * caller omits `x-maskera-session`, preventing unrelated clients sharing a
 * local proxy from sharing placeholder mappings while preserving multi-turn
 * consistency within the same client thread.
 */
export function deriveProxySessionId(
  headers: IncomingMessage["headers"],
  body?: Record<string, unknown>,
): string {
  const explicit = headerFirst(headers, "x-maskera-session")
  if (explicit) return explicit

  const threadHeader =
    headerFirst(headers, "x-session-id") ||
    headerFirst(headers, "x-conversation-id") ||
    headerFirst(headers, "openai-conversation-id")
  if (threadHeader) return shortSessionHash(`hdr:${threadHeader}`)

  if (body) {
    if (typeof body.prompt_cache_key === "string" && body.prompt_cache_key.trim()) {
      return shortSessionHash(`cache:${body.prompt_cache_key.trim()}`)
    }
    if (typeof body.conversation === "string" && body.conversation.trim()) {
      return shortSessionHash(`conv:${body.conversation.trim()}`)
    }
    if (
      isPlainObject(body.conversation) &&
      typeof body.conversation.id === "string" &&
      body.conversation.id.trim()
    ) {
      return shortSessionHash(`conv:${body.conversation.id.trim()}`)
    }
    if (isPlainObject(body.metadata)) {
      const metaId =
        (typeof body.metadata.session_id === "string" && body.metadata.session_id.trim()) ||
        (typeof body.metadata.conversation_id === "string" &&
          body.metadata.conversation_id.trim()) ||
        (typeof body.metadata.user_id === "string" && body.metadata.user_id.trim())
      if (metaId) return shortSessionHash(`meta:${metaId}`)
    }
  }

  const auth = headerFirst(headers, "authorization") || headerFirst(headers, "x-api-key")
  if (auth) {
    const ua = headerFirst(headers, "user-agent")
    return shortSessionHash(`auth:${auth}\0${ua}`)
  }

  return "proxy"
}

const TEXT_BASE64_MEDIA_RE =
  /^(?:text\/|application\/(?:json|xml|csv|x-ndjson|javascript|yaml|x-yaml))/i
const DATA_URI_TEXT_BASE64_RE =
  /^data:((?:text\/[a-z0-9.+-]+|application\/(?:json|xml|csv|x-ndjson|javascript))[^;,]*);base64,([A-Za-z0-9+/=\s]+)$/i
const DATA_URI_ANY_RE = /^data:([^;,]+);base64,/i

async function redactBase64Utf8(
  encoded: string,
  redactString: (text: string, kind: RedactFieldKind) => Promise<string>,
  kind: RedactFieldKind,
): Promise<string> {
  try {
    const rawBuf = Buffer.from(encoded, "base64")
    if (rawBuf.includes(0) || rawBuf.byteLength > MAX_BODY_BYTES) return encoded
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(rawBuf)
    const redacted = await redactString(decoded, kind)
    if (redacted === decoded) return encoded
    return Buffer.from(redacted, "utf8").toString("base64")
  } catch {
    return encoded
  }
}

/**
 * Redacts all user/tool/system text fields in an Anthropic Messages, OpenAI
 * Chat Completions, or OpenAI Responses request body before it leaves the
 * local machine.
 */
export async function redactLlmRequestBody(
  body: Record<string, unknown>,
  redactString: (text: string, kind: RedactFieldKind) => Promise<string>,
  options: { mutate?: boolean; onBinaryAttachment?: (kind: string) => void } = {},
): Promise<Record<string, unknown>> {
  const clone = options.mutate ? body : structuredClone(body)
  const noteBinary = (kind: string) => {
    options.onBinaryAttachment?.(kind)
  }

  async function redactContentBlocks(blocks: unknown[], kind: RedactFieldKind): Promise<void> {
    for (const block of blocks) {
      if (!isPlainObject(block)) continue
      const blockType = typeof block.type === "string" ? block.type : ""
      if (blockType === "image" || blockType === "input_image") {
        const mediaType =
          isPlainObject(block.source) && typeof block.source.media_type === "string"
            ? block.source.media_type
            : blockType
        noteBinary(mediaType)
      } else if (blockType === "image_url" || isPlainObject(block.image_url)) {
        noteBinary("image_url")
      } else if (blockType === "input_audio" || isPlainObject(block.input_audio)) {
        noteBinary("input_audio")
      }
      if (typeof block.text === "string") {
        const blockKind: RedactFieldKind =
          kind === "message" && isToolCatalogJson(block.text) ? "tool_description" : kind
        block.text = await redactString(block.text, blockKind)
      }
      if (typeof block.refusal === "string") {
        block.refusal = await redactString(block.refusal, kind)
      }
      if (typeof block.thinking === "string") {
        const redactedThinking = await redactString(block.thinking, "reasoning")
        if (redactedThinking !== block.thinking) {
          block.thinking = redactedThinking
          // Mutating a signed thinking block invalidates its signature; drop
          // the stale signature if PII had to be stripped from it.
          delete block.signature
        }
      }
      if (typeof block.title === "string") {
        block.title = await redactString(block.title, kind)
      }
      if (typeof block.context === "string") {
        block.context = await redactString(block.context, kind)
      }
      if (typeof block.content === "string") {
        const blockKind: RedactFieldKind =
          blockType === "tool_result" && isToolCatalogJson(block.content)
            ? "tool_description"
            : kind
        block.content = await redactString(block.content, blockKind)
      } else if (Array.isArray(block.content)) {
        await redactContentBlocks(block.content, kind)
      }
      if (typeof block.output === "string") {
        const blockKind: RedactFieldKind =
          kind === "message" && isToolCatalogJson(block.output) ? "tool_description" : kind
        block.output = await redactString(block.output, blockKind)
      } else if (Array.isArray(block.output)) {
        await redactContentBlocks(block.output, kind)
      }
      if (typeof block.file_data === "string") {
        const match = DATA_URI_TEXT_BASE64_RE.exec(block.file_data)
        if (match?.[1] && match[2]) {
          const nextB64 = await redactBase64Utf8(match[2], redactString, kind)
          block.file_data = `data:${match[1]};base64,${nextB64}`
        } else if (block.file_data.startsWith("data:")) {
          const anyMime = DATA_URI_ANY_RE.exec(block.file_data)?.[1] ?? "application/octet-stream"
          noteBinary(anyMime)
        } else {
          const rawBuf = Buffer.from(block.file_data, "base64")
          if (rawBuf.includes(0)) {
            noteBinary("application/octet-stream")
          } else {
            block.file_data = await redactBase64Utf8(block.file_data, redactString, kind)
          }
        }
      }
      if (isPlainObject(block.source)) {
        if (block.source.type === "text" && typeof block.source.data === "string") {
          block.source.data = await redactString(block.source.data, kind)
        } else if (
          block.source.type === "base64" &&
          typeof block.source.data === "string" &&
          typeof block.source.media_type === "string" &&
          TEXT_BASE64_MEDIA_RE.test(block.source.media_type)
        ) {
          block.source.data = await redactBase64Utf8(block.source.data, redactString, kind)
        } else if (block.source.type === "base64") {
          const mediaType =
            typeof block.source.media_type === "string"
              ? block.source.media_type
              : "application/octet-stream"
          if (blockType !== "image" && blockType !== "input_image") {
            noteBinary(mediaType)
          }
        }
        if (typeof block.source.content === "string") {
          block.source.content = await redactString(block.source.content, kind)
        } else if (Array.isArray(block.source.content)) {
          await redactContentBlocks(block.source.content, kind)
        }
      }
      if (typeof block.arguments === "string") {
        block.arguments = await redactJsonStringOrText(block.arguments, kind)
      }
      if (typeof block.input === "string") {
        block.input = await redactJsonStringOrText(block.input, kind)
      } else if (isPlainObject(block.input)) {
        block.input = await redactObjectStrings(block.input, kind)
      }
    }
  }

  async function redactObjectStrings(value: unknown, kind: RedactFieldKind): Promise<unknown> {
    if (typeof value === "string") return redactString(value, kind)
    if (
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      Math.abs(value) >= 1_000_000_000
    ) {
      const asText = String(value)
      const redacted = await redactString(asText, kind)
      return redacted !== asText ? redacted : value
    }
    if (Array.isArray(value)) {
      const out = []
      for (const item of value) out.push(await redactObjectStrings(item, kind))
      return out
    }
    if (isPlainObject(value)) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) {
        out[k] = await redactObjectStrings(v, kind)
      }
      return out
    }
    return value
  }

  async function redactJsonStringOrText(raw: string, kind: RedactFieldKind): Promise<string> {
    try {
      const parsed = JSON.parse(raw) as unknown
      const redacted = await redactObjectStrings(parsed, kind)
      return JSON.stringify(redacted)
    } catch {
      return redactString(raw, kind)
    }
  }

  // Anthropic `system` / OpenAI Responses `instructions`
  if (typeof clone.system === "string") {
    clone.system = await redactString(clone.system, "system")
  } else if (Array.isArray(clone.system)) {
    await redactContentBlocks(clone.system, "system")
  }

  if (typeof clone.instructions === "string") {
    clone.instructions = await redactString(clone.instructions, "system")
  }

  // OpenAI legacy `/v1/completions` `prompt` (string or string[])
  if (typeof clone.prompt === "string") {
    clone.prompt = await redactString(clone.prompt, "message")
  } else if (Array.isArray(clone.prompt)) {
    for (let i = 0; i < clone.prompt.length; i++) {
      const entry = clone.prompt[i]
      if (typeof entry === "string") {
        clone.prompt[i] = await redactString(entry, "message")
      }
    }
  }

  // OpenAI `user` and Anthropic `metadata.user_id` (often carry emails/identifiers)
  if (typeof clone.user === "string") {
    clone.user = await redactString(clone.user, "tool_description")
  }
  if (isPlainObject(clone.metadata)) {
    clone.metadata = await redactObjectStrings(clone.metadata, "tool_description")
  }

  // Anthropic `/v1/messages/batches` `requests[].params`
  if (Array.isArray(clone.requests)) {
    for (const batchItem of clone.requests) {
      if (isPlainObject(batchItem) && isPlainObject(batchItem.params)) {
        batchItem.params = await redactLlmRequestBody(batchItem.params, redactString, {
          mutate: true,
        })
      }
    }
  }

  // Tool descriptions (Anthropic, OpenAI, and Codex MCP namespace tools) can
  // carry project/client names.
  async function redactToolEntries(entries: unknown[]): Promise<void> {
    for (const tool of entries) {
      if (!isPlainObject(tool)) continue
      if (typeof tool.description === "string") {
        tool.description = await redactString(tool.description, "tool_description")
      }
      if (isPlainObject(tool.function) && typeof tool.function.description === "string") {
        tool.function.description = await redactString(
          tool.function.description,
          "tool_description",
        )
      }
      if (Array.isArray(tool.tools)) {
        await redactToolEntries(tool.tools)
      }
    }
  }
  if (Array.isArray(clone.tools)) {
    await redactToolEntries(clone.tools)
  }

  // Anthropic Messages & OpenAI Chat Completions `messages`
  if (Array.isArray(clone.messages)) {
    for (const msg of clone.messages) {
      if (!isPlainObject(msg)) continue
      const msgKind: RedactFieldKind =
        msg.role === "system" || msg.role === "developer" ? "system" : "message"
      if (typeof msg.name === "string") {
        msg.name = await redactString(msg.name, "tool_description")
      }
      if (typeof msg.content === "string") {
        const contentKind: RedactFieldKind =
          msg.role === "tool" && isToolCatalogJson(msg.content) ? "tool_description" : msgKind
        msg.content = await redactString(msg.content, contentKind)
      } else if (Array.isArray(msg.content)) {
        await redactContentBlocks(msg.content, msgKind)
      }
      if (typeof msg.reasoning_content === "string") {
        msg.reasoning_content = await redactString(msg.reasoning_content, "reasoning")
      }
      if (typeof msg.reasoning === "string") {
        msg.reasoning = await redactString(msg.reasoning, "reasoning")
      }
      if (typeof msg.refusal === "string") {
        msg.refusal = await redactString(msg.refusal, msgKind)
      }
      if (isPlainObject(msg.function_call) && typeof msg.function_call.arguments === "string") {
        msg.function_call.arguments = await redactJsonStringOrText(
          msg.function_call.arguments,
          msgKind,
        )
      }
      if (Array.isArray(msg.tool_calls)) {
        for (const call of msg.tool_calls) {
          if (isPlainObject(call) && isPlainObject(call.function)) {
            if (typeof call.function.arguments === "string") {
              call.function.arguments = await redactJsonStringOrText(
                call.function.arguments,
                msgKind,
              )
            }
          }
        }
      }
    }
  }

  // OpenAI Responses API `input` & `/v1/embeddings` `input`
  if (typeof clone.input === "string") {
    clone.input = await redactString(clone.input, "message")
  } else if (Array.isArray(clone.input)) {
    for (let i = 0; i < clone.input.length; i++) {
      const item = clone.input[i]
      if (typeof item === "string") {
        clone.input[i] = await redactString(item, "message")
      } else if (isPlainObject(item)) {
        const itemKind: RedactFieldKind =
          item.role === "system" || item.role === "developer" ? "system" : "message"
        if (typeof item.text === "string") item.text = await redactString(item.text, itemKind)
        if (typeof item.content === "string") {
          item.content = await redactString(item.content, itemKind)
        } else if (Array.isArray(item.content)) {
          await redactContentBlocks(item.content, itemKind)
        }
        if (typeof item.output === "string") {
          const outKind: RedactFieldKind =
            item.type === "function_call_output" && isToolCatalogJson(item.output)
              ? "tool_description"
              : itemKind
          item.output = await redactString(item.output, outKind)
        } else if (Array.isArray(item.output)) {
          await redactContentBlocks(item.output, itemKind)
        }
        if (typeof item.input === "string") {
          item.input = await redactJsonStringOrText(item.input, itemKind)
        } else if (isPlainObject(item.input)) {
          item.input = await redactObjectStrings(item.input, itemKind)
        }
        if (typeof item.reasoning_content === "string") {
          item.reasoning_content = await redactString(item.reasoning_content, "reasoning")
        }
        if (typeof item.reasoning === "string") {
          item.reasoning = await redactString(item.reasoning, "reasoning")
        }
        if (typeof item.refusal === "string") {
          item.refusal = await redactString(item.refusal, itemKind)
        }
        if (Array.isArray(item.summary)) {
          await redactContentBlocks(item.summary, itemKind)
        }
        if (typeof item.arguments === "string") {
          item.arguments = await redactJsonStringOrText(item.arguments, itemKind)
        }
      }
    }
  }

  return clone
}

function filterMapExcluding(
  map: Readonly<Record<string, string>>,
  excluded?: ReadonlySet<string>,
): Readonly<Record<string, string>> {
  if (!excluded || excluded.size === 0) return map
  const out: Record<string, string> = {}
  for (const [token, value] of Object.entries(map)) {
    if (!excluded.has(token)) out[token] = value
  }
  return out
}

/**
 * Restores Maskera placeholders in a non-streaming Anthropic or OpenAI JSON
 * response without touching IDs, model names, or usage metadata.
 */
export function restoreLlmResponseBody(
  body: unknown,
  map: Readonly<Record<string, string>>,
  options: { mutate?: boolean; reasoningExcludedTokens?: ReadonlySet<string> } = {},
): unknown {
  if (!isPlainObject(body) || Object.keys(map).length === 0) return body
  const clone = options.mutate ? body : structuredClone(body)
  const reasoningMap = filterMapExcluding(map, options.reasoningExcludedTokens)

  // Anthropic Messages: `content: [{ type: "text", text }, { type: "tool_use", input }]`
  if (Array.isArray(clone.content)) {
    for (const block of clone.content) {
      if (!isPlainObject(block)) continue
      if (typeof block.text === "string") {
        block.text = restorePlainText(block.text, map)
      }
      if (typeof block.thinking === "string" && typeof block.signature !== "string") {
        block.thinking = restorePlainText(block.thinking, reasoningMap)
      }
      if (isPlainObject(block.input)) {
        const skipRestore =
          isMaskeraVaultToolName(block.name) ||
          (block.name === "execute" &&
            typeof block.input.code === "string" &&
            MASKERA_VAULT_CODE_RE.test(block.input.code))
        if (!skipRestore) {
          block.input = restoreJsonLeaves(block.input, map)
        }
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
        if (typeof msg.reasoning_content === "string") {
          msg.reasoning_content = restorePlainText(msg.reasoning_content, reasoningMap)
        }
        if (typeof msg.reasoning === "string") {
          msg.reasoning = restorePlainText(msg.reasoning, reasoningMap)
        }
        if (Array.isArray(msg.tool_calls)) {
          for (const call of msg.tool_calls) {
            if (isPlainObject(call) && isPlainObject(call.function)) {
              if (
                typeof call.function.arguments === "string" &&
                !shouldSkipToolArgRestore(call.function.name, call.function.arguments)
              ) {
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
      if (
        typeof item.arguments === "string" &&
        !shouldSkipToolArgRestore(item.name, item.arguments)
      ) {
        item.arguments = restoreJsonEncodedText(item.arguments, map)
      }
      if (typeof item.input === "string" && !shouldSkipToolArgRestore(item.name, item.input)) {
        item.input = restorePlainText(item.input, map)
      } else if (isPlainObject(item.input) && !isMaskeraVaultToolName(item.name)) {
        item.input = restoreJsonLeaves(item.input, map)
      }
      if (Array.isArray(item.content)) {
        for (const part of item.content) {
          if (isPlainObject(part) && typeof part.text === "string") {
            part.text = restorePlainText(part.text, map)
          }
        }
      }
      if (Array.isArray(item.summary)) {
        for (const part of item.summary) {
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
export function createSseRestorer(
  map: Readonly<Record<string, string>>,
  options: { reasoningExcludedTokens?: ReadonlySet<string> } = {},
) {
  const reasoningMap = filterMapExcluding(map, options.reasoningExcludedTokens)
  const streams = new Map<string, StreamingRestorer>()
  // Track active tool names so proxy placeholders never overwrite MCP vault
  // placeholders inside `maskera_write_file`, `maskera_restore`, or OpenCode's
  // Code Mode `execute` calls targeting Maskera MCP tools.
  const toolNames = new Map<string, string>()
  const bufferedToolArgs = new Map<string, string>()

  const getStream = (
    key: string,
    escapeForJsonString = false,
    useReasoningMap = false,
  ): StreamingRestorer => {
    let r = streams.get(key)
    if (!r) {
      r = new StreamingRestorer(useReasoningMap ? reasoningMap : map, { escapeForJsonString })
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

  function flushBufferedToolArgs(key: string): string {
    const raw = bufferedToolArgs.get(key)
    if (raw === undefined) return ""
    bufferedToolArgs.delete(key)
    const name = toolNames.get(key)
    if (shouldSkipToolArgRestore(name, raw)) return raw
    return restoreJsonEncodedText(raw, map)
  }

  function drainRemainingStreams(): string[] {
    const events: string[] = []
    for (const key of [...bufferedToolArgs.keys()]) {
      const full = flushBufferedToolArgs(key)
      if (!full) continue
      if (key.startsWith("openai_chat_tool:")) {
        const [, cIdx, tIdx] = key.split(":")
        events.push(
          `data: ${JSON.stringify({
            choices: [
              {
                index: Number(cIdx ?? 0),
                delta: {
                  tool_calls: [{ index: Number(tIdx ?? 0), function: { arguments: full } }],
                },
              },
            ],
          })}`,
        )
      } else if (key.startsWith("anth_json:")) {
        const idx = Number(key.split(":")[1] ?? 0)
        events.push(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: "content_block_delta",
            index: idx,
            delta: { type: "input_json_delta", partial_json: full },
          })}`,
        )
      } else if (key.startsWith("resp_args:")) {
        const outputIdx = Number(key.split(":")[1] ?? 0)
        events.push(
          `event: response.function_call_arguments.delta\ndata: ${JSON.stringify({
            type: "response.function_call_arguments.delta",
            output_index: outputIdx,
            delta: full,
          })}`,
        )
      }
    }
    for (const key of [...streams.keys()]) {
      const tail = flushStream(key)
      if (!tail) continue
      if (key.startsWith("openai_chat_text:")) {
        const idx = Number(key.split(":")[1] ?? 0)
        events.push(
          `data: ${JSON.stringify({ choices: [{ index: idx, delta: { content: tail } }] })}`,
        )
      } else if (key.startsWith("openai_chat_tool:")) {
        const [, cIdx, tIdx] = key.split(":")
        events.push(
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
      } else if (key.startsWith("anth_text:")) {
        const idx = Number(key.split(":")[1] ?? 0)
        events.push(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: "content_block_delta",
            index: idx,
            delta: { type: "text_delta", text: tail },
          })}`,
        )
      } else if (key.startsWith("anth_thinking:")) {
        const idx = Number(key.split(":")[1] ?? 0)
        events.push(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: "content_block_delta",
            index: idx,
            delta: { type: "thinking_delta", thinking: tail },
          })}`,
        )
      } else if (key.startsWith("anth_json:")) {
        const idx = Number(key.split(":")[1] ?? 0)
        events.push(
          `event: content_block_delta\ndata: ${JSON.stringify({
            type: "content_block_delta",
            index: idx,
            delta: { type: "input_json_delta", partial_json: tail },
          })}`,
        )
      } else if (key.startsWith("resp_text:")) {
        const [, outputIdx, contentIdx] = key.split(":")
        events.push(
          `event: response.output_text.delta\ndata: ${JSON.stringify({
            type: "response.output_text.delta",
            output_index: Number(outputIdx ?? 0),
            content_index: Number(contentIdx ?? 0),
            delta: tail,
          })}`,
        )
      } else if (key.startsWith("openai_chat_reasoning:")) {
        const idx = Number(key.split(":")[1] ?? 0)
        events.push(
          `data: ${JSON.stringify({ choices: [{ index: idx, delta: { reasoning_content: tail } }] })}`,
        )
      } else if (key.startsWith("openai_chat_reasoning_plain:")) {
        const idx = Number(key.split(":")[1] ?? 0)
        events.push(
          `data: ${JSON.stringify({ choices: [{ index: idx, delta: { reasoning: tail } }] })}`,
        )
      } else if (key.startsWith("resp_reasoning:")) {
        const [, outputIdx, summaryIdx] = key.split(":")
        events.push(
          `event: response.reasoning_summary_text.delta\ndata: ${JSON.stringify({
            type: "response.reasoning_summary_text.delta",
            output_index: Number(outputIdx ?? 0),
            summary_index: Number(summaryIdx ?? 0),
            delta: tail,
          })}`,
        )
      } else if (key.startsWith("resp_args:")) {
        const outputIdx = Number(key.split(":")[1] ?? 0)
        events.push(
          `event: response.function_call_arguments.delta\ndata: ${JSON.stringify({
            type: "response.function_call_arguments.delta",
            output_index: outputIdx,
            delta: tail,
          })}`,
        )
      }
    }
    return events
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
        extraEvents.push(...drainRemainingStreams())
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
      if (parsed.type === "content_block_start" && isPlainObject(parsed.content_block)) {
        const idx = typeof parsed.index === "number" ? parsed.index : 0
        if (
          parsed.content_block.type === "tool_use" &&
          typeof parsed.content_block.name === "string"
        ) {
          toolNames.set(`anth_json:${idx}`, parsed.content_block.name)
        }
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }

      if (parsed.type === "content_block_delta" && isPlainObject(parsed.delta)) {
        const idx = typeof parsed.index === "number" ? parsed.index : 0
        if (parsed.delta.type === "text_delta" && typeof parsed.delta.text === "string") {
          parsed.delta.text = getStream(`anth_text:${idx}`).push(parsed.delta.text)
        } else if (
          parsed.delta.type === "thinking_delta" &&
          typeof parsed.delta.thinking === "string"
        ) {
          parsed.delta.thinking = getStream(`anth_thinking:${idx}`, false, true).push(
            parsed.delta.thinking,
          )
        } else if (
          parsed.delta.type === "input_json_delta" &&
          typeof parsed.delta.partial_json === "string"
        ) {
          const key = `anth_json:${idx}`
          const name = toolNames.get(key)
          if (isMaskeraVaultToolName(name)) {
            // Preserve MCP vault placeholders untouched for Maskera's own tools.
          } else if (name === "execute") {
            bufferedToolArgs.set(key, (bufferedToolArgs.get(key) ?? "") + parsed.delta.partial_json)
            parsed.delta.partial_json = ""
          } else {
            parsed.delta.partial_json = getStream(key, true).push(parsed.delta.partial_json)
          }
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
        const thinkingTail = flushStream(`anth_thinking:${idx}`)
        if (thinkingTail) {
          extraEvents.push(
            `event: content_block_delta\ndata: ${JSON.stringify({
              type: "content_block_delta",
              index: idx,
              delta: { type: "thinking_delta", thinking: thinkingTail },
            })}`,
          )
        }
        const jsonKey = `anth_json:${idx}`
        const jsonTail = flushBufferedToolArgs(jsonKey) || flushStream(jsonKey)
        toolNames.delete(jsonKey)
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
            if (typeof delta.reasoning_content === "string") {
              delta.reasoning_content = getStream(
                `openai_chat_reasoning:${cIdx}`,
                false,
                true,
              ).push(delta.reasoning_content)
            }
            if (typeof delta.reasoning === "string") {
              delta.reasoning = getStream(`openai_chat_reasoning_plain:${cIdx}`, false, true).push(
                delta.reasoning,
              )
            }
            if (Array.isArray(delta.tool_calls)) {
              for (const call of delta.tool_calls) {
                if (!isPlainObject(call)) continue
                const tIdx = typeof call.index === "number" ? call.index : 0
                const key = `openai_chat_tool:${cIdx}:${tIdx}`
                if (isPlainObject(call.function)) {
                  if (typeof call.function.name === "string" && call.function.name) {
                    toolNames.set(key, call.function.name)
                  }
                  if (typeof call.function.arguments === "string") {
                    const name = toolNames.get(key)
                    if (isMaskeraVaultToolName(name)) {
                      // Preserve MCP vault placeholders untouched.
                    } else if (name === "execute") {
                      bufferedToolArgs.set(
                        key,
                        (bufferedToolArgs.get(key) ?? "") + call.function.arguments,
                      )
                      call.function.arguments = ""
                    } else {
                      call.function.arguments = getStream(key, true).push(call.function.arguments)
                    }
                  }
                }
              }
            }
          }
          if (typeof choice.finish_reason === "string" && choice.finish_reason.length > 0) {
            const textTail = flushStream(`openai_chat_text:${cIdx}`)
            if (textTail) {
              if (!isPlainObject(choice.delta)) choice.delta = {}
              const d = choice.delta as Record<string, unknown>
              d.content = (typeof d.content === "string" ? d.content : "") + textTail
            }
            const reasoningTail = flushStream(`openai_chat_reasoning:${cIdx}`)
            if (reasoningTail) {
              if (!isPlainObject(choice.delta)) choice.delta = {}
              const d = choice.delta as Record<string, unknown>
              d.reasoning_content =
                (typeof d.reasoning_content === "string" ? d.reasoning_content : "") + reasoningTail
            }
            const reasoningPlainTail = flushStream(`openai_chat_reasoning_plain:${cIdx}`)
            if (reasoningPlainTail) {
              if (!isPlainObject(choice.delta)) choice.delta = {}
              const d = choice.delta as Record<string, unknown>
              d.reasoning =
                (typeof d.reasoning === "string" ? d.reasoning : "") + reasoningPlainTail
            }
            const toolPrefix = `openai_chat_tool:${cIdx}:`
            for (const key of [...bufferedToolArgs.keys()]) {
              if (!key.startsWith(toolPrefix)) continue
              const tIdx = Number(key.slice(toolPrefix.length) || 0)
              const fullArgs = flushBufferedToolArgs(key)
              toolNames.delete(key)
              if (!fullArgs) continue
              extraEvents.push(
                `data: ${JSON.stringify({
                  choices: [
                    {
                      index: cIdx,
                      delta: {
                        tool_calls: [{ index: tIdx, function: { arguments: fullArgs } }],
                      },
                    },
                  ],
                })}`,
              )
            }
            for (const key of [...streams.keys()]) {
              if (!key.startsWith(toolPrefix)) continue
              const tIdx = Number(key.slice(toolPrefix.length) || 0)
              const toolTail = flushStream(key)
              toolNames.delete(key)
              if (!toolTail) continue
              extraEvents.push(
                `data: ${JSON.stringify({
                  choices: [
                    {
                      index: cIdx,
                      delta: {
                        tool_calls: [{ index: tIdx, function: { arguments: toolTail } }],
                      },
                    },
                  ],
                })}`,
              )
            }
          }
        }
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }

      // 3) OpenAI Responses API SSE events
      if (parsed.type === "response.output_item.added" && isPlainObject(parsed.item)) {
        if (parsed.item.type === "function_call" && typeof parsed.item.name === "string") {
          toolNames.set(`resp_args:${String(parsed.output_index ?? 0)}`, parsed.item.name)
        }
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }
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
        parsed.type === "response.reasoning_summary_text.delta" &&
        typeof parsed.delta === "string"
      ) {
        const key = `resp_reasoning:${String(parsed.output_index ?? 0)}:${String(parsed.summary_index ?? 0)}`
        parsed.delta = getStream(key).push(parsed.delta)
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }
      if (parsed.type === "response.reasoning_summary_text.done") {
        const key = `resp_reasoning:${String(parsed.output_index ?? 0)}:${String(parsed.summary_index ?? 0)}`
        const tail = flushStream(key)
        if (tail) {
          extraEvents.push(
            `event: response.reasoning_summary_text.delta\ndata: ${JSON.stringify({
              type: "response.reasoning_summary_text.delta",
              output_index: parsed.output_index ?? 0,
              summary_index: parsed.summary_index ?? 0,
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
        const name = toolNames.get(key)
        if (isMaskeraVaultToolName(name)) {
          // Preserve MCP vault placeholders untouched for Maskera's own tools.
        } else if (name === "execute") {
          bufferedToolArgs.set(key, (bufferedToolArgs.get(key) ?? "") + parsed.delta)
          parsed.delta = ""
        } else {
          parsed.delta = getStream(key, true).push(parsed.delta)
        }
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }
      if (parsed.type === "response.function_call_arguments.done") {
        const key = `resp_args:${String(parsed.output_index ?? 0)}`
        const name = toolNames.get(key)
        const tail = flushBufferedToolArgs(key) || flushStream(key)
        if (tail) {
          extraEvents.push(
            `event: response.function_call_arguments.delta\ndata: ${JSON.stringify({
              type: "response.function_call_arguments.delta",
              output_index: parsed.output_index ?? 0,
              delta: tail,
            })}`,
          )
        }
        if (
          typeof parsed.arguments === "string" &&
          !shouldSkipToolArgRestore(name, parsed.arguments)
        ) {
          parsed.arguments = restoreJsonEncodedText(parsed.arguments, map)
        }
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }
      if (parsed.type === "error") {
        // Flush any buffered deltas BEFORE the terminal error event so nothing
        // is appended after `event: error`.
        extraEvents.push(...drainRemainingStreams())
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }
      if (parsed.type === "response.content_part.done" && isPlainObject(parsed.part)) {
        if (typeof parsed.part.text === "string") {
          parsed.part.text = restorePlainText(parsed.part.text, map)
        }
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }
      if (parsed.type === "response.output_item.done" && isPlainObject(parsed.item)) {
        const item = parsed.item
        const key = `resp_args:${String(parsed.output_index ?? 0)}`
        const name = typeof item.name === "string" ? item.name : toolNames.get(key)
        toolNames.delete(key)
        if (typeof item.arguments === "string" && !shouldSkipToolArgRestore(name, item.arguments)) {
          item.arguments = restoreJsonEncodedText(item.arguments, map)
        }
        if (Array.isArray(item.content)) {
          for (const part of item.content) {
            if (isPlainObject(part) && typeof part.text === "string") {
              part.text = restorePlainText(part.text, map)
            }
          }
        }
        if (Array.isArray(item.summary)) {
          for (const part of item.summary) {
            if (isPlainObject(part) && typeof part.text === "string") {
              part.text = restorePlainText(part.text, map)
            }
          }
        }
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }
      if (
        (parsed.type === "response.completed" || parsed.type === "response.incomplete") &&
        isPlainObject(parsed.response)
      ) {
        parsed.response = restoreLlmResponseBody(parsed.response, map)
        outLines.push(`data: ${JSON.stringify(parsed)}`)
        continue
      }

      outLines.push(`data: ${JSON.stringify(parsed)}`)
    }

    const joined = outLines.join("\n")
    return extraEvents.length > 0 ? `${extraEvents.join("\n\n")}\n\n${joined}` : joined
  }

  let pendingCr = false

  return {
    push(chunk: string): string {
      let text = pendingCr ? `\r${chunk}` : chunk
      pendingCr = text.endsWith("\r")
      if (pendingCr) text = text.slice(0, -1)
      sseBuffer += text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
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
      if (pendingCr) {
        sseBuffer += "\n"
        pendingCr = false
      }
      const parts: string[] = []
      if (sseBuffer) {
        parts.push(processEventBlock(sseBuffer))
        sseBuffer = ""
      }
      const drained = drainRemainingStreams()
      if (drained.length > 0) {
        parts.push(`${drained.join("\n\n")}\n\n`)
      }
      return parts.join("")
    },
  }
}

class PayloadTooLargeError extends Error {
  readonly statusCode = 413
}

const INSPECTOR_SECURITY_HEADERS: Record<string, string> = {
  "x-frame-options": "DENY",
  "content-security-policy":
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "cache-control": "no-store",
}

const LOOPBACK_HOST_RE = /^(127\.0\.0\.1|localhost|\[::1\])(?::(\d{1,5}))?$/i
const LOOPBACK_BIND_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"])

function isLoopbackBindHost(host: string): boolean {
  return LOOPBACK_BIND_HOSTS.has(host.trim().toLowerCase())
}

function isLoopbackRemoteAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false
  const normalized = remoteAddress.trim().toLowerCase()
  return normalized === "127.0.0.1" || normalized === "::1" || normalized === "::ffff:127.0.0.1"
}

class InvalidRequestPathError extends Error {
  readonly statusCode = 400
}

function canonicalizeRequestPath(urlPath: string): string {
  const rawPathname = urlPath.split("?")[0] ?? urlPath
  if (rawPathname.includes("\0")) {
    throw new InvalidRequestPathError("Request path contains NUL byte.")
  }
  let decoded: string
  try {
    decoded = decodeURIComponent(rawPathname)
  } catch {
    throw new InvalidRequestPathError("Malformed percent-encoding in request path.")
  }
  if (decoded.includes("\0")) {
    throw new InvalidRequestPathError("Decoded request path contains NUL byte.")
  }
  const normalized = posix.normalize(decoded.replace(/\\+/g, "/"))
  return normalized.length > 1 ? normalized.replace(/\/+$/, "") : normalized
}

function isLoopbackHost(
  hostHeader: string | undefined,
  boundHost: string,
  boundPort: number,
  requirePresent = false,
): boolean {
  if (!hostHeader) return !requirePresent
  const raw = hostHeader.trim().toLowerCase()
  const match = LOOPBACK_HOST_RE.exec(raw)
  if (match) {
    const portStr = match[2]
    if (portStr !== undefined) {
      const p = Number(portStr)
      if (!Number.isInteger(p) || p < 1 || p > 65535) return false
      if (boundPort > 0 && p !== boundPort) return false
    }
    return true
  }
  const boundLower = boundHost.toLowerCase()
  if (raw === boundLower || (boundPort > 0 && raw === `${boundLower}:${boundPort}`)) {
    return true
  }
  return false
}

function isSameOriginLoopbackRequest(
  req: IncomingMessage,
  boundHost: string,
  boundPort: number,
): boolean {
  if (!isLoopbackHost(req.headers.host, boundHost, boundPort, true)) {
    return false
  }
  const secFetchSite = String(req.headers["sec-fetch-site"] ?? "").toLowerCase()
  if (secFetchSite && secFetchSite !== "same-origin" && secFetchSite !== "none") {
    return false
  }
  const origin = req.headers.origin
  if (typeof origin === "string" && origin.trim()) {
    try {
      const parsed = new URL(origin)
      if (!isLoopbackHost(parsed.host, boundHost, boundPort, true)) return false
      if (boundPort > 0 && parsed.port !== String(boundPort)) return false
      if (req.headers.host && parsed.host.toLowerCase() !== req.headers.host.trim().toLowerCase()) {
        return false
      }
    } catch {
      return false
    }
  }
  return true
}

function normalizeInspectorPath(rawPathname: string): string {
  let decoded = rawPathname
  try {
    decoded = decodeURIComponent(rawPathname)
  } catch {
    // Keep raw if malformed percent-encoding.
  }
  return decoded.replace(/\/{2,}/g, "/").toLowerCase()
}

class UnsupportedContentEncodingError extends Error {
  readonly statusCode = 415
}

const zstdDecompressSync = (
  zlib as unknown as {
    zstdDecompressSync?: (buf: Buffer, opts?: { maxOutputLength?: number }) => Buffer
  }
).zstdDecompressSync

function decodeRequestBody(rawBody: Buffer, encodingHeader: string | undefined): Buffer {
  const enc = (encodingHeader ?? "").trim().toLowerCase()
  if (!enc || enc === "identity") return rawBody
  if (enc === "gzip") {
    return zlib.gunzipSync(rawBody, { maxOutputLength: MAX_BODY_BYTES })
  }
  if (enc === "deflate") {
    return zlib.inflateSync(rawBody, { maxOutputLength: MAX_BODY_BYTES })
  }
  if (enc === "br") {
    return zlib.brotliDecompressSync(rawBody, { maxOutputLength: MAX_BODY_BYTES })
  }
  if (enc === "zstd" && typeof zstdDecompressSync === "function") {
    return zstdDecompressSync(rawBody, { maxOutputLength: MAX_BODY_BYTES })
  }
  throw new UnsupportedContentEncodingError(`Unsupported content-encoding: "${enc}".`)
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
    urlPath.startsWith("/api/") ||
    typeof headers["anthropic-version"] === "string" ||
    typeof headers["anthropic-beta"] === "string" ||
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
      req.resume()
      throw new PayloadTooLargeError(`Request body exceeds ${MAX_BODY_BYTES} bytes.`)
    }
    chunks.push(buf)
  }
  return Buffer.concat(chunks)
}

function shouldRedactPath(pathname: string): boolean {
  const clean = canonicalizeRequestPath(pathname).toLowerCase()
  return (
    clean.endsWith("/messages") ||
    clean.endsWith("/messages/count_tokens") ||
    clean.endsWith("/messages/batches") ||
    clean.endsWith("/chat/completions") ||
    clean.endsWith("/completions") ||
    clean.endsWith("/responses") ||
    clean.endsWith("/responses/input_tokens") ||
    clean.endsWith("/responses/compact") ||
    clean.endsWith("/embeddings") ||
    clean.endsWith("/moderations")
  )
}

const APPROVAL_STRICTNESS: Record<ApprovalMode, number> = {
  automatic: 0,
  native: 1,
  browser: 2,
}

function parseScopedMcpPolicy(
  urlPath: string,
  base: Required<Omit<MaskeraMcpPolicy, "sessionOwner">>,
): Required<Omit<MaskeraMcpPolicy, "sessionOwner">> {
  const qIndex = urlPath.indexOf("?")
  if (qIndex < 0) return base
  const params = new URLSearchParams(urlPath.slice(qIndex + 1))

  const flagTrue = (name: string) => {
    const v = params.get(name)?.trim().toLowerCase()
    return v === "1" || v === "true" || v === "yes"
  }
  const flagFalse = (name: string) => {
    const v = params.get(name)?.trim().toLowerCase()
    return v === "0" || v === "false" || v === "no"
  }

  // Scoped URL parameters may only tighten policy, never weaken server defaults.
  const allowRawRestore =
    base.allowRawRestore && !flagTrue("no_raw_restore") && !flagFalse("allow_raw_restore")
  const readOnly = base.readOnly || flagTrue("read_only")

  let approvalMode = base.approvalMode
  const requestedMode = (params.get("approval_mode") ?? params.get("elicitation_mode") ?? "")
    .trim()
    .toLowerCase()
  if (requestedMode === "automatic" || requestedMode === "native" || requestedMode === "browser") {
    if (APPROVAL_STRICTNESS[requestedMode] >= APPROVAL_STRICTNESS[base.approvalMode]) {
      approvalMode = requestedMode
    }
  }

  return { allowRawRestore, readOnly, approvalMode }
}

/**
 * Starts a local, harness-agnostic LLM HTTP reverse proxy.
 *
 * Point `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`, or any OpenAI/Anthropic SDK
 * at this proxy to automatically redact Swedish PII locally before prompts or
 * tool results leave the machine, and transparently restore placeholders in
 * both JSON and SSE streaming responses. Also serves Streamable HTTP MCP on
 * `/mcp` sharing the same warm ONNX model, session vault, and live inspector.
 */
export async function startMaskeraProxy(options: ProxyOptions = {}): Promise<RunningMaskeraProxy> {
  const host = options.host ?? "127.0.0.1"
  if (!options.allowNonLoopback && !isLoopbackBindHost(host)) {
    throw new Error(
      `Refusing to bind maskera-proxy to non-loopback host "${host}". Use 127.0.0.1, localhost, or ::1 (or set allowNonLoopback: true only behind external network isolation).`,
    )
  }
  const requestedPort = options.port ?? 8787
  const engine = options.engine ?? createMaskeraEngine({ defaultMode: options.defaultMode })
  const vault = options.vault ?? new SessionVault()
  const approvals = options.approvals ?? new ApprovalBroker()
  const inspector = new ProxyInspector()
  const unsubscribeApprovals = approvals.onChange((snapshot) => {
    inspector.publishApprovals(snapshot)
  })
  const restoreResponses = options.restoreResponses !== false
  const anthropicUpstream = options.anthropicUpstream ?? DEFAULT_ANTHROPIC_UPSTREAM
  const openaiUpstream = options.openaiUpstream ?? DEFAULT_OPENAI_UPSTREAM
  const auditLogPath = options.auditLogPath
  const log = options.onLog ?? (() => {})
  const baseMcpPolicy: Required<Omit<MaskeraMcpPolicy, "sessionOwner">> = {
    allowRawRestore: options.allowRawRestore ?? true,
    readOnly: options.readOnly ?? false,
    approvalMode: options.approvalMode ?? "automatic",
  }
  const mcpSessions = new Map<string, Required<Omit<MaskeraMcpPolicy, "sessionOwner">>>()
  const closedMcpSessions = new Set<string>()
  const messageTokensBySession = new Map<string, Set<string>>()
  const externalToolTokensBySession = new Map<string, Set<string>>()

  if (auditLogPath) {
    await mkdir(dirname(auditLogPath), { recursive: true })
    await appendFile(auditLogPath, "", { encoding: "utf8", mode: 0o600 })
  }

  let totalRequests = 0
  let totalRedactions = 0
  let totalCounts: Record<string, number> = {}
  let boundPort = requestedPort
  let boundUrl = `http://${host}:${requestedPort}`
  let auditChain = Promise.resolve()
  let mcpServerInstance: ReturnType<typeof createMaskeraMcpServer> | null = null

  function getMcpServer() {
    if (!mcpServerInstance) {
      mcpServerInstance = createMaskeraMcpServer({
        engine,
        vault,
        allowedRoots: options.mcpRoots,
        defaultProfile: options.profile,
        defaultCustomTerms: options.customTerms,
        allowRawRestore: baseMcpPolicy.allowRawRestore,
        readOnly: baseMcpPolicy.readOnly,
        approvalMode: baseMcpPolicy.approvalMode,
        approvals,
        approvalBaseUrl: boundUrl,
        onToolCall: (event) => {
          if (event.sessionId === "doctor-http-probe") {
            vault.clear("doctor-http-probe")
            return
          }
          recordAuditAndInspector({
            timestamp: new Date().toISOString(),
            method: "MCP",
            path: `/mcp/${event.tool}`,
            upstream: "local-mcp",
            sessionId: event.sessionId ?? "mcp",
            status: event.isError ? 400 : 200,
            streamed: false,
            durationMs: event.durationMs,
            redactions: event.redactions,
            counts: event.counts,
            redactedPreview: [],
          })
        },
      })
    }
    return mcpServerInstance
  }

  function recordAuditAndInspector(entry: Omit<InspectedRequest, "id">): void {
    totalRequests += 1
    totalRedactions += entry.redactions
    mergeCounts(totalCounts, entry.counts)
    inspector.record(entry)
    if (auditLogPath) {
      // Strictly metadata and entity counts on disk (never raw text or previews).
      const auditLine = JSON.stringify({
        timestamp: entry.timestamp,
        method: entry.method,
        path: entry.path,
        upstream: entry.upstream,
        status: entry.status,
        streamed: entry.streamed,
        durationMs: entry.durationMs,
        redactions: entry.redactions,
        counts: entry.counts,
      })
      auditChain = auditChain.then(() =>
        appendFile(auditLogPath, `${auditLine}\n`, { encoding: "utf8", mode: 0o600 }).catch(
          (err) => {
            log(
              `[maskera-proxy] audit log write error: ${err instanceof Error ? err.message : String(err)}`,
            )
          },
        ),
      )
    }
  }

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startedAt = Date.now()
    const method = req.method ?? "GET"
    const urlPath = req.url ?? "/"
    const pathname = urlPath.split("?")[0] ?? urlPath
    const normalizedPath = normalizeInspectorPath(pathname)

    const isInspectorRoute =
      normalizedPath === "/_maskera" ||
      normalizedPath.startsWith("/_maskera/") ||
      normalizedPath.includes("/_maskera/") ||
      normalizedPath.endsWith("/_maskera")
    if (isInspectorRoute || pathname === "/healthz") {
      if (
        !isLoopbackRemoteAddress(req.socket.remoteAddress) ||
        !isLoopbackHost(req.headers.host, host, boundPort)
      ) {
        res.writeHead(403, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(JSON.stringify({ error: "Forbidden host header for local inspector route." }))
        return
      }
    }

    if (method === "GET" && (pathname === "/_maskera" || pathname === "/_maskera/")) {
      res.writeHead(200, {
        ...INSPECTOR_SECURITY_HEADERS,
        "content-type": "text/html; charset=utf-8",
      })
      res.end(
        renderInspectorHtml({
          url: boundUrl,
          mcpUrl: `${boundUrl}/mcp`,
          defaultMode: engine.status().defaultMode,
          restoreResponses,
        }),
      )
      return
    }

    if (method === "GET" && pathname === "/_maskera/events") {
      inspector.subscribe(res, INSPECTOR_SECURITY_HEADERS)
      return
    }

    if (method === "GET" && pathname === "/_maskera/approvals") {
      res.writeHead(200, {
        ...INSPECTOR_SECURITY_HEADERS,
        "content-type": "application/json; charset=utf-8",
      })
      res.end(JSON.stringify({ approvals: approvals.list() }))
      return
    }

    const approvalMatch = /^\/_maskera\/approvals\/([^/]+)\/(approve|decline)$/.exec(pathname)
    if (method === "POST" && approvalMatch) {
      if (
        req.headers["x-maskera-action"] !== "decide" ||
        !isSameOriginLoopbackRequest(req, host, boundPort)
      ) {
        res.writeHead(403, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(
          JSON.stringify({ error: "Pass x-maskera-action: decide from same-origin loopback." }),
        )
        return
      }
      const approvalId = decodeURIComponent(approvalMatch[1] ?? "")
      const decision = approvalMatch[2] === "approve" ? "approve" : "decline"
      const updated = approvals.decide(approvalId, decision)
      if (!updated) {
        res.writeHead(404, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(JSON.stringify({ error: "Unknown approval id." }))
        return
      }
      res.writeHead(200, {
        ...INSPECTOR_SECURITY_HEADERS,
        "content-type": "application/json; charset=utf-8",
      })
      res.end(JSON.stringify({ approval: updated }))
      return
    }

    if (method === "GET" && pathname === "/_maskera/vault") {
      if (
        req.headers["x-maskera-reveal"] !== "1" ||
        !isSameOriginLoopbackRequest(req, host, boundPort)
      ) {
        res.writeHead(403, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(JSON.stringify({ error: "Pass x-maskera-reveal: 1 to read local vault values." }))
        return
      }
      res.writeHead(200, {
        ...INSPECTOR_SECURITY_HEADERS,
        "content-type": "application/json; charset=utf-8",
      })
      res.end(JSON.stringify({ entries: vault.entries() }))
      return
    }

    if (method === "POST" && pathname === "/_maskera/clear") {
      if (
        req.headers["x-maskera-action"] !== "clear" ||
        !isSameOriginLoopbackRequest(req, host, boundPort)
      ) {
        res.writeHead(403, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(
          JSON.stringify({ error: "Pass x-maskera-action: clear from same-origin loopback." }),
        )
        return
      }
      vault.clearAll()
      approvals.clearAll()
      engine.clearCache()
      inspector.clear()
      messageTokensBySession.clear()
      externalToolTokensBySession.clear()
      totalRequests = 0
      totalRedactions = 0
      totalCounts = {}
      res.writeHead(200, {
        ...INSPECTOR_SECURITY_HEADERS,
        "content-type": "application/json; charset=utf-8",
      })
      res.end(JSON.stringify({ cleared: true }))
      return
    }

    if (method === "POST" && pathname === "/_maskera/self-test") {
      if (
        req.headers["x-maskera-action"] !== "self-test" ||
        !isSameOriginLoopbackRequest(req, host, boundPort)
      ) {
        res.writeHead(403, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(
          JSON.stringify({ error: "Pass x-maskera-action: self-test from same-origin loopback." }),
        )
        return
      }
      const report = await runDoctor({
        engine,
        roots: options.mcpRoots ?? [process.cwd()],
        mode: engine.status().defaultMode,
        profile: options.profile,
        customTerms: options.customTerms,
        proxyUrl: boundUrl,
        mcpUrl: `${boundUrl}/mcp`,
      })
      res.writeHead(report.ok ? 200 : 500, {
        ...INSPECTOR_SECURITY_HEADERS,
        "content-type": "application/json; charset=utf-8",
      })
      res.end(JSON.stringify(report, null, 2))
      return
    }

    if (method === "POST" && pathname === "/_maskera/guard") {
      if (
        req.headers["x-maskera-action"] !== "guard" ||
        !isSameOriginLoopbackRequest(req, host, boundPort)
      ) {
        res.writeHead(403, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(
          JSON.stringify({ error: "Pass x-maskera-action: guard from same-origin loopback." }),
        )
        return
      }
      const guardBodyBuf = await readRequestBody(req)
      let parsedGuard: unknown
      try {
        parsedGuard = JSON.parse(guardBodyBuf.toString("utf8"))
      } catch {
        res.writeHead(400, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(JSON.stringify({ error: "Invalid JSON body for /_maskera/guard." }))
        return
      }
      if (!isPlainObject(parsedGuard) || typeof parsedGuard.raw !== "string") {
        res.writeHead(400, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(JSON.stringify({ error: 'Expected JSON object with string field "raw".' }))
        return
      }
      const guardMode: MaskMode | undefined =
        parsedGuard.mode === "rules" || parsedGuard.mode === "auto" ? parsedGuard.mode : undefined
      const guardProfile: RedactionProfile | undefined =
        parsedGuard.profile === "clinical" || parsedGuard.profile === "general"
          ? parsedGuard.profile
          : options.profile
      const guardTerms = Array.isArray(parsedGuard.customTerms)
        ? parsedGuard.customTerms.filter((t): t is string => typeof t === "string")
        : options.customTerms
      const guardRes = await runGuard(parsedGuard.raw, engine, {
        mode: guardMode,
        profile: guardProfile,
        customTerms: guardTerms,
        preserveJsonStructure: parsedGuard.preserveJsonStructure === true,
      })
      const includeRedacted =
        parsedGuard.includeRedacted === true || parsedGuard.preserveJsonStructure === true
      res.writeHead(200, {
        ...INSPECTOR_SECURITY_HEADERS,
        "content-type": "application/json; charset=utf-8",
      })
      res.end(
        JSON.stringify({
          blocked: guardRes.blocked,
          totalRedactions: guardRes.totalRedactions,
          counts: guardRes.counts,
          modeUsed: guardRes.modeUsed,
          ...(includeRedacted ? { redacted: guardRes.redacted } : {}),
        }),
      )
      return
    }

    if (method === "GET" && (pathname === "/healthz" || pathname === "/_maskera/status")) {
      const payload = {
        status: "ok",
        inspector_url: `${boundUrl}/_maskera`,
        mcp_url: `${boundUrl}/mcp`,
        engine: engine.status(),
        requests_proxied: totalRequests,
        total_redactions: totalRedactions,
        pending_approvals: approvals.list().filter((a) => a.status === "pending").length,
        sessions: vault.list(),
      }
      res.writeHead(200, {
        ...INSPECTOR_SECURITY_HEADERS,
        "content-type": "application/json; charset=utf-8",
      })
      res.end(JSON.stringify(payload, null, 2))
      return
    }

    if (isInspectorRoute) {
      res.writeHead(404, {
        ...INSPECTOR_SECURITY_HEADERS,
        "content-type": "application/json; charset=utf-8",
      })
      res.end(JSON.stringify({ error: "Unknown inspector route." }))
      return
    }

    if ((method === "GET" || method === "HEAD") && BROWSER_PROBE_PATHS.has(normalizedPath)) {
      res.writeHead(204, INSPECTOR_SECURITY_HEADERS)
      res.end()
      return
    }

    // Streamable HTTP MCP endpoint sharing the warm ONNX engine and live
    // inspector while strictly isolating each MCP session's vault & approvals.
    if (normalizedPath === "/mcp" || normalizedPath === "/mcp/") {
      if (
        !isLoopbackRemoteAddress(req.socket.remoteAddress) ||
        !isLoopbackHost(req.headers.host, host, boundPort, true)
      ) {
        res.writeHead(403, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(JSON.stringify({ error: "Forbidden host header for local MCP endpoint." }))
        return
      }
      if (req.headers.origin && !isSameOriginLoopbackRequest(req, host, boundPort)) {
        res.writeHead(403, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(
          JSON.stringify({ error: "Cross-origin requests to local MCP endpoint are forbidden." }),
        )
        return
      }

      const incomingSessionId =
        typeof req.headers["mcp-session-id"] === "string"
          ? req.headers["mcp-session-id"].trim()
          : ""

      if (method === "DELETE") {
        if (incomingSessionId) {
          mcpSessions.delete(incomingSessionId)
          closedMcpSessions.add(incomingSessionId)
          vault.clearOwner(`mcp:${incomingSessionId}`)
          approvals.clearOwner(`mcp:${incomingSessionId}`)
          if (closedMcpSessions.size > 500) {
            const first = closedMcpSessions.values().next().value
            if (first !== undefined) closedMcpSessions.delete(first)
          }
        }
        res.writeHead(204, INSPECTOR_SECURITY_HEADERS)
        res.end()
        return
      }

      if (method === "GET") {
        res.writeHead(405, {
          ...INSPECTOR_SECURITY_HEADERS,
          allow: "POST, DELETE",
          "content-type": "application/json; charset=utf-8",
        })
        res.end(
          JSON.stringify({
            error: "Streamable HTTP MCP expects JSON-RPC POST requests on /mcp.",
          }),
        )
        return
      }

      if (method !== "POST") {
        res.writeHead(405, {
          ...INSPECTOR_SECURITY_HEADERS,
          allow: "POST, DELETE",
          "content-type": "application/json; charset=utf-8",
        })
        res.end(JSON.stringify({ error: `Unsupported HTTP method ${method} for /mcp.` }))
        return
      }

      if (incomingSessionId && closedMcpSessions.has(incomingSessionId)) {
        res.writeHead(404, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(JSON.stringify({ error: "MCP session has been closed." }))
        return
      }

      const mcpBody = await readRequestBody(req)
      let parsedMcp: unknown
      try {
        parsedMcp = JSON.parse(mcpBody.toString("utf8"))
      } catch {
        res.writeHead(400, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          }),
        )
        return
      }

      const messages = Array.isArray(parsedMcp) ? parsedMcp : [parsedMcp]
      const isInit = messages.some((m) => isPlainObject(m) && m.method === "initialize")
      if (!isInit && incomingSessionId && !mcpSessions.has(incomingSessionId)) {
        res.writeHead(404, {
          ...INSPECTOR_SECURITY_HEADERS,
          "content-type": "application/json; charset=utf-8",
        })
        res.end(JSON.stringify({ error: "Unknown MCP session." }))
        return
      }

      const sessionBasePolicy =
        (incomingSessionId ? mcpSessions.get(incomingSessionId) : undefined) ?? baseMcpPolicy
      const effectivePolicy = parseScopedMcpPolicy(urlPath, sessionBasePolicy)
      const mcpServer = getMcpServer()

      let responseSessionId = incomingSessionId
      if (isInit) {
        responseSessionId = `mcp_${randomUUID().slice(0, 16)}`
        if (mcpSessions.size >= 200) {
          const oldest = mcpSessions.keys().next().value
          if (oldest !== undefined) {
            mcpSessions.delete(oldest)
            vault.clearOwner(`mcp:${oldest}`)
            approvals.clearOwner(`mcp:${oldest}`)
          }
        }
        mcpSessions.set(responseSessionId, effectivePolicy)
      }

      const sessionOwner = responseSessionId ? `mcp:${responseSessionId}` : "mcp:stateless"
      const scopedPolicy: MaskeraMcpPolicy = { ...effectivePolicy, sessionOwner }

      const responses = []
      for (const msg of messages) {
        const reply = await mcpServer.handleMessage(msg, scopedPolicy)
        if (reply !== null) responses.push(reply)
      }

      const mcpHeaders: Record<string, string> = {
        ...INSPECTOR_SECURITY_HEADERS,
      }
      if (responseSessionId) mcpHeaders["mcp-session-id"] = responseSessionId

      if (responses.length === 0) {
        res.writeHead(202, mcpHeaders)
        res.end()
        return
      }

      mcpHeaders["content-type"] = "application/json; charset=utf-8"
      res.writeHead(200, mcpHeaders)
      res.end(JSON.stringify(Array.isArray(parsedMcp) ? responses : responses[0]))
      return
    }

    if (String(req.headers.upgrade ?? "").toLowerCase() === "websocket") {
      res.writeHead(426, {
        "content-type": "application/json; charset=utf-8",
        connection: "close",
      })
      res.end(
        JSON.stringify({
          error: {
            message: "WebSocket transport is not supported by maskera-proxy; retry over HTTP SSE.",
          },
        }),
      )
      return
    }

    const { baseUrl, forwardPath } = resolveUpstreamTarget(urlPath, req.headers, {
      explicitUpstream: options.upstream,
      anthropicUpstream,
      openaiUpstream,
    })
    if (!forwardPath.startsWith("/") || forwardPath.startsWith("//")) {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8" })
      res.end(JSON.stringify({ error: { message: "Invalid request path." } }))
      return
    }
    let needsRedaction: boolean
    try {
      needsRedaction = shouldRedactPath(forwardPath)
    } catch (err) {
      if (err instanceof InvalidRequestPathError) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" })
        res.end(JSON.stringify({ error: { message: err.message } }))
        return
      }
      throw err
    }
    const upstreamUrl = `${baseUrl}${forwardPath}`
    try {
      if (new URL(upstreamUrl).origin !== new URL(baseUrl).origin) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" })
        res.end(JSON.stringify({ error: { message: "Upstream origin mismatch." } }))
        return
      }
    } catch {
      res.writeHead(400, { "content-type": "application/json; charset=utf-8" })
      res.end(JSON.stringify({ error: { message: "Invalid upstream URL." } }))
      return
    }

    const rawBody = method === "GET" || method === "HEAD" ? undefined : await readRequestBody(req)

    let sessionId = deriveProxySessionId(req.headers)
    const proxyVaultOwner = "proxy"
    const blockBinary = options.blockBinary === true

    const stats: RedactStats = { redactions: 0, counts: {} }
    const redactedPreview: string[] = []
    const binaryAttachments = new Set<string>()
    let requestWarnings: string[] | undefined
    let outgoingBody: Buffer | undefined = rawBody
    let rewroteRequestBody = false
    const contentType = String(req.headers["content-type"] ?? "")
      .trim()
      .toLowerCase()
    const contentEncoding =
      typeof req.headers["content-encoding"] === "string"
        ? req.headers["content-encoding"]
        : undefined
    const mayBeJson =
      contentType === "" || contentType.includes("json") || contentType.startsWith("text/plain")

    if (rawBody && rawBody.byteLength > 0 && needsRedaction) {
      if (!mayBeJson) {
        res.writeHead(415, { "content-type": "application/json; charset=utf-8" })
        res.end(
          JSON.stringify({
            error: {
              message: `Refusing to forward unredacted content-type "${contentType}" on LLM redaction endpoint (fail-closed).`,
            },
          }),
        )
        return
      }
      let decodedBody: Buffer
      try {
        decodedBody = decodeRequestBody(rawBody, contentEncoding)
      } catch (err) {
        if (err instanceof UnsupportedContentEncodingError) {
          res.writeHead(415, { "content-type": "application/json; charset=utf-8" })
          res.end(JSON.stringify({ error: { message: err.message } }))
          return
        }
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" })
        res.end(JSON.stringify({ error: { message: "Invalid compressed request body." } }))
        return
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(decodedBody.toString("utf8"))
      } catch {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" })
        res.end(JSON.stringify({ error: { message: "Invalid JSON request body." } }))
        return
      }
      if (!isPlainObject(parsed)) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" })
        res.end(JSON.stringify({ error: { message: "Expected JSON object request body." } }))
        return
      }
      sessionId = deriveProxySessionId(req.headers, parsed)
      let externalTokensForSession = externalToolTokensBySession.get(sessionId)
      const incomingToolTokens = new Set<string>()
      collectExternalToolResultPlaceholders(parsed, incomingToolTokens)
      if (incomingToolTokens.size > 0) {
        if (!externalTokensForSession) {
          externalTokensForSession = new Set<string>()
          externalToolTokensBySession.set(sessionId, externalTokensForSession)
        }
        for (const tok of incomingToolTokens) externalTokensForSession.add(tok)
      }
      let messageTokensForSession = messageTokensBySession.get(sessionId)
      let redactedObj: Record<string, unknown>
      try {
        const messagePreviews: string[] = []
        const fallbackPreviews: string[] = []
        const redactChunk = async (
          chunk: string,
          forceRules: boolean,
          previewable: boolean,
        ): Promise<string> => {
          if (!chunk.trim()) return chunk
          const { result } = await engine.redact(chunk, {
            mode: forceRules ? "rules" : undefined,
            profile: options.profile,
            customTerms: options.customTerms,
          })
          const applied = vault.apply(chunk, result, sessionId, proxyVaultOwner)
          stats.redactions += applied.totalRedactions
          mergeCounts(stats.counts, applied.counts)
          if (previewable && applied.totalRedactions > 0) {
            if (!messageTokensForSession) {
              messageTokensForSession = new Set<string>()
              messageTokensBySession.set(sessionId, messageTokensForSession)
            }
            for (const tok of Object.keys(applied.map)) {
              messageTokensForSession.add(tok)
            }
          }
          const snippet =
            applied.redacted.length > 1200
              ? `${applied.redacted.slice(0, 1200)}...`
              : applied.redacted
          if (previewable) {
            if (messagePreviews.length < 6) messagePreviews.push(snippet)
          } else if (applied.totalRedactions > 0 && fallbackPreviews.length < 4) {
            fallbackPreviews.push(snippet)
          }
          return applied.redacted
        }
        redactedObj = await redactLlmRequestBody(
          parsed,
          async (text, kind) => {
            if (!text.trim()) return text
            if (kind === "tool_description") {
              return redactChunk(text, true, false)
            }
            // Long coding-agent system prompts often mix English boilerplate
            // sections with user-supplied Swedish sections (e.g. AGENTS.md).
            // Evaluate per paragraph/line so English boilerplate runs fast rules +
            // customTerms without Swedish NER false positives while Swedish
            // paragraphs keep full hybrid NER protection.
            if (kind === "system" || kind === "reasoning") {
              return redactSystemText(text, redactChunk)
            }
            return redactMessageText(text, redactChunk)
          },
          {
            mutate: true,
            onBinaryAttachment: (kind) => {
              binaryAttachments.add(kind)
            },
          },
        )
        redactedPreview.push(...(messagePreviews.length > 0 ? messagePreviews : fallbackPreviews))
      } catch (err) {
        recordAuditAndInspector({
          timestamp: new Date().toISOString(),
          method,
          path: forwardPath,
          upstream: baseUrl,
          sessionId,
          status: 502,
          streamed: false,
          durationMs: Date.now() - startedAt,
          redactions: stats.redactions,
          counts: stats.counts,
          redactedPreview,
        })
        throw err
      }
      if (binaryAttachments.size > 0) {
        const kinds = [...binaryAttachments]
        const warning = `Uninspectable binary attachment(s) without OCR: ${kinds.join(", ")}`
        requestWarnings = [warning]
        log(`[maskera-proxy] warning: ${warning}`)
        if (blockBinary) {
          recordAuditAndInspector({
            timestamp: new Date().toISOString(),
            method,
            path: forwardPath,
            upstream: baseUrl,
            sessionId,
            status: 415,
            streamed: false,
            durationMs: Date.now() - startedAt,
            redactions: stats.redactions,
            counts: stats.counts,
            redactedPreview,
            warnings: requestWarnings,
          })
          res.writeHead(415, {
            "content-type": "application/json; charset=utf-8",
            "x-maskera-warning": "uninspectable-binary-attachment",
          })
          res.end(
            JSON.stringify({
              error: {
                message: `Refusing to forward uninspectable binary attachment(s) (${kinds.join(", ")}) when --block-binary is enabled.`,
              },
            }),
          )
          return
        }
      }
      outgoingBody = Buffer.from(JSON.stringify(redactedObj), "utf8")
      rewroteRequestBody = true
    }

    const forwardHeaders = new Headers()
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue
      const lower = k.toLowerCase()
      if (
        HOP_BY_HOP_REQUEST_HEADERS.has(lower) ||
        lower === "x-maskera-session" ||
        (rewroteRequestBody && lower === "content-encoding")
      ) {
        continue
      }
      if (Array.isArray(v)) {
        for (const item of v) forwardHeaders.append(k, item)
      } else {
        forwardHeaders.set(k, v)
      }
    }
    forwardHeaders.set("accept-encoding", "identity")

    const abortController = new AbortController()
    const onClientClose = () => {
      if (!res.writableEnded) abortController.abort()
    }
    res.on("close", onClientClose)

    let upstreamRes: Response
    try {
      upstreamRes = await fetch(upstreamUrl, {
        method,
        headers: forwardHeaders,
        body: outgoingBody ? new Uint8Array(outgoingBody) : undefined,
        redirect: "manual",
        signal: abortController.signal,
      })
    } catch (err) {
      res.off("close", onClientClose)
      if (!abortController.signal.aborted) {
        const durationMs = Date.now() - startedAt
        recordAuditAndInspector({
          timestamp: new Date().toISOString(),
          method,
          path: forwardPath,
          upstream: baseUrl,
          sessionId,
          status: 502,
          streamed: false,
          durationMs,
          redactions: stats.redactions,
          counts: stats.counts,
          redactedPreview,
        })
      }
      throw err
    }

    const outHeaders: Record<string, string> = {}
    upstreamRes.headers.forEach((value, key) => {
      if (!HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) {
        outHeaders[key] = value
      }
    })
    outHeaders["x-maskera-redacted"] = String(stats.redactions)
    if (requestWarnings) {
      outHeaders["x-maskera-warning"] = "uninspectable-binary-attachment"
    }

    const rawSessionMap = restoreResponses ? vault.getMap(sessionId, proxyVaultOwner) : {}
    const externalTokens = externalToolTokensBySession.get(sessionId)
    const messageTokens = messageTokensBySession.get(sessionId)
    let sessionMap: Record<string, string> = rawSessionMap
    if (externalTokens && externalTokens.size > 0) {
      sessionMap = {}
      for (const [token, value] of Object.entries(rawSessionMap)) {
        if (externalTokens.has(token) && !messageTokens?.has(token)) continue
        sessionMap[token] = value
      }
    }
    const hasMap = Object.keys(sessionMap).length > 0
    const resContentType = (upstreamRes.headers.get("content-type") ?? "").toLowerCase()
    const isSse = resContentType.includes("text/event-stream")

    if (isSse && upstreamRes.body) {
      res.writeHead(upstreamRes.status, outHeaders)
      const sse = hasMap
        ? createSseRestorer(sessionMap, { reasoningExcludedTokens: externalTokens })
        : null
      const decoder = sse ? new TextDecoder() : null
      const reader = upstreamRes.body.getReader()
      const onStreamAbort = () => {
        void reader.cancel().catch(() => {})
      }
      abortController.signal.addEventListener("abort", onStreamAbort, { once: true })
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (sse && decoder) {
            const chunkText = decoder.decode(value, { stream: true })
            const transformed = sse.push(chunkText)
            if (transformed) res.write(transformed)
          } else if (value) {
            res.write(value)
          }
        }
        if (sse && decoder) {
          const finalText = decoder.decode()
          const tail = (finalText ? sse.push(finalText) : "") + sse.flush()
          if (tail) res.write(tail)
        }
      } catch (err) {
        if (!abortController.signal.aborted) throw err
      } finally {
        abortController.signal.removeEventListener("abort", onStreamAbort)
        res.off("close", onClientClose)
        reader.releaseLock()
        if (!res.writableEnded) res.end()
      }
      const durationMs = Date.now() - startedAt
      recordAuditAndInspector({
        timestamp: new Date().toISOString(),
        method,
        path: forwardPath,
        upstream: baseUrl,
        sessionId,
        status: upstreamRes.status,
        streamed: true,
        durationMs,
        redactions: stats.redactions,
        counts: stats.counts,
        redactedPreview,
        ...(requestWarnings ? { warnings: requestWarnings } : {}),
      })
      log(
        `[maskera-proxy] ${method} ${forwardPath} ${upstreamRes.status} sse redacted=${stats.redactions} ${durationMs}ms`,
      )
      return
    }

    let resBuf: Buffer
    try {
      resBuf = Buffer.from(await upstreamRes.arrayBuffer())
    } finally {
      res.off("close", onClientClose)
    }
    const errorDetail = await extractSafeUpstreamError(resBuf, upstreamRes.status, engine)
    if (hasMap && resContentType.includes("application/json")) {
      try {
        const parsed = JSON.parse(resBuf.toString("utf8")) as unknown
        const restored = restoreLlmResponseBody(parsed, sessionMap, {
          mutate: true,
          reasoningExcludedTokens: externalTokens,
        })
        const restoredBuf = Buffer.from(JSON.stringify(restored), "utf8")
        res.writeHead(upstreamRes.status, outHeaders)
        res.end(restoredBuf)
        const durationMs = Date.now() - startedAt
        recordAuditAndInspector({
          timestamp: new Date().toISOString(),
          method,
          path: forwardPath,
          upstream: baseUrl,
          sessionId,
          status: upstreamRes.status,
          streamed: false,
          durationMs,
          redactions: stats.redactions,
          counts: stats.counts,
          redactedPreview,
          ...(errorDetail ? { errorDetail } : {}),
          ...(requestWarnings ? { warnings: requestWarnings } : {}),
        })
        log(
          `[maskera-proxy] ${method} ${forwardPath} ${upstreamRes.status} json redacted=${stats.redactions} ${durationMs}ms`,
        )
        return
      } catch {
        // Fall through and send raw bytes if JSON failed to parse.
      }
    }

    res.writeHead(upstreamRes.status, outHeaders)
    res.end(resBuf)
    const durationMs = Date.now() - startedAt
    recordAuditAndInspector({
      timestamp: new Date().toISOString(),
      method,
      path: forwardPath,
      upstream: baseUrl,
      sessionId,
      status: upstreamRes.status,
      streamed: isSse,
      durationMs,
      redactions: stats.redactions,
      counts: stats.counts,
      redactedPreview,
      ...(errorDetail ? { errorDetail } : {}),
      ...(requestWarnings ? { warnings: requestWarnings } : {}),
    })
    log(
      `[maskera-proxy] ${method} ${forwardPath} ${upstreamRes.status} redacted=${stats.redactions} ${durationMs}ms`,
    )
  }

  const server = createServer((req, res) => {
    void handleRequest(req, res).catch((err) => {
      if (res.destroyed || req.aborted) return
      const statusCode = err instanceof PayloadTooLargeError ? err.statusCode : 502
      const message = err instanceof Error ? err.message : String(err)
      log(`[maskera-proxy] error: ${message}`)
      if (!res.headersSent) {
        res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" })
        res.end(JSON.stringify({ error: { message: `maskera-proxy error: ${message}` } }))
      } else if (!res.writableEnded) {
        res.end()
      }
    })
  })

  // Reject WebSocket upgrades (e.g. Codex CLI Responses WebSocket probe) with
  // HTTP 426 Upgrade Required so clients fall back to HTTP SSE on the first
  // attempt with zero reconnect retries instead of hanging or looping.
  server.on("upgrade", (req, socket) => {
    const body = JSON.stringify({
      error: {
        message: "WebSocket transport is not supported by maskera-proxy; retry over HTTP SSE.",
      },
    })
    socket.write(
      `HTTP/1.1 426 Upgrade Required\r\nContent-Type: application/json; charset=utf-8\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
    )
    socket.end()
    log(`[maskera-proxy] UPGRADE ${req.url ?? "/"} 426 (HTTP SSE fallback)`)
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
  boundPort = actualPort
  boundUrl = `http://${host}:${actualPort}`

  return {
    host,
    port: actualPort,
    url: boundUrl,
    mcpUrl: `${boundUrl}/mcp`,
    inspectorUrl: `${boundUrl}/_maskera`,
    server,
    vault,
    inspector,
    approvals,
    stats: () => ({
      requests: totalRequests,
      redactions: totalRedactions,
      counts: { ...totalCounts },
      sessions: vault.list().length,
    }),
    close: async () => {
      unsubscribeApprovals()
      inspector.closeAll()
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()))
      })
      await auditChain
    },
  }
}

export { escapeJsonStringValue }
