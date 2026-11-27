import type { RedactionProfile } from "maskera"
import type { MaskeraEngine, MaskMode } from "./engine"

export interface GuardResult {
  blocked: boolean
  totalRedactions: number
  counts: Record<string, number>
  redacted: string
  modeUsed: "hybrid" | "rules"
}

const HOOK_PAYLOAD_KEYS = [
  "prompt",
  "user_prompt",
  "tool_input",
  "tool_response",
  "tool_output",
  "command",
  "content",
  "edits",
  "attachments",
] as const

const HOOK_META_SKIP_KEYS = new Set([
  "hook_event_name",
  "tool_name",
  "permission_mode",
  "session_id",
])

function collectScalars(value: unknown, parts: string[], skipKey?: string): void {
  if (skipKey && HOOK_META_SKIP_KEYS.has(skipKey)) return
  if (typeof value === "string") {
    if (value.trim()) parts.push(value)
  } else if (typeof value === "number" && Number.isFinite(value)) {
    parts.push(String(value))
  } else if (Array.isArray(value)) {
    for (const item of value) collectScalars(item, parts)
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) collectScalars(v, parts, k)
  }
}

/**
 * Extracts text from either a plain string or a JSON hook envelope (such as
 * Claude Code / Cursor `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, or
 * `beforeSubmitPrompt` stdin JSON) so the same guard command works across any
 * agent harness or shell pipeline without missing sibling fields or attachments.
 */
export function extractGuardText(rawInput: string): { text: string; isHookEnvelope: boolean } {
  const trimmed = rawInput.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const isHookEnvelope = HOOK_PAYLOAD_KEYS.some((key) => key in parsed)
        if (isHookEnvelope) {
          const parts: string[] = []
          collectScalars(parsed, parts)
          return { text: parts.join("\n"), isHookEnvelope: true }
        }
      }
    } catch {
      // Treat as raw text if not valid JSON.
    }
  }
  return { text: rawInput, isHookEnvelope: false }
}

export async function runGuard(
  rawInput: string,
  engine: MaskeraEngine,
  options: {
    mode?: MaskMode
    profile?: RedactionProfile
    customTerms?: readonly string[]
    preserveJsonStructure?: boolean
  } = {},
): Promise<GuardResult> {
  const trimmed = rawInput.trim()
  if (options.preserveJsonStructure && trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const counts: Record<string, number> = {}
        let totalRedactions = 0
        let modeUsed: "hybrid" | "rules" = options.mode === "rules" ? "rules" : "hybrid"

        const redactJson = async (value: unknown, key?: string): Promise<unknown> => {
          if (key && HOOK_META_SKIP_KEYS.has(key)) return value
          if (typeof value === "string") {
            if (!value.trim()) return value
            const out = await engine.redact(value, {
              mode: options.mode,
              profile: options.profile,
              customTerms: options.customTerms,
            })
            modeUsed = out.modeUsed
            totalRedactions += out.result.redactions.length
            for (const r of out.result.redactions) {
              counts[r.label] = (counts[r.label] ?? 0) + 1
            }
            return out.result.text
          }
          if (Array.isArray(value)) {
            const arr = []
            for (const item of value) arr.push(await redactJson(item))
            return arr
          }
          if (value && typeof value === "object") {
            const obj: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(value)) {
              obj[k] = await redactJson(v, k)
            }
            return obj
          }
          return value
        }

        const redactedObj = await redactJson(parsed)
        return {
          blocked: totalRedactions > 0,
          totalRedactions,
          counts,
          redacted: JSON.stringify(redactedObj),
          modeUsed,
        }
      }
    } catch {
      // Fall through to plain text redaction if invalid JSON.
    }
  }

  const { text } = extractGuardText(rawInput)
  if (!text.trim()) {
    return {
      blocked: false,
      totalRedactions: 0,
      counts: {},
      redacted: text,
      modeUsed: options.mode === "rules" ? "rules" : "hybrid",
    }
  }

  const { result, modeUsed } = await engine.redact(text, {
    mode: options.mode,
    profile: options.profile,
    customTerms: options.customTerms,
  })

  const counts: Record<string, number> = {}
  for (const r of result.redactions) {
    counts[r.label] = (counts[r.label] ?? 0) + 1
  }

  return {
    blocked: result.redactions.length > 0,
    totalRedactions: result.redactions.length,
    counts,
    redacted: result.text,
    modeUsed,
  }
}

function isLoopbackUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== "http:") return null
    const host = parsed.hostname.toLowerCase()
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1" && host !== "[::1]") {
      return null
    }
    return parsed.origin
  } catch {
    return null
  }
}

/**
 * Sends a `guard` check to an already-running local loopback Maskera proxy
 * (`POST /_maskera/guard`) to reuse its warm ONNX NER model (~5-15ms instead of
 * cold-loading the 43 MB model per hook call).
 *
 * Returns `null` when no compatible local proxy is listening (so callers fall
 * back transparently to local in-process redaction). Rejects non-loopback URLs
 * and rethrows explicit proxy `502` fail-closed errors.
 */
export async function runGuardViaWarmProxy(
  rawInput: string,
  options: {
    proxyUrl?: string
    mode?: MaskMode
    profile?: RedactionProfile
    customTerms?: readonly string[]
    preserveJsonStructure?: boolean
    includeRedacted?: boolean
    timeoutMs?: number
  } = {},
): Promise<GuardResult | null> {
  const origin = isLoopbackUrl(options.proxyUrl ?? "http://127.0.0.1:8787")
  if (!origin) return null

  let res: Response
  try {
    res = await fetch(`${origin}/_maskera/guard`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-maskera-action": "guard",
      },
      body: JSON.stringify({
        raw: rawInput,
        mode: options.mode,
        profile: options.profile,
        customTerms: options.customTerms,
        preserveJsonStructure: options.preserveJsonStructure,
        includeRedacted: options.includeRedacted,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 4_000),
    })
  } catch {
    // Proxy not listening (ECONNREFUSED) or timed out; fall back to local engine.
    return null
  }

  if (res.status === 404 || res.status === 405) {
    // Older proxy or another local service on that port; fall back to local engine.
    return null
  }

  if (!res.ok) {
    let message = `Warm proxy guard returned HTTP ${res.status}`
    try {
      const errBody = (await res.json()) as { error?: { message?: string } | string }
      if (typeof errBody.error === "string") message = errBody.error
      else if (errBody.error?.message) message = errBody.error.message
    } catch {
      // Keep status message
    }
    throw new Error(message)
  }

  const data = (await res.json()) as Partial<GuardResult>
  if (
    typeof data.blocked !== "boolean" ||
    typeof data.totalRedactions !== "number" ||
    !data.counts ||
    typeof data.counts !== "object"
  ) {
    return null
  }
  return {
    blocked: data.blocked,
    totalRedactions: data.totalRedactions,
    counts: data.counts,
    redacted: typeof data.redacted === "string" ? data.redacted : "",
    modeUsed: data.modeUsed === "rules" ? "rules" : "hybrid",
  }
}
