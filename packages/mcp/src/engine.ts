import { createHash } from "node:crypto"
import {
  canonicalize,
  clinicalPrecisionFilter,
  createNerRecognizer,
  type Detection,
  type Detector,
  hybridDefaultDetectors,
  MASKERA_SV_NER_MODEL,
  MASKERA_SV_NER_REVISION,
  type NerOptions,
  type NerRecognizer,
  type PiiLabel,
  type RedactionProfile,
  type RedactResult,
  redact,
  redactFromDetections,
  redactWithNer,
  runDetectors,
} from "maskera"

export type MaskMode = "auto" | "rules"

export interface ModelLoadEvent {
  phase: "loading" | "ready" | "error"
  model: string
  /** The quantization being loaded (`"q8"` on Node by default, `"q4"` for a local model path). */
  dtype?: string
  elapsedMs?: number
  error?: string
}

export interface EngineOptions {
  /** Default mode when a tool call omits `mode`. Default: `"auto"` (hybrid NER + rules). */
  defaultMode?: MaskMode
  /** Optional custom NerRecognizer (used in tests or custom deployments). */
  recognizer?: NerRecognizer
  /** Forwarded to `createNerRecognizer` when no custom recognizer is passed. */
  nerOptions?: NerOptions
  /** Optional lifecycle hook fired when the local ONNX model starts/finishes loading. */
  onModelStatus?: (event: ModelLoadEvent) => void
  /**
   * Max entries in the in-memory span cache (stores only SHA-256 digest keys
   * and `{ start, end, label }` offsets, never raw PII text). Default: `512`.
   * Set to `0` to disable caching.
   */
  maxCacheEntries?: number
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
  /**
   * Starts loading the local ONNX NER model in the background when defaultMode
   * is `"auto"`. Safe to call on server startup: rejections are captured in
   * `status().nerError` and never cause unhandled promise rejections.
   */
  warmup(): void
  /** Clears the in-memory span cache. */
  clearCache(): void
  status(): {
    defaultMode: MaskMode
    model: string
    revision: string
    nerLoaded: boolean
    nerError: string | null
    cacheSize: number
    cacheHits: number
    cacheMisses: number
  }
}

const WORD_CHAR = /[\p{L}\p{N}_]/u
const DEFAULT_MAX_CACHE_ENTRIES = 512
const MAX_CUSTOM_DETECTOR_CACHE = 64

/**
 * 1-to-1 Cyrillic confusable characters that look visually identical to Latin
 * letters. Replacing each with its single Latin counterpart preserves exact
 * UTF-16 string offsets for lossless round-trip restoration.
 */
const CYRILLIC_CONFUSABLES: Readonly<Record<string, string>> = {
  "\u0410": "A",
  "\u0412": "B",
  "\u0421": "C",
  "\u0415": "E",
  "\u041d": "H",
  "\u0406": "I",
  "\u0408": "J",
  "\u041a": "K",
  "\u041c": "M",
  "\u041e": "O",
  "\u0420": "P",
  "\u0405": "S",
  "\u0422": "T",
  "\u0423": "Y",
  "\u0425": "X",
  "\u0430": "a",
  "\u0432": "b",
  "\u0441": "c",
  "\u0435": "e",
  "\u043d": "h",
  "\u0456": "i",
  "\u0458": "j",
  "\u043a": "k",
  "\u043c": "m",
  "\u043e": "o",
  "\u0440": "p",
  "\u0455": "s",
  "\u0442": "t",
  "\u0443": "y",
  "\u0445": "x",
}

const HAS_CYRILLIC_RE = /[\u0400-\u04ff]/
const LATIN_LETTER_RE = /[A-Za-z\u00c0-\u024f]/
const WORD_TOKEN_RE = /\p{L}+/gu
const SWEDISH_HYPHEN_COMPOUND_RE = /\b([A-ZÅÄÖÉ][a-zåäöé]{2,})-([a-zåäöé]{3,})\b/g
const COMPOUND_NER_LABELS = new Set<PiiLabel>(["NAMN", "ORG", "PLATS"])

/**
 * Folds Cyrillic homoglyphs back to their 1-to-1 Latin equivalents inside
 * mixed-script words (e.g. `Ann\u0430`) or all-confusable tokens embedded in
 * majority-Latin text, while leaving genuine Cyrillic prose untouched.
 */
export function normalizeMixedScriptHomoglyphs(text: string): {
  text: string
  changed: boolean
} {
  if (!HAS_CYRILLIC_RE.test(text)) return { text, changed: false }

  let latinCount = 0
  let cyrillicCount = 0
  for (const ch of text) {
    if (LATIN_LETTER_RE.test(ch)) latinCount += 1
    else if (HAS_CYRILLIC_RE.test(ch)) cyrillicCount += 1
  }
  const majorityLatin = latinCount > 0 && latinCount >= cyrillicCount * 2

  let changed = false
  const normalized = text.replace(WORD_TOKEN_RE, (word) => {
    if (!HAS_CYRILLIC_RE.test(word)) return word
    const hasLatin = LATIN_LETTER_RE.test(word)
    if (!hasLatin && !majorityLatin) return word
    // Only fold an all-Cyrillic word if every Cyrillic letter in it is a
    // confusable (so genuine Russian loanwords with non-confusables stay intact).
    if (!hasLatin) {
      for (const ch of word) {
        if (HAS_CYRILLIC_RE.test(ch) && !(ch in CYRILLIC_CONFUSABLES)) return word
      }
    }
    let out = ""
    let wordChanged = false
    for (const ch of word) {
      const mapped = CYRILLIC_CONFUSABLES[ch]
      if (mapped !== undefined) {
        out += mapped
        wordChanged = true
      } else {
        out += ch
      }
    }
    if (wordChanged) changed = true
    return out
  })
  return { text: normalized, changed }
}

/**
 * Detects proper-noun prefixes in Swedish hyphenated compounds such as
 * `Eriksson-ärendet` or `Lindqvist-kontot` when the base pass missed them.
 * Replaces only the candidate `-` with a space (strictly 1-to-1 offset
 * preserving) and keeps only NAMN/ORG/PLATS spans overlapping the prefix.
 */
async function detectHyphenatedCompoundPrefixes(
  text: string,
  ner: NerRecognizer,
  detectors: readonly Detector[],
  profile: RedactionProfile | undefined,
  existing: readonly Detection[],
): Promise<Detection[]> {
  const candidates: Array<{ prefixStart: number; prefixEnd: number; hyphenIndex: number }> = []
  SWEDISH_HYPHEN_COMPOUND_RE.lastIndex = 0
  for (
    let m = SWEDISH_HYPHEN_COMPOUND_RE.exec(text);
    m !== null;
    m = SWEDISH_HYPHEN_COMPOUND_RE.exec(text)
  ) {
    const prefix = m[1]
    if (!prefix) continue
    const prefixStart = m.index
    const prefixEnd = prefixStart + prefix.length
    const alreadyCovered = existing.some((d) => d.start < prefixEnd && d.end > prefixStart)
    if (!alreadyCovered) {
      candidates.push({ prefixStart, prefixEnd, hyphenIndex: prefixEnd })
    }
  }
  if (candidates.length === 0) return []

  const chars = text.split("")
  for (const c of candidates) {
    chars[c.hyphenIndex] = " "
  }
  const probeText = chars.join("")
  const probeRes = await redactWithNer(probeText, {
    recognizer: ner,
    detectors: [...detectors],
    profile,
  })

  const extra: Detection[] = []
  for (const r of probeRes.redactions) {
    if (!COMPOUND_NER_LABELS.has(r.label)) continue
    for (const c of candidates) {
      if (r.start <= c.prefixStart && r.end >= c.prefixEnd && r.end <= c.hyphenIndex) {
        extra.push({
          start: c.prefixStart,
          end: c.prefixEnd,
          label: r.label,
          value: text.slice(c.prefixStart, c.prefixEnd),
        })
        break
      }
    }
  }
  return extra
}

interface CachedSpan {
  readonly start: number
  readonly end: number
  readonly label: PiiLabel
}

interface SpanCacheEntry {
  readonly spans: readonly CachedSpan[]
  readonly modeUsed: "hybrid" | "rules"
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeCustomTerms(rawTerms: readonly string[]): string[] {
  const unique = new Map<string, string>()
  for (const raw of rawTerms) {
    if (typeof raw !== "string") continue
    const trimmed = canonicalize(raw.trim()).text.trim()
    if (trimmed.length < 2 || trimmed.length > 160) continue
    const folded = trimmed.toLowerCase()
    if (!unique.has(folded)) unique.set(folded, trimmed)
    if (unique.size >= 200) break
  }
  return [...unique.values()].sort((a, b) => b.length - a.length)
}

/**
 * Builds a deterministic, case-insensitive, longest-first detector for caller-
 * supplied custom protected terms (client names, case IDs, codenames).
 */
export function buildCustomTermsDetector(rawTerms: readonly string[]): Detector | null {
  const sorted = normalizeCustomTerms(rawTerms)
  if (sorted.length === 0) return null

  // Embed per-term word boundaries inside the alternation so a longer term
  // whose trailing boundary fails (e.g. "Acme Corp" inside "Acme Corporation")
  // backtracks to the shorter valid whole-word term ("Acme").
  const pattern = new RegExp(
    sorted
      .map((term) => {
        const escaped = escapeRegExp(term)
        const startGuard = WORD_CHAR.test(term[0] ?? "") ? "(?<![\\p{L}\\p{N}_])" : ""
        const endGuard = WORD_CHAR.test(term[term.length - 1] ?? "") ? "(?![\\p{L}\\p{N}_])" : ""
        return `${startGuard}${escaped}${endGuard}`
      })
      .join("|"),
    "giu",
  )

  return {
    label: "EGENT",
    detect(text: string): Omit<Detection, "label">[] {
      const out: Omit<Detection, "label">[] = []
      pattern.lastIndex = 0
      for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
        const start = m.index
        const value = m[0]
        if (!value) {
          pattern.lastIndex += 1
          continue
        }
        out.push({ start, end: start + value.length, value })
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
  const maxCacheEntries = Math.max(0, options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES)

  let recognizer: NerRecognizer | null = options.recognizer ?? null
  let nerLoaded = false
  let nerError: string | null = null
  let warmupStarted = false

  // Zero-PII LRU cache: keys are SHA-256 hashes, values are only numeric
  // span offsets and labels. Replays static system prompts, tool schemas, and
  // prior conversation turns in <0.1ms instead of re-running ONNX every turn.
  const spanCache = new Map<string, SpanCacheEntry>()
  const customDetectorCache = new Map<string, Detector | null>()
  let cacheHits = 0
  let cacheMisses = 0

  function getRecognizer(): NerRecognizer {
    if (!recognizer) {
      // On Node CPU, int8 (`q8`, 56 MB) is ~2.5x faster than q4 (4.9 ms vs 12.3 ms
      // per text on Apple Silicon) and ships sha256-pinned on Hugging Face.
      // Preserve q4 default when a caller supplies a custom localModelPath that
      // may only bundle model_q4.onnx unless dtype is specified explicitly.
      const dtype = options.nerOptions?.dtype ?? (options.nerOptions?.localModelPath ? "q4" : "q8")
      const loadStartedAt = Date.now()
      options.onModelStatus?.({ phase: "loading", model, dtype })
      recognizer = createNerRecognizer({
        ...options.nerOptions,
        model,
        revision,
        dtype,
      })
      void recognizer.ready.then(
        () => {
          nerLoaded = true
          nerError = null
          options.onModelStatus?.({
            phase: "ready",
            model,
            elapsedMs: Date.now() - loadStartedAt,
          })
        },
        (err) => {
          const message = err instanceof Error ? err.message : String(err)
          nerError = message
          options.onModelStatus?.({
            phase: "error",
            model,
            elapsedMs: Date.now() - loadStartedAt,
            error: message,
          })
        },
      )
    }
    return recognizer
  }

  function getCustomDetector(rawTerms: readonly string[] | undefined): {
    detector: Detector | null
    termsKey: string
  } {
    if (!rawTerms || rawTerms.length === 0) return { detector: null, termsKey: "" }
    const sorted = normalizeCustomTerms(rawTerms)
    if (sorted.length === 0) return { detector: null, termsKey: "" }
    const termsKey = sorted.map((t) => `${t.length}:${t.toLowerCase()}`).join("|")
    if (customDetectorCache.has(termsKey)) {
      const hit = customDetectorCache.get(termsKey) ?? null
      customDetectorCache.delete(termsKey)
      customDetectorCache.set(termsKey, hit)
      return { detector: hit, termsKey }
    }
    const detector = buildCustomTermsDetector(sorted)
    if (customDetectorCache.size >= MAX_CUSTOM_DETECTOR_CACHE) {
      const oldest = customDetectorCache.keys().next().value
      if (oldest !== undefined) customDetectorCache.delete(oldest)
    }
    customDetectorCache.set(termsKey, detector)
    return { detector, termsKey }
  }

  function makeCacheKey(
    mode: MaskMode,
    profile: RedactionProfile | undefined,
    termsKey: string,
    text: string,
  ): string {
    return createHash("sha256")
      .update(mode)
      .update("\0")
      .update(profile ?? "")
      .update("\0")
      .update(termsKey)
      .update("\0")
      .update(text)
      .digest("base64url")
  }

  return {
    warmup() {
      if (defaultMode !== "auto" || warmupStarted || nerLoaded) return
      warmupStarted = true
      const ner = getRecognizer()
      void ner.ready.then(
        () => {
          nerLoaded = true
          nerError = null
        },
        (err) => {
          warmupStarted = false
          nerError = err instanceof Error ? err.message : String(err)
        },
      )
    },

    clearCache() {
      spanCache.clear()
      cacheHits = 0
      cacheMisses = 0
    },

    async redact(text: string, req: RedactInputOptions = {}) {
      const requestedMode = req.mode ?? defaultMode
      const { detector: customDetector, termsKey } = getCustomDetector(req.customTerms)

      const cacheKey =
        maxCacheEntries > 0 && text.length > 0
          ? makeCacheKey(requestedMode, req.profile, termsKey, text)
          : null

      if (cacheKey) {
        const cached = spanCache.get(cacheKey)
        if (cached) {
          // Refresh LRU order.
          spanCache.delete(cacheKey)
          spanCache.set(cacheKey, cached)
          cacheHits += 1
          const result =
            cached.spans.length === 0
              ? redactFromDetections(text, [])
              : redactFromDetections(
                  text,
                  cached.spans.map((s) => ({
                    start: s.start,
                    end: s.end,
                    label: s.label,
                    value: text.slice(s.start, s.end),
                  })),
                )
          return { result, modeUsed: cached.modeUsed }
        }
        cacheMisses += 1
      }

      const detectors = customDetector
        ? [...hybridDefaultDetectors, customDetector]
        : hybridDefaultDetectors

      if (requestedMode === "rules") {
        const canonical = canonicalize(text)
        const homoglyph = normalizeMixedScriptHomoglyphs(canonical.text)
        let result: RedactResult
        if (canonical.identity && !homoglyph.changed) {
          result =
            req.profile === "clinical"
              ? redactFromDetections(
                  text,
                  runDetectors(text, detectors).filter((d) =>
                    clinicalPrecisionFilter(d, text, "rule"),
                  ),
                )
              : redact(text, { detectors })
        } else {
          const detected = runDetectors(homoglyph.text, detectors)
          const filtered =
            req.profile === "clinical"
              ? detected.filter((d) => clinicalPrecisionFilter(d, homoglyph.text, "rule"))
              : detected
          const mapped: Detection[] = []
          for (const d of filtered) {
            const [start, end] = canonical.span(d.start, d.end)
            if (end > start) {
              mapped.push({ start, end, label: d.label, value: text.slice(start, end) })
            }
          }
          result = redactFromDetections(text, mapped)
        }
        if (cacheKey) {
          if (spanCache.size >= maxCacheEntries) {
            const oldest = spanCache.keys().next().value
            if (oldest !== undefined) spanCache.delete(oldest)
          }
          spanCache.set(cacheKey, {
            spans: result.redactions.map((r) => ({
              start: r.start,
              end: r.end,
              label: r.label,
            })),
            modeUsed: "rules",
          })
        }
        return {
          result,
          modeUsed: "rules",
        }
      }

      try {
        const ner = getRecognizer()
        // Run NER on the canonicalized + mixed-script homoglyph-folded view so
        // invisible characters (ZWSP, soft hyphens, bidi controls), non-NFKC
        // forms, and Cyrillic confusables cannot split wordpieces and bypass
        // Swedish NER, while mapping spans back to exact original UTF-16
        // coordinates for lossless round-trip restoration.
        const canonical = canonicalize(text)
        const homoglyph = normalizeMixedScriptHomoglyphs(canonical.text)
        const isIdentity = canonical.identity && !homoglyph.changed
        const nerInput = isIdentity ? text : homoglyph.text
        const baseRes = await redactWithNer(nerInput, {
          recognizer: ner,
          detectors,
          profile: req.profile,
        })
        const baseDetections: Detection[] = baseRes.redactions.map((r) => ({
          start: r.start,
          end: r.end,
          label: r.label,
          value: nerInput.slice(r.start, r.end),
        }))
        const compoundExtras = await detectHyphenatedCompoundPrefixes(
          nerInput,
          ner,
          detectors,
          req.profile,
          baseDetections,
        )
        const combined =
          compoundExtras.length > 0 ? [...baseDetections, ...compoundExtras] : baseDetections

        const result =
          isIdentity && compoundExtras.length === 0
            ? baseRes
            : redactFromDetections(
                text,
                combined.flatMap((d) => {
                  const [start, end] = canonical.span(d.start, d.end)
                  return end > start
                    ? [{ start, end, label: d.label, value: text.slice(start, end) }]
                    : []
                }),
              )
        nerLoaded = true
        nerError = null
        if (cacheKey) {
          if (spanCache.size >= maxCacheEntries) {
            const oldest = spanCache.keys().next().value
            if (oldest !== undefined) spanCache.delete(oldest)
          }
          spanCache.set(cacheKey, {
            spans: result.redactions.map((r) => ({
              start: r.start,
              end: r.end,
              label: r.label,
            })),
            modeUsed: "hybrid",
          })
        }
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
        cacheSize: spanCache.size,
        cacheHits,
        cacheMisses,
      }
    },
  }
}

/**
 * Returns an `onModelStatus` handler that prints a concise progress line on
 * stderr only when model loading takes longer than `delayMs` (default 350ms),
 * keeping warm/cached runs quiet while reassuring users during the initial
 * ONNX download (size per dtype in MODEL_DOWNLOAD_MB).
 */
/** Hub file sizes of the pinned model per dtype, rounded to MB (q4 is model_q4.onnx, q8 model_quantized.onnx). */
export const MODEL_DOWNLOAD_MB: Readonly<Record<string, number>> = { q4: 43, q8: 59 }

function downloadSize(dtype: string | undefined): string {
  const mb = dtype ? MODEL_DOWNLOAD_MB[dtype] : undefined
  return mb ? `, ~${mb} MB on first run` : ""
}

export function createModelProgressLogger(
  write: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
  delayMs = 350,
): (event: ModelLoadEvent) => void {
  let timer: ReturnType<typeof setTimeout> | null = null
  let announcedLoading = false

  return (event) => {
    if (event.phase === "loading") {
      if (timer) clearTimeout(timer)
      announcedLoading = false
      timer = setTimeout(() => {
        announcedLoading = true
        write(
          `[maskera] Loading Swedish ONNX model (${event.model}${downloadSize(event.dtype)}, cached locally)...`,
        )
      }, delayMs)
      timer.unref?.()
      return
    }
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (event.phase === "ready" && announcedLoading) {
      write(`[maskera] Swedish ONNX model ready (${event.elapsedMs ?? 0}ms).`)
      announcedLoading = false
    } else if (event.phase === "error" && announcedLoading) {
      write(`[maskera] Swedish ONNX model load failed: ${event.error ?? "unknown error"}`)
      announcedLoading = false
    }
  }
}
