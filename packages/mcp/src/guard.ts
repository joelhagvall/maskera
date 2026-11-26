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
