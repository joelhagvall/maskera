import { createRequire } from "node:module"
import { extname, isAbsolute, join, relative, sep } from "node:path"
import { type Detection, type PiiLabel, type RedactionProfile, redactFromDetections } from "maskera"
import type { ApprovalBroker, ApprovalMode } from "./approvals"
import { createMaskeraEngine, type MaskeraEngine, type MaskMode } from "./engine"
import { createFileGuard, type FileGuard } from "./files"
import {
  MASKERA_PROMPTS,
  MASKERA_SKILL_MARKDOWN,
  MASKERA_SKILL_URI,
  MASKERA_STATUS_URI,
  renderMaskeraPrompt,
} from "./skill-content"
import { SessionVault } from "./vault"

export const SERVER_NAME = "maskera-mcp"
// Read from package.json so a changeset version bump can never leave the
// advertised server version behind. src/ and the bundled dist/ both sit one
// level below the package root, and npm always ships package.json.
export const SERVER_VERSION: string = createRequire(import.meta.url)("../package.json").version
const SUPPORTED_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const
const PLACEHOLDER_QUERY_RE = /^\[[A-ZÅÄÖ][A-ZÅÄÖ0-9_]*_\d+\]$/

interface JsonRpcRequest {
  jsonrpc?: unknown
  id?: string | number | null
  method?: unknown
  params?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: "2.0"
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface ToolAnnotations {
  title: string
  readOnlyHint: boolean
  destructiveHint: boolean
  idempotentHint: boolean
  openWorldHint: boolean
}

interface ToolDefinition {
  name: string
  description: string
  annotations: ToolAnnotations
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
}

export interface ElicitationRequest {
  message: string
  requestedSchema: Record<string, unknown>
}

export interface ElicitationResponse {
  action: "accept" | "decline" | "cancel"
  content?: Record<string, unknown>
}

export interface ToolCallTelemetry {
  tool: string
  sessionId?: string
  redactions: number
  counts: Record<string, number>
  durationMs: number
  isError: boolean
}

const COUNTS_SCHEMA = {
  type: "object",
  additionalProperties: { type: "integer" },
}

const TOOLS: readonly ToolDefinition[] = [
  {
    name: "maskera_redact",
    description:
      "Redact Swedish PII (names, personnummer, addresses, emails, phones, IBAN, etc.) locally on-device using Maskera's 43 MB Swedish NER model and deterministic rules. Stores the restore map locally under session_id so placeholders stay consistent across calls and can be restored later without exposing raw PII to the LLM.",
    annotations: {
      title: "Redact Swedish PII locally",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text to redact locally." },
        session_id: {
          type: "string",
          description:
            "Optional session ID to reuse consistent placeholder numbering across calls.",
        },
        mode: {
          type: "string",
          enum: ["auto", "rules"],
          description:
            '"auto" (default) runs hybrid Swedish NER + rules; "rules" runs fast deterministic rules only.',
        },
        profile: {
          type: "string",
          enum: ["general", "clinical"],
          description: 'Optional built-in precision profile (default "general").',
        },
        custom_terms: {
          type: "array",
          items: { type: "string" },
          description: "Optional extra protected words (client names, case IDs, codenames).",
        },
        include_map: {
          type: "boolean",
          description:
            "Set true only when the caller explicitly needs the raw placeholder->value map returned. Default false (recommended so raw PII stays local).",
        },
      },
      required: ["text"],
    },
    outputSchema: {
      type: "object",
      properties: {
        redacted: { type: "string" },
        session_id: { type: "string" },
        counts: COUNTS_SCHEMA,
        total_redactions: { type: "integer" },
        mode: { type: "string", enum: ["hybrid", "rules"] },
        map: { type: "object", additionalProperties: { type: "string" } },
        status: { type: "string" },
        request_id: { type: "string" },
        approval_url: { type: "string" },
      },
    },
  },
  {
    name: "maskera_restore",
    description:
      "Restore Maskera placeholders (e.g. [NAMN_1], [PERSONNUMMER_1]) in text using a locally stored session_id or an explicit map.",
    annotations: {
      title: "Restore Maskera placeholders",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "Text containing Maskera placeholders." },
        session_id: {
          type: "string",
          description: "Session ID returned by maskera_redact or maskera_read_file.",
        },
        map: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Optional explicit placeholder -> original value map.",
        },
      },
      required: ["text"],
    },
    outputSchema: {
      type: "object",
      properties: {
        restored: { type: "string" },
        session_id: { type: ["string", "null"] },
        known_placeholders: { type: "integer" },
        status: { type: "string" },
        request_id: { type: "string" },
        approval_url: { type: "string" },
      },
    },
  },
  {
    name: "maskera_read_file",
    description:
      "Read a local UTF-8 text file and redact Swedish PII BEFORE returning its contents to the model. Keeps raw PII strictly in local memory under session_id so the cloud LLM never sees real names or personal IDs.",
    annotations: {
      title: "Read local file with PII redaction",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to a UTF-8 file inside the allowed workspace roots.",
        },
        session_id: {
          type: "string",
          description: "Optional session ID to share placeholder numbering across multiple files.",
        },
        mode: {
          type: "string",
          enum: ["auto", "rules"],
          description: '"auto" (default) runs hybrid NER + rules; "rules" runs rules only.',
        },
        profile: {
          type: "string",
          enum: ["general", "clinical"],
          description: 'Optional built-in precision profile (default "general").',
        },
        custom_terms: {
          type: "array",
          items: { type: "string" },
          description: "Optional extra protected words (client names, project codenames).",
        },
      },
      required: ["path"],
    },
    outputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        bytes: { type: "integer" },
        redacted: { type: "string" },
        session_id: { type: "string" },
        counts: COUNTS_SCHEMA,
        total_redactions: { type: "integer" },
        mode: { type: "string", enum: ["hybrid", "rules"] },
      },
      required: ["path", "bytes", "redacted", "session_id", "counts", "total_redactions", "mode"],
    },
  },
  {
    name: "maskera_write_file",
    description:
      "Restore Maskera placeholders from a local session_id and write the restored text directly to a local file without echoing raw PII back into the LLM context.",
    annotations: {
      title: "Restore placeholders and write local file",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Destination path inside the allowed workspace roots.",
        },
        text: {
          type: "string",
          description: "Draft text containing Maskera placeholders to restore before writing.",
        },
        session_id: {
          type: "string",
          description:
            "Session ID from maskera_read_file or maskera_redact. When omitted, the latest session that knows every placeholder in text is used; ambiguous matches are refused.",
        },
        overwrite: {
          type: "boolean",
          description: "Allow overwriting an existing file. Default false.",
        },
      },
      required: ["path", "text"],
    },
    outputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        bytes: { type: "integer" },
        session_id: { type: "string" },
        known_placeholders: { type: "integer" },
      },
      required: ["path", "bytes", "session_id", "known_placeholders"],
    },
  },
  {
    name: "maskera_list_files",
    description:
      "List regular files inside the allowed workspace roots without reading file contents. Use this before maskera_read_file or maskera_search_files.",
    annotations: {
      title: "List files inside allowed roots",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional subdirectory inside the allowed workspace roots.",
        },
        max_entries: {
          type: "integer",
          description: "Maximum files to return (default 200, max 1000).",
        },
        max_depth: {
          type: "integer",
          description: "Maximum directory depth (default 6, max 12).",
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        root: { type: "string" },
        files: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              bytes: { type: "integer" },
            },
            required: ["path", "bytes"],
          },
        },
        truncated: { type: "boolean" },
      },
      required: ["root", "files", "truncated"],
    },
  },
  {
    name: "maskera_search_files",
    description:
      "Search UTF-8 text files inside the allowed workspace roots and redact Swedish PII in every matched line BEFORE returning results. Accepts either a normal search term or a known placeholder from session_id (e.g. [NAMN_1]).",
    annotations: {
      title: "Search local files with PII redaction",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Text or session placeholder (e.g. [NAMN_1]) to search for.",
        },
        path: {
          type: "string",
          description: "Optional subdirectory inside the allowed workspace roots.",
        },
        session_id: {
          type: "string",
          description: "Optional session ID for consistent placeholders across matches.",
        },
        case_sensitive: {
          type: "boolean",
          description: "Case-sensitive search. Default false.",
        },
        max_matches: {
          type: "integer",
          description: "Maximum matched lines to return (default 50, max 200).",
        },
        mode: {
          type: "string",
          enum: ["auto", "rules"],
          description: '"auto" (default) runs hybrid NER + rules; "rules" runs rules only.',
        },
        profile: {
          type: "string",
          enum: ["general", "clinical"],
          description: 'Optional built-in precision profile (default "general").',
        },
        custom_terms: {
          type: "array",
          items: { type: "string" },
          description: "Optional extra protected words (client names, project codenames).",
        },
      },
      required: ["query"],
    },
    outputSchema: {
      type: "object",
      properties: {
        root: { type: "string" },
        scanned_files: { type: "integer" },
        session_id: { type: "string" },
        counts: COUNTS_SCHEMA,
        total_redactions: { type: "integer" },
        truncated: { type: "boolean" },
        matches: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              line: { type: "integer" },
              redacted_line: { type: "string" },
            },
            required: ["path", "line", "redacted_line"],
          },
        },
      },
      required: [
        "root",
        "scanned_files",
        "session_id",
        "counts",
        "total_redactions",
        "truncated",
        "matches",
      ],
    },
  },
  {
    name: "maskera_list_sessions",
    description:
      "List active local redaction sessions and entity counts (never returns raw PII values).",
    annotations: {
      title: "List active Maskera sessions",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        sessions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              sessionId: { type: "string" },
              entityCount: { type: "integer" },
              countsByLabel: COUNTS_SCHEMA,
              createdAt: { type: "string" },
              updatedAt: { type: "string" },
            },
            required: ["sessionId", "entityCount", "countsByLabel", "createdAt", "updatedAt"],
          },
        },
      },
      required: ["sessions"],
    },
  },
  {
    name: "maskera_clear_session",
    description: "Erase a session's local in-memory restore map immediately.",
    annotations: {
      title: "Clear Maskera session vault",
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID to erase." },
      },
      required: ["session_id"],
    },
    outputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string" },
        cleared: { type: "boolean" },
      },
      required: ["session_id", "cleared"],
    },
  },
  {
    name: "maskera_status",
    description:
      "Report local Maskera MCP server status: model pin, readiness, active sessions, policy, and allowed file roots.",
    annotations: {
      title: "Maskera MCP server status",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        server: { type: "string" },
        version: { type: "string" },
        engine: { type: "object" },
        active_sessions: { type: "integer" },
        allowed_roots: { type: "array", items: { type: "string" } },
        policy: {
          type: "object",
          properties: {
            read_only: { type: "boolean" },
            allow_raw_restore: { type: "boolean" },
            approval_mode: { type: "string", enum: ["automatic", "browser", "native"] },
          },
          required: ["read_only", "allow_raw_restore", "approval_mode"],
        },
      },
      required: ["server", "version", "engine", "active_sessions", "allowed_roots", "policy"],
    },
  },
  {
    name: "maskera_resume",
    description:
      "Resume a paused Maskera approval request after the user approves or declines it in the local browser inspector.",
    annotations: {
      title: "Resume pending Maskera approval",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      properties: {
        request_id: {
          type: "string",
          description: "Approval request_id returned by a paused tool call.",
        },
      },
      required: ["request_id"],
    },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string" },
        request_id: { type: "string" },
      },
      required: ["status", "request_id"],
    },
  },
]

const WRITE_TOOLS = new Set(["maskera_write_file", "maskera_clear_session"])
const CODE_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
  ".lock",
  ".css",
  ".scss",
  ".html",
  ".svg",
  ".map",
  ".py",
  ".rs",
  ".go",
  ".java",
  ".rb",
  ".sh",
  ".sql",
  ".env",
])
const PATH_NER_LABELS = new Set<PiiLabel>(["NAMN", "ORG", "PLATS"])
const PATH_NER_PREFIX = "Dokument om "
const MAX_PATH_ALIASES_PER_OWNER = 5_000

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asMode(value: unknown): MaskMode | undefined {
  if (value === undefined) return undefined
  if (value === "auto" || value === "rules") return value
  throw new Error('Invalid mode: expected "auto" or "rules".')
}

function asProfile(value: unknown): RedactionProfile | undefined {
  if (value === undefined) return undefined
  if (value === "general" || value === "clinical") return value
  throw new Error('Invalid profile: expected "general" or "clinical".')
}

function asStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new Error("custom_terms must be an array of strings.")
  }
  return value
}

function asOptionalInt(value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("Expected a finite integer.")
  }
  return Math.trunc(value)
}

function toolOk(payload: Record<string, unknown>) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  }
}

function toolError(message: string) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  }
}

export interface MaskeraMcpPolicy {
  /** Block `maskera_restore` and `maskera_redact(..., { include_map: true })`. Default: `true` (allowed). */
  allowRawRestore?: boolean
  /** Omit and block state-changing tools (`maskera_write_file`, `maskera_clear_session`). Default: `false`. */
  readOnly?: boolean
  /** Gate raw PII release (`automatic`, `browser`, or `native` MCP elicitation). Default: `"automatic"`. */
  approvalMode?: ApprovalMode
  /** Vault & approval isolation owner namespace (e.g. per Streamable HTTP `Mcp-Session-Id`). */
  sessionOwner?: string
}

interface ResolvedPolicy {
  allowRawRestore: boolean
  readOnly: boolean
  approvalMode: ApprovalMode
  sessionOwner: string
}

function truncatePreservingPlaceholders(text: string, maxLength = 500): string {
  if (text.length <= maxLength) return text
  let cut = maxLength
  const open = text.lastIndexOf("[", cut - 1)
  if (open >= 0) {
    const close = text.indexOf("]", open)
    if (close >= cut) {
      // Avoid slicing a `[LABEL_N]` placeholder in half.
      cut = open
    }
  }
  return `${text.slice(0, cut)}...`
}

function enforceSessionSecretsRedacted(
  text: string,
  sessionMap: Readonly<Record<string, string>>,
): { text: string; extraRedactions: number } {
  const entries = Object.entries(sessionMap)
    .filter(([, value]) => value.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
  let out = text
  let extraRedactions = 0
  for (const [token, rawValue] of entries) {
    if (!out.includes(rawValue)) continue
    const parts = out.split(rawValue)
    extraRedactions += parts.length - 1
    out = parts.join(token)
  }
  return { text: out, extraRedactions }
}

export interface MaskeraMcpOptions extends MaskeraMcpPolicy {
  engine?: MaskeraEngine
  vault?: SessionVault
  files?: FileGuard
  allowedRoots?: readonly string[]
  defaultProfile?: RedactionProfile
  defaultCustomTerms?: readonly string[]
  approvals?: ApprovalBroker
  approvalBaseUrl?: string
  requestElicitation?: (req: ElicitationRequest) => Promise<ElicitationResponse>
  onToolCall?: (event: ToolCallTelemetry) => void
}

export interface MaskeraMcpServer {
  handleMessage(raw: unknown, policyOverride?: MaskeraMcpPolicy): Promise<JsonRpcResponse | null>
  readonly vault: SessionVault
}

export function createMaskeraMcpServer(options: MaskeraMcpOptions = {}): MaskeraMcpServer {
  const engine = options.engine ?? createMaskeraEngine()
  const vault = options.vault ?? new SessionVault()
  const files = options.files ?? createFileGuard(options.allowedRoots)
  const defaultProfile = options.defaultProfile
  const defaultCustomTerms = options.defaultCustomTerms
  const approvals = options.approvals
  const approvalBaseUrl = options.approvalBaseUrl
  const requestElicitation = options.requestElicitation
  const onToolCall = options.onToolCall

  let clientSupportsElicitation = false
  const ownerPathAliases = new Map<
    string,
    { toAlias: Map<string, string>; toReal: Map<string, string> }
  >()

  function getPathAliasBucket(owner: string) {
    let bucket = ownerPathAliases.get(owner)
    if (!bucket) {
      bucket = { toAlias: new Map(), toReal: new Map() }
      ownerPathAliases.set(owner, bucket)
    }
    return bucket
  }

  function registerPathAlias(owner: string, realPath: string, aliasPath: string): void {
    if (realPath === aliasPath) return
    const bucket = getPathAliasBucket(owner)
    if (bucket.toAlias.size >= MAX_PATH_ALIASES_PER_OWNER && !bucket.toAlias.has(realPath)) {
      const oldestReal = bucket.toAlias.keys().next().value
      if (oldestReal !== undefined) {
        const oldestAlias = bucket.toAlias.get(oldestReal)
        bucket.toAlias.delete(oldestReal)
        if (oldestAlias !== undefined) bucket.toReal.delete(oldestAlias)
      }
    }
    bucket.toAlias.set(realPath, aliasPath)
    bucket.toReal.set(aliasPath, realPath)
  }

  async function redactPathSegment(
    segment: string,
    isFinalSegment: boolean,
    opts: {
      owner: string
      sessionId?: string
      mode?: MaskMode
      profile?: RedactionProfile
      customTerms?: readonly string[]
    },
  ): Promise<{ segment: string; sessionId?: string; changed: boolean }> {
    const ext = isFinalSegment ? extname(segment) : ""
    const stem = ext ? segment.slice(0, -ext.length) : segment
    if (!stem.trim()) return { segment, sessionId: opts.sessionId, changed: false }

    // 1. Always run fast deterministic rules + customTerms with `_` turned into
    // spaces (preserving `-` so personnummer/phone/orgnr match cleanly).
    const rulesProbe = stem.replace(/_/g, " ")
    const { result: rulesRes } = await engine.redact(rulesProbe, {
      mode: "rules",
      profile: opts.profile,
      customTerms: opts.customTerms,
    })
    const detections: Detection[] = rulesRes.redactions.map((r) => ({
      start: r.start,
      end: r.end,
      label: r.label,
      value: stem.slice(r.start, r.end),
    }))

    // 2. For non-code document filenames in hybrid auto mode, also probe with
    // ONNX NER using a 1-to-1 title-cased copy so names like `anna-lindqvist.txt`
    // are masked while code filenames (`index.ts`, `package.json`) stay untouched.
    const effectiveMode = opts.mode ?? engine.status().defaultMode
    const isCodeFile = ext !== "" && CODE_FILE_EXTENSIONS.has(ext.toLowerCase())
    if (effectiveMode === "auto" && !isCodeFile) {
      const alphaWords = stem.match(/[A-Za-zÅÄÖåäöÉé]{2,}/g) ?? []
      if (alphaWords.length >= 2) {
        const titleProbe = stem
          .replace(/[_-]/g, " ")
          .replace(
            /(^| )([a-zåäöé])/g,
            (_m, lead: string, ch: string) => `${lead}${ch.toUpperCase()}`,
          )
        const framed = `${PATH_NER_PREFIX}${titleProbe}`
        const { result: nerRes } = await engine.redact(framed, {
          mode: "auto",
          profile: opts.profile,
          customTerms: opts.customTerms,
        })
        const offset = PATH_NER_PREFIX.length
        for (const r of nerRes.redactions) {
          if (!PATH_NER_LABELS.has(r.label)) continue
          const start = r.start - offset
          const end = r.end - offset
          if (start < 0 || end <= start || end > stem.length) continue
          const overlaps = detections.some((d) => d.start < end && d.end > start)
          if (!overlaps) {
            detections.push({ start, end, label: r.label, value: stem.slice(start, end) })
          }
        }
      }
    }

    if (detections.length === 0) {
      return { segment, sessionId: opts.sessionId, changed: false }
    }
    const redactedStem = redactFromDetections(stem, detections)
    const applied = vault.apply(stem, redactedStem, opts.sessionId, opts.owner)
    return {
      segment: `${applied.redacted}${ext}`,
      sessionId: applied.sessionId,
      changed: applied.redacted !== stem,
    }
  }

  async function redactRelativePath(
    relPath: string,
    opts: {
      owner: string
      sessionId?: string
      mode?: MaskMode
      profile?: RedactionProfile
      customTerms?: readonly string[]
      rootBase?: string
    },
  ): Promise<{ path: string; sessionId?: string; changed: boolean }> {
    const parts = relPath.split("/")
    const outParts: string[] = []
    let activeSession = opts.sessionId
    let anyChanged = false
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i] ?? ""
      const res = await redactPathSegment(part, i === parts.length - 1, {
        owner: opts.owner,
        sessionId: activeSession,
        mode: opts.mode,
        profile: opts.profile,
        customTerms: opts.customTerms,
      })
      activeSession = res.sessionId
      if (res.changed) anyChanged = true
      outParts.push(res.segment)
    }
    const aliasedRel = outParts.join("/")
    if (anyChanged) {
      registerPathAlias(opts.owner, relPath, aliasedRel)
      if (opts.rootBase) {
        registerPathAlias(opts.owner, join(opts.rootBase, relPath), join(opts.rootBase, aliasedRel))
      }
    }
    return { path: aliasedRel, sessionId: activeSession, changed: anyChanged }
  }

  async function redactResolvedPath(
    resolvedPath: string,
    opts: {
      owner: string
      sessionId?: string
      mode?: MaskMode
      profile?: RedactionProfile
      customTerms?: readonly string[]
    },
  ): Promise<string> {
    const candidates = files.allowedRoots.flatMap((root) =>
      root.startsWith("/private/") ? [root] : [root, `/private${root}`],
    )
    let bestRoot: string | null = null
    let bestRel: string | null = null
    for (const root of candidates) {
      const rel = relative(root, resolvedPath)
      if (rel && !rel.startsWith("..") && !isAbsolute(rel)) {
        if (!bestRoot || root.length > bestRoot.length) {
          bestRoot = root
          bestRel = rel.split(sep).join("/")
        }
      }
    }
    if (!bestRoot || !bestRel) return resolvedPath
    const res = await redactRelativePath(bestRel, { ...opts, rootBase: bestRoot })
    if (!res.changed) return resolvedPath
    return join(bestRoot, res.path)
  }

  function resolveInputPath(rawPath: string, owner: string, sessionId?: string): string {
    const trimmed = rawPath.trim()
    const bucket = ownerPathAliases.get(owner)
    const direct = bucket?.toReal.get(trimmed)
    if (direct) return direct
    const normalized = trimmed.split(sep).join("/")
    const directNorm = bucket?.toReal.get(normalized)
    if (directNorm) return directNorm
    if (trimmed.includes("[") && trimmed.includes("]")) {
      try {
        const sid = sessionId?.trim() || vault.resolveSessionFor(trimmed, owner)
        const { restored } = vault.restore(trimmed, { sessionId: sid, owner })
        return restored
      } catch {
        // Fall through to FileGuard with original path if no vault session matches.
      }
    }
    return rawPath
  }

  function resolvePolicy(override?: MaskeraMcpPolicy): ResolvedPolicy {
    return {
      allowRawRestore: override?.allowRawRestore ?? options.allowRawRestore ?? true,
      readOnly: override?.readOnly ?? options.readOnly ?? false,
      approvalMode: override?.approvalMode ?? options.approvalMode ?? "automatic",
      sessionOwner: override?.sessionOwner ?? options.sessionOwner ?? "default",
    }
  }

  function visibleTools(policy: ResolvedPolicy): ToolDefinition[] {
    return TOOLS.filter((tool) => {
      if (tool.name === "maskera_resume") {
        return policy.approvalMode === "browser" && Boolean(approvals)
      }
      if (!policy.allowRawRestore && tool.name === "maskera_restore") return false
      if (policy.readOnly && WRITE_TOOLS.has(tool.name)) return false
      return true
    })
  }

  function mergeCustomTerms(callTerms: string[] | undefined): readonly string[] | undefined {
    if (!defaultCustomTerms?.length) return callTerms
    if (!callTerms?.length) return defaultCustomTerms
    return [...defaultCustomTerms, ...callTerms]
  }

  function statusPayload(policy: ResolvedPolicy): Record<string, unknown> {
    return {
      server: SERVER_NAME,
      version: SERVER_VERSION,
      engine: engine.status(),
      active_sessions: vault.sizeForOwner(policy.sessionOwner),
      allowed_roots: files.allowedRoots,
      policy: {
        read_only: policy.readOnly,
        allow_raw_restore: policy.allowRawRestore,
        approval_mode: policy.approvalMode,
      },
    }
  }

  async function gateRawPiiExport(input: {
    policy: ResolvedPolicy
    tool: string
    reason: string
    sessionId?: string | null
    placeholderCount: number
    execute: () => Promise<Record<string, unknown>>
  }): Promise<ReturnType<typeof toolOk> | ReturnType<typeof toolError>> {
    const { policy } = input
    if (!policy.allowRawRestore) {
      return toolError(
        `Raw PII export is disabled by server policy (--no-raw-restore). Use maskera_write_file to restore directly to disk without exposing raw PII to the model.`,
      )
    }

    if (policy.approvalMode === "automatic") {
      return toolOk(await input.execute())
    }

    if (policy.approvalMode === "native") {
      if (!requestElicitation || !clientSupportsElicitation) {
        return toolError(
          `Approval mode "native" requires an MCP client with elicitation support. Reconnect with approval_mode=browser or write restored output directly via maskera_write_file.`,
        )
      }
      const response = await requestElicitation({
        message: `${input.tool} wants to release ${input.placeholderCount} original Swedish PII value(s) into the model context (${input.reason}).`,
        requestedSchema: {
          type: "object",
          properties: {
            confirm: {
              type: "boolean",
              title: "Release raw PII into model context",
              default: false,
            },
          },
          required: ["confirm"],
        },
      })
      if (response.action !== "accept" || response.content?.confirm !== true) {
        return toolError(
          `Raw PII export via ${input.tool} was declined. Use maskera_write_file to restore directly to disk instead.`,
        )
      }
      return toolOk(await input.execute())
    }

    if (!approvals) {
      return toolError(
        `Approval mode "browser" requires the local HTTP inspector/approval server (start "maskera-mcp proxy" and connect to /mcp?approval_mode=browser).`,
      )
    }

    const summary = approvals.create({
      tool: input.tool,
      reason: input.reason,
      sessionId: input.sessionId,
      owner: policy.sessionOwner,
      placeholderCount: input.placeholderCount,
      execute: input.execute,
    })
    const approvalUrl = approvalBaseUrl
      ? `${approvalBaseUrl.replace(/\/$/, "")}/_maskera#approval-${summary.id}`
      : "/_maskera"
    return toolOk({
      status: "approval_required",
      request_id: summary.id,
      approval_url: approvalUrl,
      tool: summary.tool,
      placeholder_count: summary.placeholderCount,
      message: `Open ${approvalUrl} to approve or decline releasing raw PII, then call maskera_resume with request_id="${summary.id}".`,
    })
  }

  async function callTool(name: string, rawArgs: unknown, policy: ResolvedPolicy) {
    const startedAt = Date.now()
    const args = asObject(rawArgs)
    const owner = policy.sessionOwner
    let telemetrySessionId: string | undefined
    let telemetryRedactions = 0
    let telemetryCounts: Record<string, number> = {}

    const finish = (result: ReturnType<typeof toolOk> | ReturnType<typeof toolError>) => {
      onToolCall?.({
        tool: name,
        sessionId: telemetrySessionId,
        redactions: telemetryRedactions,
        counts: telemetryCounts,
        durationMs: Date.now() - startedAt,
        isError: "isError" in result && result.isError === true,
      })
      return result
    }

    try {
      if (policy.readOnly && WRITE_TOOLS.has(name)) {
        return finish(toolError(`Tool "${name}" is disabled in read-only mode (--read-only).`))
      }

      if (name === "maskera_redact") {
        if (typeof args.text !== "string") return finish(toolError("Missing required string: text"))
        const wantsMap = args.include_map === true
        if (wantsMap && !policy.allowRawRestore) {
          return finish(
            toolError(
              "include_map=true is disabled by server policy (--no-raw-restore). Omit include_map and use session_id with maskera_write_file instead.",
            ),
          )
        }
        const { result, modeUsed } = await engine.redact(args.text, {
          mode: asMode(args.mode),
          profile: asProfile(args.profile) ?? defaultProfile,
          customTerms: mergeCustomTerms(asStringArray(args.custom_terms)),
        })
        const applied = vault.apply(
          args.text,
          result,
          typeof args.session_id === "string" ? args.session_id : undefined,
          owner,
        )
        telemetrySessionId = applied.sessionId
        telemetryRedactions = applied.totalRedactions
        telemetryCounts = applied.counts

        const payload: Record<string, unknown> = {
          redacted: applied.redacted,
          session_id: applied.sessionId,
          counts: applied.counts,
          total_redactions: applied.totalRedactions,
          mode: modeUsed,
        }
        if (wantsMap && Object.keys(applied.map).length > 0) {
          return finish(
            await gateRawPiiExport({
              policy,
              tool: "maskera_redact",
              reason: "include_map=true requested raw placeholder map",
              sessionId: applied.sessionId,
              placeholderCount: Object.keys(applied.map).length,
              execute: async () => ({ ...payload, map: applied.map }),
            }),
          )
        }
        if (wantsMap) payload.map = applied.map
        return finish(toolOk(payload))
      }

      if (name === "maskera_restore") {
        if (!policy.allowRawRestore) {
          return finish(
            toolError(
              "Raw PII export is disabled by server policy (--no-raw-restore). Use maskera_write_file to restore directly to disk without exposing raw PII to the model.",
            ),
          )
        }
        if (typeof args.text !== "string") return finish(toolError("Missing required string: text"))
        const explicitMap =
          args.map && typeof args.map === "object" && !Array.isArray(args.map)
            ? Object.fromEntries(
                Object.entries(args.map as Record<string, unknown>).filter(
                  (entry): entry is [string, string] => typeof entry[1] === "string",
                ),
              )
            : undefined
        const sessionIdArg =
          typeof args.session_id === "string" ? args.session_id.trim() : undefined
        telemetrySessionId = sessionIdArg
        // Validate the session/map eagerly so missing sessions fail immediately.
        const preview = vault.restore(args.text, {
          sessionId: sessionIdArg,
          map: explicitMap,
          owner,
        })
        return finish(
          await gateRawPiiExport({
            policy,
            tool: "maskera_restore",
            reason: "restore placeholders into model context",
            sessionId: preview.sessionId,
            placeholderCount: preview.knownPlaceholders,
            execute: async () => ({
              restored: preview.restored,
              session_id: preview.sessionId,
              known_placeholders: preview.knownPlaceholders,
            }),
          }),
        )
      }

      if (name === "maskera_resume") {
        if (policy.approvalMode !== "browser" || !approvals) {
          return finish(toolError("maskera_resume is only available in browser approval mode."))
        }
        if (typeof args.request_id !== "string" || !args.request_id.trim()) {
          return finish(toolError("Missing required non-empty string: request_id"))
        }
        const requestId = args.request_id.trim()
        const resumed = await approvals.resume(requestId, owner)
        if (resumed.status === "not_found") {
          return finish(toolError(`Unknown approval request_id "${requestId}".`))
        }
        if (resumed.status === "completed") {
          return finish(
            toolOk({
              status: "completed",
              request_id: requestId,
              ...resumed.result,
            }),
          )
        }
        return finish(
          toolOk({
            status: resumed.status,
            request_id: requestId,
          }),
        )
      }

      if (name === "maskera_read_file") {
        if (typeof args.path !== "string") return finish(toolError("Missing required string: path"))
        const requestedMode = asMode(args.mode)
        if (engine.status().defaultMode === "auto" && requestedMode === "rules") {
          return finish(
            toolError(
              'Downgrading mode to "rules" is not allowed on maskera_read_file when the server runs in hybrid "auto" mode.',
            ),
          )
        }
        const requestedSession = typeof args.session_id === "string" ? args.session_id : undefined
        const resolvedInputPath = resolveInputPath(args.path, owner, requestedSession)
        const file = await files.readText(resolvedInputPath)
        const profile = asProfile(args.profile) ?? defaultProfile
        const customTerms = mergeCustomTerms(asStringArray(args.custom_terms))
        const { result, modeUsed } = await engine.redact(file.content, {
          mode: requestedMode,
          profile,
          customTerms,
        })
        const applied = vault.apply(file.content, result, requestedSession, owner)
        const safePath = await redactResolvedPath(file.resolvedPath, {
          owner,
          sessionId: applied.sessionId,
          mode: requestedMode,
          profile,
          customTerms,
        })
        telemetrySessionId = applied.sessionId
        telemetryRedactions = applied.totalRedactions
        telemetryCounts = applied.counts
        return finish(
          toolOk({
            path: safePath,
            bytes: file.bytes,
            redacted: applied.redacted,
            session_id: applied.sessionId,
            counts: applied.counts,
            total_redactions: applied.totalRedactions,
            mode: modeUsed,
          }),
        )
      }

      if (name === "maskera_write_file") {
        if (typeof args.path !== "string") return finish(toolError("Missing required string: path"))
        if (typeof args.text !== "string") return finish(toolError("Missing required string: text"))
        const normalizedSessionId =
          typeof args.session_id === "string" && args.session_id.trim()
            ? args.session_id.trim()
            : vault.resolveSessionFor(args.text, owner)
        telemetrySessionId = normalizedSessionId
        const { restored, knownPlaceholders } = vault.restore(args.text, {
          sessionId: normalizedSessionId,
          owner,
        })
        const resolvedTargetPath = resolveInputPath(args.path, owner, normalizedSessionId)
        const written = await files.writeText(resolvedTargetPath, restored, {
          overwrite: args.overwrite === true,
        })
        const safePath = await redactResolvedPath(written.resolvedPath, {
          owner,
          sessionId: normalizedSessionId,
          profile: defaultProfile,
          customTerms: defaultCustomTerms,
        })
        return finish(
          toolOk({
            path: safePath,
            bytes: written.bytes,
            session_id: normalizedSessionId,
            known_placeholders: knownPlaceholders,
          }),
        )
      }

      if (name === "maskera_list_files") {
        const listed = await files.listFiles(
          typeof args.path === "string" ? args.path : undefined,
          {
            maxEntries: asOptionalInt(args.max_entries),
            maxDepth: asOptionalInt(args.max_depth),
          },
        )
        let pathSessionId: string | undefined
        const safeFiles = []
        for (const entry of listed.files) {
          const safe = await redactRelativePath(entry.path, {
            owner,
            sessionId: pathSessionId,
            profile: defaultProfile,
            customTerms: defaultCustomTerms,
            rootBase: listed.root,
          })
          pathSessionId = safe.sessionId
          safeFiles.push({ path: safe.path, bytes: entry.bytes })
        }
        return finish(
          toolOk({
            root: listed.root,
            files: safeFiles,
            truncated: listed.truncated,
            ...(pathSessionId ? { session_id: pathSessionId } : {}),
          }),
        )
      }

      if (name === "maskera_search_files") {
        if (typeof args.query !== "string" || !args.query.trim()) {
          return finish(toolError("Missing required non-empty string: query"))
        }
        const mode = asMode(args.mode)
        if (engine.status().defaultMode === "auto" && mode === "rules") {
          return finish(
            toolError(
              'Downgrading mode to "rules" is not allowed on maskera_search_files when the server runs in hybrid "auto" mode.',
            ),
          )
        }
        const requestedSession =
          typeof args.session_id === "string" && args.session_id.trim()
            ? args.session_id.trim()
            : undefined
        const existingSessionMap = requestedSession ? vault.getMap(requestedSession, owner) : {}
        let resolvedQuery = args.query.trim()
        // Allow searching by an existing Maskera placeholder (e.g. [NAMN_1])
        // by resolving it locally from the session vault without exposing it.
        if (requestedSession && PLACEHOLDER_QUERY_RE.test(resolvedQuery)) {
          const mapped = existingSessionMap[resolvedQuery]
          if (mapped) {
            resolvedQuery = mapped
          }
        }
        const search = await files.searchFiles(resolvedQuery, {
          path: typeof args.path === "string" ? args.path : undefined,
          caseSensitive: args.case_sensitive === true,
          maxMatches: asOptionalInt(args.max_matches),
        })
        const profile = asProfile(args.profile) ?? defaultProfile
        const customTerms = mergeCustomTerms(asStringArray(args.custom_terms))

        let activeSessionId = requestedSession
        const totalCounts: Record<string, number> = {}
        let totalRedactions = 0
        const redactedMatches: Array<{ path: string; line: number; redacted_line: string }> = []

        for (const match of search.matches) {
          const { result } = await engine.redact(match.lineText, {
            mode,
            profile,
            customTerms,
          })
          const applied = vault.apply(match.lineText, result, activeSessionId, owner)
          activeSessionId = applied.sessionId
          totalRedactions += applied.totalRedactions
          for (const [label, count] of Object.entries(applied.counts)) {
            totalCounts[label] = (totalCounts[label] ?? 0) + count
          }
          // Guarantee that any vault secret already known in this session
          // (including placeholder-resolved search terms) can never leak in
          // plaintext when isolated single-line context weakens NER recall.
          const currentMap = vault.getMap(activeSessionId, owner)
          const safeguarded = enforceSessionSecretsRedacted(applied.redacted, currentMap)
          totalRedactions += safeguarded.extraRedactions
          const safeMatchPath = await redactRelativePath(match.path, {
            owner,
            sessionId: activeSessionId,
            mode,
            profile,
            customTerms,
            rootBase: search.root,
          })
          activeSessionId = safeMatchPath.sessionId ?? activeSessionId
          redactedMatches.push({
            path: safeMatchPath.path,
            line: match.line,
            redacted_line: truncatePreservingPlaceholders(safeguarded.text, 500),
          })
        }

        const ensuredSessionId =
          activeSessionId ??
          vault.apply(
            "",
            { text: "", map: {}, redactions: [], restore: (s) => s },
            requestedSession,
            owner,
          ).sessionId
        telemetrySessionId = ensuredSessionId
        telemetryRedactions = totalRedactions
        telemetryCounts = totalCounts

        return finish(
          toolOk({
            root: search.root,
            scanned_files: search.scannedFiles,
            session_id: ensuredSessionId,
            counts: totalCounts,
            total_redactions: totalRedactions,
            truncated: search.truncated,
            matches: redactedMatches,
          }),
        )
      }

      if (name === "maskera_list_sessions") {
        return finish(toolOk({ sessions: vault.list(owner) }))
      }

      if (name === "maskera_clear_session") {
        if (typeof args.session_id !== "string" || !args.session_id.trim()) {
          return finish(toolError("Missing required non-empty string: session_id"))
        }
        const normalizedSessionId = args.session_id.trim()
        telemetrySessionId = normalizedSessionId
        return finish(
          toolOk({
            session_id: normalizedSessionId,
            cleared: vault.clear(normalizedSessionId, owner),
          }),
        )
      }

      if (name === "maskera_status") {
        return finish(toolOk(statusPayload(policy)))
      }

      return finish(toolError(`Unknown tool "${name}".`))
    } catch (err) {
      return finish(toolError(err instanceof Error ? err.message : String(err)))
    }
  }

  return {
    vault,
    async handleMessage(
      raw: unknown,
      policyOverride?: MaskeraMcpPolicy,
    ): Promise<JsonRpcResponse | null> {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid Request" },
        }
      }
      const req = raw as JsonRpcRequest
      const hasIdProp = Object.hasOwn(req, "id")
      const validId =
        typeof req.id === "string" || typeof req.id === "number" || req.id === null
          ? req.id
          : undefined

      if (
        req.jsonrpc !== "2.0" ||
        typeof req.method !== "string" ||
        (hasIdProp && validId === undefined)
      ) {
        return {
          jsonrpc: "2.0",
          id: validId ?? null,
          error: { code: -32600, message: "Invalid Request" },
        }
      }

      const id = validId
      // JSON-RPC notifications (no id) never receive a response.
      if (id === undefined) {
        return null
      }

      const policy = resolvePolicy(policyOverride)

      if (req.method === "initialize") {
        const params = asObject(req.params)
        const clientCaps = asObject(params.capabilities)
        clientSupportsElicitation = Boolean("elicitation" in clientCaps && clientCaps.elicitation)
        const requested =
          typeof params.protocolVersion === "string" ? params.protocolVersion : undefined
        const protocolVersion =
          requested && (SUPPORTED_PROTOCOLS as readonly string[]).includes(requested)
            ? requested
            : SUPPORTED_PROTOCOLS[0]
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion,
            capabilities: {
              tools: { listChanged: false },
              prompts: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
            },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            instructions: [
              "Maskera redacts Swedish personal data locally on-device.",
              "Use maskera_list_files and maskera_search_files to explore sensitive folders without leaking raw PII via grep.",
              "Use maskera_read_file to read sensitive local files already redacted, maskera_redact for raw snippets, and maskera_write_file to restore placeholders directly to disk without exposing real PII to the model.",
              'Pass profile="clinical" for Swedish healthcare text and custom_terms for client codenames.',
              `Read resource ${MASKERA_SKILL_URI} or prompt "maskera-workflow" for the full operating guide.`,
            ].join(" "),
          },
        }
      }

      if (req.method === "ping") {
        return { jsonrpc: "2.0", id, result: {} }
      }

      if (req.method === "tools/list") {
        return { jsonrpc: "2.0", id, result: { tools: visibleTools(policy) } }
      }

      if (req.method === "tools/call") {
        const params = asObject(req.params)
        if (typeof params.name !== "string") {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Invalid params: missing tool name" },
          }
        }
        const result = await callTool(params.name, params.arguments, policy)
        return { jsonrpc: "2.0", id, result }
      }

      if (req.method === "prompts/list") {
        return { jsonrpc: "2.0", id, result: { prompts: MASKERA_PROMPTS } }
      }

      if (req.method === "prompts/get") {
        const params = asObject(req.params)
        if (typeof params.name !== "string") {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Invalid params: missing prompt name" },
          }
        }
        const rendered = renderMaskeraPrompt(params.name, asObject(params.arguments))
        if (!rendered) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: `Unknown prompt "${params.name}".` },
          }
        }
        return { jsonrpc: "2.0", id, result: rendered }
      }

      if (req.method === "resources/list") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            resources: [
              {
                uri: MASKERA_SKILL_URI,
                name: "maskera-skill",
                title: "Maskera agent workflow skill",
                description:
                  "Complete local Swedish PII redaction operating guide for AI agents (proxy, MCP tools, guard, clinical profile).",
                mimeType: "text/markdown",
              },
              {
                uri: MASKERA_STATUS_URI,
                name: "maskera-status",
                title: "Maskera MCP server status",
                description: "Live local engine, session count, allowed roots, and policy state.",
                mimeType: "application/json",
              },
            ],
          },
        }
      }

      if (req.method === "resources/read") {
        const params = asObject(req.params)
        if (typeof params.uri !== "string") {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Invalid params: missing resource uri" },
          }
        }
        if (params.uri === MASKERA_SKILL_URI) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              contents: [
                {
                  uri: MASKERA_SKILL_URI,
                  mimeType: "text/markdown",
                  text: MASKERA_SKILL_MARKDOWN,
                },
              ],
            },
          }
        }
        if (params.uri === MASKERA_STATUS_URI) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              contents: [
                {
                  uri: MASKERA_STATUS_URI,
                  mimeType: "application/json",
                  text: JSON.stringify(statusPayload(policy), null, 2),
                },
              ],
            },
          }
        }
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32002, message: `Resource not found: ${params.uri}` },
        }
      }

      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${req.method}` },
      }
    },
  }
}
