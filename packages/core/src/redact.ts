import { defaultDetectors } from "./detectors"
import type { Detection, PiiLabel, RedactOptions, RedactResult, Redaction } from "./types"

function defaultPlaceholder(label: PiiLabel, index: number): string {
  return `[${label}_${index}]`
}

/**
 * Resolve overlapping detections deterministically:
 * keep the earliest start, and among equal starts the longest match.
 * This means e.g. a full IBAN wins over a postnummer hiding inside it.
 */
function resolveOverlaps(detections: Detection[]): Detection[] {
  const sorted = [...detections].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    if (b.end - b.start !== a.end - a.start) return b.end - b.start - (a.end - a.start)
    return a.label.localeCompare(b.label)
  })
  const kept: Detection[] = []
  let cursor = -1
  for (const d of sorted) {
    if (d.start >= cursor) {
      kept.push(d)
      cursor = d.end
    }
  }
  return kept
}

/**
 * Detect and replace PII in `input`, returning the redacted text plus a
 * restore map. Placeholders are *stable*: the same value always maps to the
 * same token within one call, so an LLM can reason about `[PERSON_1]`
 * consistently and you can map results back afterwards.
 */
export function redact(input: string, options: RedactOptions = {}): RedactResult {
  const detectors = options.detectors ?? defaultDetectors

  const all: Detection[] = []
  for (const detector of detectors) {
    for (const m of detector.detect(input)) {
      all.push({ ...m, label: detector.label })
    }
  }

  return redactFromDetections(input, all, options)
}

/**
 * Lower-level entry point: turn a pre-computed list of detections into a
 * {@link RedactResult}. Use this when detections come from somewhere async or
 * external (e.g. an NER model in `maskera`) and you want the same stable
 * placeholder + overlap-resolution behaviour as {@link redact}.
 */
export function redactFromDetections(
  input: string,
  detections: Detection[],
  options: Pick<RedactOptions, "placeholder"> = {},
): RedactResult {
  const placeholder = options.placeholder ?? defaultPlaceholder

  const resolved = resolveOverlaps(detections)

  // Stable numbering: same value under the same label reuses its placeholder.
  const counters = new Map<PiiLabel, number>()
  const tokenByKey = new Map<string, string>()
  const map: Record<string, string> = {}
  const redactions: Redaction[] = []

  for (const d of resolved) {
    const key = `${d.label}::${d.value}`
    let token = tokenByKey.get(key)
    if (!token) {
      // Never hand out a token that already occurs literally in the input
      // (a crafted "[NAMN_1]" in the input would collide with a generated
      // placeholder, and restore() would write the real value into positions
      // the author of the input chose), and never a token another value
      // already owns (a custom placeholder() that ignores the index would
      // otherwise silently map two values to one token and corrupt restore).
      let next = counters.get(d.label) ?? 0
      let attempts = 0
      do {
        next += 1
        token = placeholder(d.label, next)
        attempts += 1
      } while (attempts < 100 && (input.includes(token) || token in map))
      if (input.includes(token) || token in map) {
        throw new Error(
          "maskera: placeholder() must return a token that is unique per (label, index) " +
            "and does not occur in the input",
        )
      }
      counters.set(d.label, next)
      tokenByKey.set(key, token)
      map[token] = d.value
    }
    redactions.push({ ...d, replacement: token })
  }

  // Rebuild the string left-to-right.
  let text = ""
  let last = 0
  for (const r of redactions) {
    text += input.slice(last, r.start)
    text += r.replacement
    last = r.end
  }
  text += input.slice(last)

  return {
    text,
    redactions,
    map,
    restore: (s: string) => restore(s, map),
  }
}

/**
 * Re-insert original values into a string that contains placeholder tokens.
 * Safe to call on LLM output that echoes the placeholders back.
 */
export function restore(text: string, map: Record<string, string>): string {
  let out = text
  // Replace longer tokens first to avoid `[X_1]` clobbering `[X_10]`.
  const tokens = Object.keys(map).sort((a, b) => b.length - a.length)
  for (const token of tokens) {
    out = out.split(token).join(map[token] as string)
  }
  return out
}
