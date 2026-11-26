import {
  clinicalPrecisionFilter,
  createNerRecognizer,
  type Detection,
  type Detector,
  hybridDefaultDetectors,
  MASKERA_SV_NER_MODEL,
  MASKERA_SV_NER_REVISION,
  type NerOptions,
  type NerRecognizer,
  type RedactionProfile,
  type RedactResult,
  redact,
  redactFromDetections,
  redactWithNer,
  runDetectors,
} from "maskera"

export type MaskMode = "auto" | "rules"

export interface EngineOptions {
  /** Default mode when a tool call omits `mode`. Default: `"auto"` (hybrid NER + rules). */
  defaultMode?: MaskMode
  /** Optional custom NerRecognizer (used in tests or custom deployments). */
  recognizer?: NerRecognizer
  /** Forwarded to `createNerRecognizer` when no custom recognizer is passed. */
  nerOptions?: NerOptions
}

export interface RedactInputOptions {
  mode?: MaskMode
  profile?: RedactionProfile
  customTerms?: readonly string[]
}

export interface MaskeraEngine {
  redact(
    text: string,
    options?: RedactInputOptions,
  ): Promise<{
    result: RedactResult
    modeUsed: "hybrid" | "rules"
    fallbackReason?: string
  }>
  status(): {
    defaultMode: MaskMode
    model: string
    revision: string
    nerLoaded: boolean
    nerError: string | null
  }
}

const WORD_CHAR = /[\p{L}\p{N}_]/u

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Builds a deterministic, case-insensitive, longest-first detector for caller-
 * supplied custom protected terms (client names, case IDs, codenames).
 */
export function buildCustomTermsDetector(rawTerms: readonly string[]): Detector | null {
  const unique = new Map<string, string>()
  for (const raw of rawTerms) {
    if (typeof raw !== "string") continue
    const trimmed = raw.trim()
    if (trimmed.length < 2 || trimmed.length > 160) continue
    const folded = trimmed.toLowerCase()
    if (!unique.has(folded)) unique.set(folded, trimmed)
    if (unique.size >= 200) break
  }
  if (unique.size === 0) return null

  const sorted = [...unique.values()].sort((a, b) => b.length - a.length)
  const pattern = new RegExp(sorted.map(escapeRegExp).join("|"), "giu")

  return {
    label: "EGENT",
    detect(text: string): Omit<Detection, "label">[] {
      const out: Omit<Detection, "label">[] = []
      pattern.lastIndex = 0
      for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
        const start = m.index
        const value = m[0]
        const end = start + value.length
        const before = start > 0 ? (text[start - 1] ?? "") : ""
        const after = end < text.length ? (text[end] ?? "") : ""
        if (
          (WORD_CHAR.test(value[0] ?? "") && WORD_CHAR.test(before)) ||
          (WORD_CHAR.test(value[value.length - 1] ?? "") && WORD_CHAR.test(after))
        ) {
          continue
        }
        out.push({ start, end, value })
      }
      return out
    },
  }
}

export function createMaskeraEngine(options: EngineOptions = {}): MaskeraEngine {
  const defaultMode: MaskMode = options.defaultMode ?? "auto"
  const model = options.nerOptions?.model ?? MASKERA_SV_NER_MODEL
  const revision =
    options.nerOptions?.revision ??
    (model === MASKERA_SV_NER_MODEL ? MASKERA_SV_NER_REVISION : undefined)

  let recognizer: NerRecognizer | null = options.recognizer ?? null
  let nerLoaded = false
  let nerError: string | null = null

  function getRecognizer(): NerRecognizer {
    if (!recognizer) {
      recognizer = createNerRecognizer({
        ...options.nerOptions,
        model,
        revision,
      })
    }
    return recognizer
  }

  return {
    async redact(text: string, req: RedactInputOptions = {}) {
      const requestedMode = req.mode ?? defaultMode
      const customDetector = req.customTerms ? buildCustomTermsDetector(req.customTerms) : null
      const detectors = customDetector
        ? [...hybridDefaultDetectors, customDetector]
        : hybridDefaultDetectors

      if (requestedMode === "rules") {
        const result =
          req.profile === "clinical"
            ? redactFromDetections(
                text,
                runDetectors(text, detectors).filter((d) =>
                  clinicalPrecisionFilter(d, text, "rule"),
                ),
              )
            : redact(text, { detectors })
        return {
          result,
          modeUsed: "rules",
        }
      }

      try {
        const ner = getRecognizer()
        const result = await redactWithNer(text, {
          recognizer: ner,
          detectors,
          profile: req.profile,
        })
        nerLoaded = true
        nerError = null
        return { result, modeUsed: "hybrid" }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        nerError = message
        // Fail loudly in auto mode rather than silently dropping free-text
        // names when the caller asked for full hybrid NER protection.
        throw new Error(
          `Hybrid NER failed to run (${message}). Pass mode="rules" explicitly if you only want deterministic structured redaction.`,
        )
      }
    },

    status() {
      return {
        defaultMode,
        model,
        revision: revision ?? "local",
        nerLoaded,
        nerError,
      }
    },
  }
}
