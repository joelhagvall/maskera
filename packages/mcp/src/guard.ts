import type { RedactionProfile } from "maskera"
import type { MaskeraEngine, MaskMode } from "./engine"

export interface GuardResult {
  blocked: boolean
  totalRedactions: number
  counts: Record<string, number>
  redacted: string
  modeUsed: "hybrid" | "rules"
}

/**
 * Extracts text from either a plain string or a JSON hook envelope (such as
 * Claude Code / Cursor `UserPromptSubmit` or `PreToolUse` stdin JSON) so the
 * same guard command works across any agent harness or shell pipeline.
 */
export function extractGuardText(rawInput: string): { text: string; isHookEnvelope: boolean } {
  const trimmed = rawInput.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>
      if (typeof parsed.prompt === "string") {
        return { text: parsed.prompt, isHookEnvelope: true }
      }
      if (typeof parsed.user_prompt === "string") {
        return { text: parsed.user_prompt, isHookEnvelope: true }
      }
      if (parsed.tool_input && typeof parsed.tool_input === "object") {
        const parts: string[] = []
        const walk = (v: unknown) => {
          if (typeof v === "string") parts.push(v)
          else if (Array.isArray(v)) v.forEach(walk)
          else if (v && typeof v === "object") Object.values(v).forEach(walk)
        }
        walk(parsed.tool_input)
        return { text: parts.join("\n"), isHookEnvelope: true }
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
  } = {},
): Promise<GuardResult> {
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
