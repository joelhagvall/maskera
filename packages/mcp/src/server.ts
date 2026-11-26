import type { RedactionProfile } from "maskera"
import { createMaskeraEngine, type MaskeraEngine, type MaskMode } from "./engine"
import { createFileGuard, type FileGuard } from "./files"
import { SessionVault } from "./vault"

export const SERVER_NAME = "maskera-mcp"
export const SERVER_VERSION = "0.1.0"
const SUPPORTED_PROTOCOLS = ["2025-03-26", "2024-11-05"] as const

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

interface ToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

const TOOLS: readonly ToolDefinition[] = [
  {
    name: "maskera_redact",
    description:
      "Redact Swedish PII (names, personnummer, addresses, emails, phones, IBAN, etc.) locally on-device using Maskera's 43 MB Swedish NER model and deterministic rules. Stores the restore map locally under session_id so placeholders stay consistent across calls and can be restored later without exposing raw PII to the LLM.",
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
  },
  {
    name: "maskera_restore",
    description:
      "Restore Maskera placeholders (e.g. [NAMN_1], [PERSONNUMMER_1]) in text using a locally stored session_id or an explicit map.",
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
  },
  {
    name: "maskera_read_file",
    description:
      "Read a local UTF-8 text file and redact Swedish PII BEFORE returning its contents to the model. Keeps raw PII strictly in local memory under session_id so the cloud LLM never sees real names or personal IDs.",
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
  },
  {
    name: "maskera_write_file",
    description:
      "Restore Maskera placeholders from a local session_id and write the restored text directly to a local file without echoing raw PII back into the LLM context.",
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
          description: "Session ID containing the local restore map.",
        },
        overwrite: {
          type: "boolean",
          description: "Allow overwriting an existing file. Default false.",
        },
      },
      required: ["path", "text", "session_id"],
    },
  },
  {
    name: "maskera_list_sessions",
    description:
      "List active local redaction sessions and entity counts (never returns raw PII values).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "maskera_clear_session",
    description: "Erase a session's local in-memory restore map immediately.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Session ID to erase." },
      },
      required: ["session_id"],
    },
  },
  {
    name: "maskera_status",
    description:
      "Report local Maskera MCP server status: model pin, readiness, active sessions, and allowed file roots.",
    inputSchema: { type: "object", properties: {} },
  },
]

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

export interface MaskeraMcpOptions {
  engine?: MaskeraEngine
  vault?: SessionVault
  files?: FileGuard
  allowedRoots?: readonly string[]
}

export interface MaskeraMcpServer {
  handleMessage(raw: unknown): Promise<JsonRpcResponse | null>
  readonly vault: SessionVault
}

export function createMaskeraMcpServer(options: MaskeraMcpOptions = {}): MaskeraMcpServer {
  const engine = options.engine ?? createMaskeraEngine()
  const vault = options.vault ?? new SessionVault()
  const files = options.files ?? createFileGuard(options.allowedRoots)

  async function callTool(name: string, rawArgs: unknown) {
    const args = asObject(rawArgs)
    try {
      if (name === "maskera_redact") {
        if (typeof args.text !== "string") return toolError("Missing required string: text")
        const { result, modeUsed } = await engine.redact(args.text, {
          mode: asMode(args.mode),
          profile: asProfile(args.profile),
          customTerms: asStringArray(args.custom_terms),
        })
        const applied = vault.apply(
          args.text,
          result,
          typeof args.session_id === "string" ? args.session_id : undefined,
        )
        const payload: Record<string, unknown> = {
          redacted: applied.redacted,
          session_id: applied.sessionId,
          counts: applied.counts,
          total_redactions: applied.totalRedactions,
          mode: modeUsed,
        }
        if (args.include_map === true) payload.map = applied.map
        return toolOk(payload)
      }

      if (name === "maskera_restore") {
        if (typeof args.text !== "string") return toolError("Missing required string: text")
        const explicitMap =
          args.map && typeof args.map === "object" && !Array.isArray(args.map)
            ? Object.fromEntries(
                Object.entries(args.map as Record<string, unknown>).filter(
                  (entry): entry is [string, string] => typeof entry[1] === "string",
                ),
              )
            : undefined
        const out = vault.restore(args.text, {
          sessionId: typeof args.session_id === "string" ? args.session_id : undefined,
          map: explicitMap,
        })
        return toolOk({
          restored: out.restored,
          session_id: out.sessionId,
          known_placeholders: out.knownPlaceholders,
        })
      }

      if (name === "maskera_read_file") {
        if (typeof args.path !== "string") return toolError("Missing required string: path")
        const file = await files.readText(args.path)
        const { result, modeUsed } = await engine.redact(file.content, {
          mode: asMode(args.mode),
          profile: asProfile(args.profile),
          customTerms: asStringArray(args.custom_terms),
        })
        const applied = vault.apply(
          file.content,
          result,
          typeof args.session_id === "string" ? args.session_id : undefined,
        )
        return toolOk({
          path: file.resolvedPath,
          bytes: file.bytes,
          redacted: applied.redacted,
          session_id: applied.sessionId,
          counts: applied.counts,
          total_redactions: applied.totalRedactions,
          mode: modeUsed,
        })
      }

      if (name === "maskera_write_file") {
        if (typeof args.path !== "string") return toolError("Missing required string: path")
        if (typeof args.text !== "string") return toolError("Missing required string: text")
        if (typeof args.session_id !== "string") {
          return toolError("Missing required string: session_id")
        }
        const { restored, knownPlaceholders } = vault.restore(args.text, {
          sessionId: args.session_id,
        })
        const written = await files.writeText(args.path, restored, {
          overwrite: args.overwrite === true,
        })
        return toolOk({
          path: written.resolvedPath,
          bytes: written.bytes,
          session_id: args.session_id,
          known_placeholders: knownPlaceholders,
        })
      }

      if (name === "maskera_list_sessions") {
        return toolOk({ sessions: vault.list() })
      }

      if (name === "maskera_clear_session") {
        if (typeof args.session_id !== "string") {
          return toolError("Missing required string: session_id")
        }
        return toolOk({
          session_id: args.session_id,
          cleared: vault.clear(args.session_id),
        })
      }

      if (name === "maskera_status") {
        return toolOk({
          server: SERVER_NAME,
          version: SERVER_VERSION,
          engine: engine.status(),
          active_sessions: vault.size,
          allowed_roots: files.allowedRoots,
        })
      }

      return toolError(`Unknown tool "${name}".`)
    } catch (err) {
      return toolError(err instanceof Error ? err.message : String(err))
    }
  }

  return {
    vault,
    async handleMessage(raw: unknown): Promise<JsonRpcResponse | null> {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid Request" },
        }
      }
      const req = raw as JsonRpcRequest
      const id =
        typeof req.id === "string" || typeof req.id === "number" || req.id === null
          ? req.id
          : undefined

      if (req.jsonrpc !== "2.0" || typeof req.method !== "string") {
        if (id === undefined) return null
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32600, message: "Invalid Request" },
        }
      }

      // JSON-RPC notifications (no id) never receive a response.
      if (id === undefined) {
        return null
      }

      if (req.method === "initialize") {
        const params = asObject(req.params)
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
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
            instructions:
              "Use maskera_read_file to read sensitive local files already redacted, maskera_redact for raw snippets, and maskera_write_file to restore placeholders directly to disk without exposing real PII to the model.",
          },
        }
      }

      if (req.method === "ping") {
        return { jsonrpc: "2.0", id, result: {} }
      }

      if (req.method === "tools/list") {
        return { jsonrpc: "2.0", id, result: { tools: TOOLS } }
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
        const result = await callTool(params.name, params.arguments)
        return { jsonrpc: "2.0", id, result }
      }

      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${req.method}` },
      }
    },
  }
}
