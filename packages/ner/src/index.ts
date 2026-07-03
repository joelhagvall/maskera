import type { Detection, PiiLabel, RedactOptions, RedactResult } from "@maskera/core"
import { defaultDetectors, redactFromDetections } from "@maskera/core"

/**
 * Canonical Hugging Face id for maskera's own Swedish PII model: a 40 MB
 * (q4) distilled KB-BERT for PER / LOC / ORG / ADR, trained on synthetic +
 * real Swedish with casing augmentation. MIT weights, no attribution needed.
 * Change the owner to your own HF username if you host your own copy.
 */
export const MASKERA_SV_NER_MODEL = "joelhagvall/maskera-sv-ner"

/**
 * The default model is maskera's own Swedish model, this is a Swedish-first
 * SDK. For multilingual Latin-script text, pass {@link RAMPART_MODEL} instead.
 */
export const DEFAULT_NER_MODEL = MASKERA_SV_NER_MODEL

/**
 * Rampart (nationaldesignstudio/rampart): a 14.7 MB 4-bit quantized MiniLM
 * token-classification model for en/es/fr/de/it/pt/nl, CC BY 4.0.
 * Not trained on Swedish and strips diacritics; use it for multilingual text,
 * not Swedish. Attribution required if redistributed, see this package's
 * README/NOTICE.
 */
export const RAMPART_MODEL = "nationaldesignstudio/rampart"

/**
 * Map a model entity group (e.g. "GIVENNAME", "CITY") to a maskera label.
 * Return `null` to drop the entity. The default normalises a handful of
 * common OpenPII groups to coarse labels and upper-cases the rest.
 */
export type LabelMap = (entityGroup: string) => PiiLabel | null

const DEFAULT_LABEL_MAP: Record<string, PiiLabel> = {
  // maskera-sv-ner's own scheme (Swedish model): PER / LOC / ORG / ADR.
  PER: "PERSON",
  LOC: "LOCATION",
  ORG: "ORGANIZATION",
  ADR: "ADDRESS",
  // OpenPII / Rampart scheme.
  GIVENNAME: "PERSON",
  SURNAME: "PERSON",
  FIRSTNAME: "PERSON",
  LASTNAME: "PERSON",
  MIDDLENAME: "PERSON",
  NAME: "PERSON",
  CITY: "LOCATION",
  STATE: "LOCATION",
  COUNTRY: "LOCATION",
  STREET: "ADDRESS",
  STREETNAME: "ADDRESS",
  STREETADDRESS: "ADDRESS",
  BUILDINGNUMBER: "ADDRESS",
  SECONDARYADDRESS: "ADDRESS",
  ZIPCODE: "POSTNUMMER",
  ORGANIZATION: "ORGANIZATION",
  COMPANYNAME: "ORGANIZATION",
}

const defaultLabelMap: LabelMap = (group) => {
  const key = group
    .replace(/^[BI]-/, "")
    .replace(/[\s_]/g, "")
    .toUpperCase()
  return DEFAULT_LABEL_MAP[key] ?? key
}

export interface NerOptions {
  /** Hugging Face model id. Default: {@link DEFAULT_NER_MODEL}. */
  model?: string
  /** Quantization dtype passed to Transformers.js. Default: `"q4"`. */
  dtype?: string
  /** Backend. Default: `"auto"` (WebGPU if available, else WASM). */
  device?: "wasm" | "webgpu" | "cpu" | "auto"
  /** Drop predictions below this confidence. Default: `0.5`. */
  minScore?: number
  /** Map model entity groups to maskera labels. Default: {@link defaultLabelMap}. */
  labelMap?: LabelMap
  /** Progress callback while the model downloads. */
  onProgress?: (progress: unknown) => void
  /**
   * Transformers.js `env.localModelPath` — base URL/path for locally hosted
   * models. Set this (plus `model`) to load your own model instead of the Hub.
   */
  localModelPath?: string
  /** Transformers.js `env.allowRemoteModels` (default left untouched). */
  allowRemoteModels?: boolean
  /** Transformers.js `env.allowLocalModels` (default left untouched). */
  allowLocalModels?: boolean
}

export interface NerRecognizer {
  /** Resolves once the model is loaded and ready. */
  ready: Promise<void>
  /** Run the model and return maskera-compatible detections. */
  detect(text: string): Promise<Detection[]>
}

/**
 * Create an NER recognizer backed by a Transformers.js token-classification
 * model. The model is loaded lazily on first use (or awaited via `ready`).
 *
 * Requires the optional peer dependency `@huggingface/transformers`.
 */
export function createNerRecognizer(options: NerOptions = {}): NerRecognizer {
  const {
    model = DEFAULT_NER_MODEL,
    dtype = "q4",
    device = "auto",
    minScore = 0.5,
    labelMap = defaultLabelMap,
    onProgress,
    localModelPath,
    allowRemoteModels,
    allowLocalModels,
  } = options

  let pipePromise: Promise<import("@huggingface/transformers").TokenClassificationPipeline> | null =
    null

  const load = () => {
    if (!pipePromise) {
      pipePromise = import("@huggingface/transformers")
        .then((t) => {
          // Configure env on the exact module instance we use, so a custom
          // model path applies regardless of how the host bundles things.
          if (localModelPath !== undefined) t.env.localModelPath = localModelPath
          if (allowRemoteModels !== undefined) t.env.allowRemoteModels = allowRemoteModels
          if (allowLocalModels !== undefined) t.env.allowLocalModels = allowLocalModels
          return t.pipeline("token-classification", model, {
            dtype,
            device,
            progress_callback: onProgress,
          })
        })
        .catch((err) => {
          pipePromise = null
          throw new Error(
            `@maskera/ner: failed to load "${model}". Is the optional peer ` +
              `dependency "@huggingface/transformers" installed?\n${String(err)}`,
          )
        })
    }
    return pipePromise
  }

  return {
    ready: load().then(() => undefined),
    async detect(text: string): Promise<Detection[]> {
      const pipe = await load()
      const raw = await pipe(text, { aggregation_strategy: "none" })
      return reconstruct(text, raw, labelMap, minScore)
    },
  }
}

export interface RawToken {
  entity?: string
  entity_group?: string
  score: number
  index?: number
  word: string
  start?: number | null
  end?: number | null
}

const baseType = (entity: string) => entity.replace(/^[BI]-/, "")

/**
 * The Transformers.js token-classification pipeline for BERT-wordpiece models
 * yields per-subword tokens (`john`, `kung`, `##sho`, …) with BIO tags but,
 * for tokenizers without offset tracking, no character spans. We rebuild
 * entities by merging subword/continuation tokens and locating the surface
 * string back in the original text.
 */
export function reconstruct(
  text: string,
  tokens: RawToken[],
  labelMap: LabelMap,
  minScore: number,
): Detection[] {
  const lower = text.toLowerCase()
  const out: Detection[] = []
  let cursor = 0
  let i = 0

  while (i < tokens.length) {
    const tok = tokens[i]
    if (!tok) {
      i++
      continue
    }
    const tag = tok.entity ?? tok.entity_group ?? ""
    if (!tag || tag === "O") {
      i++
      continue
    }
    const base = baseType(tag)
    const group: RawToken[] = [tok]
    let j = i + 1
    while (j < tokens.length) {
      const next = tokens[j]
      const prev = tokens[j - 1]
      if (!next || !prev) break
      const isSubword = next.word.startsWith("##")
      const nextTag = next.entity ?? next.entity_group ?? ""
      const contiguous = (next.index ?? j) === (prev.index ?? j - 1) + 1
      const continuesEntity = nextTag.startsWith("I-") && baseType(nextTag) === base
      // The model can emit a stray B- mid-entity right after a connector
      // ("Karl" B-PER, "-" I-PER, "Gustav" B-PER): splitting there would leave
      // a dangling "Karl-" that fails the whole-word check and leaks. Bridge
      // same-type B- tags only across a non-letter piece, so two full words
      // ("Sofia" + a false-positive "imorgon") are never glued together.
      const bridgesConnector =
        nextTag.startsWith("B-") && baseType(nextTag) === base && !LETTER.test(pieceOf(prev))
      if (contiguous && (isSubword || continuesEntity || bridgesConnector)) {
        group.push(next)
        j++
      } else {
        break
      }
    }

    // Trim punctuation-only tokens at the edges (a group ending in "-" can
    // never sit on a word boundary and would be rejected wholesale).
    while (group.length > 0 && !LETTER.test(pieceOf(group[group.length - 1] as RawToken)))
      group.pop()
    while (group.length > 0 && !LETTER.test(pieceOf(group[0] as RawToken))) group.shift()
    if (group.length === 0) {
      i = j
      continue
    }

    const avg = group.reduce((s, p) => s + p.score, 0) / group.length
    const joined = group.map(pieceOf).join("")
    if (joined && avg >= minScore && LETTER.test(joined)) {
      const span = locateGroup(text, lower, group, cursor)
      if (span) {
        let start = span.start
        // The model can tag a trailing subword of a word it half-recognises
        // (e.g. "##r" in "dr Svensson"). Widen to the word boundary so the
        // whole word is redacted instead of leaked; lone fragments inside a
        // longer word are still rejected by isWholeWord below.
        while (start > 0 && LETTER.test(text[start - 1] ?? "")) start--
        const soloFragment = group.length === 1 && (group[0]?.word.startsWith("##") ?? false)
        if (!soloFragment && isWholeWord(text, start, span.end)) {
          const label = labelMap(base)
          if (label) {
            out.push({ start, end: span.end, value: text.slice(start, span.end), label })
            cursor = span.end
          }
        }
      }
    }
    i = j
  }
  return out
}

const LETTER = /\p{L}/u
const WHITESPACE = /\s/

/** The surface text a token contributes, without the subword marker. */
const pieceOf = (t: RawToken) => (t.word.startsWith("##") ? t.word.slice(2) : t.word)

/**
 * Locate a token group's span in the original text, starting at `cursor`.
 * The tokenizer discards whitespace, so "Karl-Gustav" comes back as the
 * pieces `Karl`, `-`, `Gustav`, so we match piece by piece, allowing optional
 * whitespace before each new word (but none before a `##` continuation),
 * instead of guessing a single joined surface string.
 */
function locateGroup(
  text: string,
  lower: string,
  group: RawToken[],
  cursor: number,
): { start: number; end: number } | null {
  const head = group[0]
  if (!head) return null
  const first = pieceOf(head).toLowerCase()
  if (!first) return null

  let start = lower.indexOf(first, cursor)
  while (start >= 0) {
    let pos = start + first.length
    let ok = true
    for (let k = 1; k < group.length; k++) {
      const tok = group[k]
      if (!tok) {
        ok = false
        break
      }
      if (!tok.word.startsWith("##")) {
        while (pos < text.length && WHITESPACE.test(text[pos] ?? "")) pos++
      }
      const piece = pieceOf(tok).toLowerCase()
      if (piece && lower.startsWith(piece, pos)) {
        pos += piece.length
      } else {
        ok = false
        break
      }
    }
    if (ok) return { start, end: pos }
    start = lower.indexOf(first, start + 1)
  }
  return null
}

/**
 * The model emits subword pieces, so a fragment can land in the middle of an
 * ordinary word (e.g. "par" inside "Motpart") or be pure digits ("14:20"). We
 * only keep spans that sit on word boundaries — the char on each side must not
 * be a letter — which drops both classes of false positive. Numbers are the
 * rule layer's job anyway.
 */
export function isWholeWord(text: string, start: number, end: number): boolean {
  const before = text[start - 1] ?? ""
  const after = text[end] ?? ""
  return !LETTER.test(before) && !LETTER.test(after)
}

export interface RedactWithNerOptions extends Pick<RedactOptions, "placeholder"> {
  recognizer: NerRecognizer
  /** Rule-based detectors to combine with the model. Default: all built-ins. */
  detectors?: RedactOptions["detectors"]
}

/**
 * Hybrid redaction: run the deterministic rule detectors AND the NER model,
 * then merge everything through core's stable-placeholder / overlap engine.
 *
 * **Rules win on overlap.** Structured PII (IBAN, card, phone, personnummer…) is
 * deterministic and authoritative; the model can misread digit groups as
 * addresses, so any model detection overlapping a rule detection is dropped.
 * The model only fills the gaps the rules leave (free-text names/places).
 */
export async function redactWithNer(
  input: string,
  options: RedactWithNerOptions,
): Promise<RedactResult> {
  const detectors = options.detectors ?? defaultDetectors

  const ruleDetections: Detection[] = []
  for (const detector of detectors) {
    for (const m of detector.detect(input)) {
      ruleDetections.push({ ...m, label: detector.label })
    }
  }

  const modelDetections = await options.recognizer.detect(input)
  const overlapsRule = (d: Detection) =>
    ruleDetections.some((r) => d.start < r.end && r.start < d.end)
  const keptModel = modelDetections.filter((d) => !overlapsRule(d))

  return redactFromDetections(input, [...ruleDetections, ...keptModel], {
    placeholder: options.placeholder,
  })
}
