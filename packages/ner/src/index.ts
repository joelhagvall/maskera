import type { Detection, PiiLabel, RedactOptions, RedactResult } from "@maskera/core"
import { defaultDetectors, redactFromDetections } from "@maskera/core"

// Re-export the whole rule layer so one install + one import is enough:
// installing maskera pulls in @maskera/core automatically, and
// everything (redact, restore, detectors, validators) is importable from here.
export * from "@maskera/core"

/**
 * Canonical Hugging Face id for maskera's own Swedish PII model: a 43 MB
 * (q4) distilled KB-BERT for PER / LOC / ORG / ADR, trained on synthetic +
 * real Swedish with casing augmentation. MIT weights, no attribution needed.
 * Change the owner to your own HF username if you host your own copy.
 */
export const MASKERA_SV_NER_MODEL = "joelhagvall/maskera-sv-ner"

/**
 * The default model is maskera's own Swedish model. Pass any other
 * Transformers.js token-classification model id via `options.model` if you
 * need different language coverage.
 */
export const DEFAULT_NER_MODEL = MASKERA_SV_NER_MODEL

/**
 * Map a model entity group (e.g. "PER", "LOC") to a maskera label.
 * Return `null` to drop the entity. The default maps maskera-sv-ner's scheme
 * to readable labels and upper-cases anything else, so third-party models
 * work out of the box too.
 */
export type LabelMap = (entityGroup: string) => PiiLabel | null

const DEFAULT_LABEL_MAP: Record<string, PiiLabel> = {
  // maskera-sv-ner's scheme: PER / LOC / ORG / ADR. Mapped to the same
  // Swedish labels the rule detectors use, so hybrid redaction produces one
  // consistent placeholder vocabulary ([NAMN_1], never [PERSON_1]).
  PER: "NAMN",
  LOC: "PLATS",
  ORG: "ORGANISATION",
  ADR: "ADRESS",
}

const defaultLabelMap: LabelMap = (group) => {
  const key = group
    .replace(/^[BI]-/, "")
    .replace(/[\s_]/g, "")
    .toUpperCase()
  return DEFAULT_LABEL_MAP[key] ?? key
}

/**
 * Common Swedish words the model can tag as PII when they sit in a name-like
 * position ("Kund Maria ...", "Mail: ...", "betalning till bankgiro ...").
 * These are role words, contact-channel words and payment-rail words that are
 * never a name, place or organisation on their own, so a detection whose
 * WHOLE surface form (case-insensitively) is one of them is dropped.
 * Multi-word detections ("Anna Ring", "Byggfirman AB") are never affected.
 */
export const DEFAULT_DENYLIST: ReadonlySet<string> = new Set([
  // role words that precede a name
  "kund",
  "kunden",
  "patient",
  "patienten",
  "klient",
  "klienten",
  "kandidat",
  "kandidaten",
  "sökande",
  "sökanden",
  "anhörig",
  "anhöriga",
  "sambo",
  "sambon",
  "make",
  "maken",
  "maka",
  "makan",
  "referens",
  "referensen",
  "motpart",
  "motparten",
  "handläggare",
  "handläggaren",
  // contact channels
  "mail",
  "mailen",
  "maila",
  "mailar",
  "mailade",
  "mejl",
  "mejlen",
  "mejla",
  "mejlar",
  "mejlade",
  "epost",
  "e-post",
  "tel",
  "telefon",
  "telefonnummer",
  "mobil",
  "mobilnummer",
  // payment rails (the numbers themselves are the rule layer's job)
  "bankgiro",
  "bankgirot",
  "plusgiro",
  "plusgirot",
  "postgiro",
  "iban",
  "swish",
  "konto",
  "kontot",
  "kontonummer",
  "betalkonto",
  "kortnummer",
  "personnummer",
  "organisationsnummer",
  // greetings and sign-offs: chat text starts with these in name position
  // ("tjena, det är ..."), and the model can tag them as PER
  "hej",
  "hejhej",
  "hejsan",
  "tjena",
  "tjenare",
  "halloj",
  "goddag",
  "mvh",
  "hälsningar",
  // time words and transport/tech nouns the model tags as PER/ORG in
  // name-like slots ("Ring Anna imorgon", "buss 070", "från IP 85.x")
  "imorgon",
  "idag",
  "igår",
  "imorse",
  "inatt",
  "buss",
  "bussen",
  "tåg",
  "tåget",
  "ip",
])

export interface NerOptions {
  /** Hugging Face model id. Default: {@link DEFAULT_NER_MODEL}. */
  model?: string
  /** Quantization dtype passed to Transformers.js. Default: `"q4"`. */
  dtype?: string
  /** Backend. Default: `"auto"` (WebGPU if available, else WASM). */
  device?: "wasm" | "webgpu" | "cpu" | "auto"
  /** Drop predictions below this confidence. Default: `0.5`. */
  minScore?: number
  /**
   * Words that are dropped when a detection consists of exactly that word
   * (case-insensitive). Default: {@link DEFAULT_DENYLIST}. Pass your own list
   * to extend/replace it, or `null` to disable the filter entirely.
   */
  denylist?: Iterable<string> | null
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
    denylist = DEFAULT_DENYLIST,
    onProgress,
    localModelPath,
    allowRemoteModels,
    allowLocalModels,
  } = options

  const denySet = denylist === null ? null : new Set(Array.from(denylist, (w) => w.toLowerCase()))

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
            `maskera: failed to load "${model}". Is the optional peer ` +
              `dependency "@huggingface/transformers" installed?\n${String(err)}`,
          )
        })
    }
    return pipePromise
  }

  // BERT's positional embeddings stop at 512 tokens; longer inputs make the
  // ONNX runtime throw, which would fail the whole redaction (and a fallback
  // to rules-only would silently leak every free-text name). Inputs that do
  // not fit are split at whitespace with an overlap wide enough that an
  // entity cut by one seam appears whole in the neighbouring chunk.
  const MAX_TOKENS = 480

  const runChunk = async (
    pipe: import("@huggingface/transformers").TokenClassificationPipeline,
    chunk: string,
    offset: number,
    out: Detection[],
  ): Promise<void> => {
    const tokenizer = (pipe as unknown as { tokenizer?: { encode?: (s: string) => number[] } })
      .tokenizer
    const fits =
      !tokenizer?.encode || chunk.length === 0 || tokenizer.encode(chunk).length <= MAX_TOKENS
    if (fits) {
      const raw = await pipe(chunk, { aggregation_strategy: "none" })
      for (const d of reconstruct(chunk, raw, labelMap, minScore)) {
        out.push({ ...d, start: d.start + offset, end: d.end + offset })
      }
      return
    }
    // Split near the middle, preferring whitespace; overlap is proportional
    // so both halves are strictly smaller and the recursion terminates.
    let mid = Math.floor(chunk.length / 2)
    for (let i = mid; i > mid - 200 && i > 1; i--) {
      if (WHITESPACE.test(chunk[i] ?? "")) {
        mid = i
        break
      }
    }
    const overlap = Math.min(100, Math.floor(chunk.length / 8))
    await runChunk(pipe, chunk.slice(0, mid + overlap), offset, out)
    const rightStart = Math.max(0, mid - overlap)
    await runChunk(pipe, chunk.slice(rightStart), offset + rightStart, out)
  }

  return {
    ready: load().then(() => undefined),
    async detect(text: string): Promise<Detection[]> {
      const pipe = await load()
      const collected: Detection[] = []
      await runChunk(pipe, text, 0, collected)
      // Seam dedupe: the same entity can be found by both neighbouring
      // chunks (or partially by one of them); keep the longest span.
      collected.sort((a, b) => a.start - b.start || b.end - a.end)
      const merged: Detection[] = []
      for (const d of collected) {
        const prev = merged[merged.length - 1]
        if (prev && d.start < prev.end) {
          if (d.end - d.start > prev.end - prev.start) merged[merged.length - 1] = d
          continue
        }
        merged.push(d)
      }
      // A single-character span is never meaningful PII on its own (the model
      // tags "Q" in "Q3" as ORG); masking it just mangles the word around it.
      const detections = merged.filter((d) => d.value.length > 1)
      if (!denySet) return detections
      return detections.filter((d) => !denySet.has(d.value.toLowerCase()))
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
/**
 * Lowercase for position-stable matching. A character whose lowercase form
 * has a different LENGTH (e.g. Turkish "İ" becomes "i" + combining dot) is
 * kept as-is: otherwise every index computed on the lowered string drifts
 * against the original and entities after it are silently dropped (leaked).
 */
const safeLower = (s: string): string => {
  let out = ""
  for (const ch of s) {
    const lc = ch.toLowerCase()
    out += lc.length === ch.length ? lc : ch
  }
  return out
}

export function reconstruct(
  text: string,
  tokens: RawToken[],
  labelMap: LabelMap,
  minScore: number,
): Detection[] {
  const lower = safeLower(text)
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
    // never sit on a word boundary and would be rejected wholesale). Keep a
    // trailing house number for ADR when the group already starts with a
    // street-name token: the model reliably emits `I-ADR 44`, and discarding
    // it here used to turn "Sveavägen 44" into the partial span "Sveavägen".
    // Numeric-only predictions still fail the LETTER check below, and digits
    // remain forbidden at the leading edge, so this does not revive the bare-
    // number false positives the precision guard was added to suppress.
    while (group.length > 0) {
      const tail = pieceOf(group[group.length - 1] as RawToken)
      const keepHouseNumber =
        base === "ADR" &&
        DIGIT.test(tail) &&
        group.slice(0, -1).some((part) => LETTER.test(pieceOf(part)))
      if (LETTER.test(tail) || keepHouseNumber) break
      group.pop()
    }
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
        let end = span.end
        // Swedish genitive: the (vocab-trimmed) model can stop right before
        // the possessive s ("Anna Karlsson" inside "Anna Karlssons"), and the
        // whole-word guard would then reject the span and leak the full name.
        // If exactly one s remains to the word boundary, take it. Anything
        // longer is a genuinely different word and still gets rejected.
        if ((text[end] === "s" || text[end] === "S") && !LETTER.test(text[end + 1] ?? "")) end++
        // Swedish apartment/entrance suffixes are commonly written as a
        // detached A-D after the house number ("Sturegatan 46 C"). q4 can
        // confidently tag the street + number but leave that final letter O.
        // Restrict the extension to A-D and require a non-word boundary after
        // it, so ordinary following words such as "i Stockholm" are untouched.
        if (base === "ADR" && DIGIT.test(text[end - 1] ?? "")) {
          const suffix = text.slice(end).match(/^(\s+[A-Da-d])(?=$|[^\p{L}\p{N}])/u)
          const suffixText = suffix?.[1]
          if (suffixText) end += suffixText.length
        }
        const soloFragment = group.length === 1 && (group[0]?.word.startsWith("##") ?? false)
        if (!soloFragment && isWholeWord(text, start, end)) {
          const label = labelMap(base)
          if (label) {
            out.push({ start, end, value: text.slice(start, end), label })
            cursor = end
          }
        }
      }
    }
    i = j
  }
  // q4 can split a multiword address into adjacent same-label groups
  // ("Renstiernas" + "gata 22"). Joining only ADDRESS spans separated by
  // whitespace is safe and restores the full redaction boundary.
  const addressLabel = labelMap("ADR")
  if (!addressLabel) return out
  const merged: Detection[] = []
  for (const detection of out) {
    const previous = merged[merged.length - 1]
    const whitespaceSeparated =
      previous !== undefined && /^\s+$/u.test(text.slice(previous.end, detection.start))
    const continuesStreetAddress =
      detection.label === addressLabel && STREET_ADDRESS_TAIL.test(detection.value)
    if (
      whitespaceSeparated &&
      ((previous.label === addressLabel && detection.label === addressLabel) ||
        continuesStreetAddress)
    ) {
      previous.end = detection.end
      previous.value = text.slice(previous.start, previous.end)
      // A q4 boundary error can label the street-name prefix as another
      // entity ("Renstiernas" ORG + "gata 22" ADR). A numbered street-type
      // tail is strong address evidence, so make the combined span ADDRESS.
      if (continuesStreetAddress) previous.label = addressLabel
    } else {
      merged.push(detection)
    }
  }
  return merged
}

const LETTER = /\p{L}/u
const DIGIT = /\p{N}/u
const WHITESPACE = /\s/
const STREET_ADDRESS_TAIL =
  /^(?:gata(?:n)?|väg(?:en)?|gränd(?:en)?|allé(?:n)?|torg(?:et)?|plan)\s+\p{N}/iu

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
  const first = safeLower(pieceOf(head))
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
      const piece = safeLower(pieceOf(tok))
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

  // Rules are authoritative on THEIR spans, but a model span that merely
  // touches a rule span must not be dropped wholesale: the model sometimes
  // glues a name to the e-mail local-part that follows it, and dropping the
  // whole span would leak the name. Clip away the rule intervals and keep
  // whatever meaningful segments remain.
  const WORD_CHAR = /[\p{L}\p{N}]/u
  const keptModel: Detection[] = []
  for (const d of modelDetections) {
    let segments: Array<[number, number]> = [[d.start, d.end]]
    for (const r of ruleDetections) {
      const next: Array<[number, number]> = []
      for (const [s, e] of segments) {
        if (r.end <= s || r.start >= e) {
          next.push([s, e])
          continue
        }
        if (r.start > s) next.push([s, r.start])
        if (r.end < e) next.push([r.end, e])
      }
      segments = next
    }
    for (let [s, e] of segments) {
      while (s < e && !WORD_CHAR.test(input[s] ?? "")) s++
      while (e > s && !WORD_CHAR.test(input[e - 1] ?? "")) e--
      if (e - s <= 1) continue
      const value = input.slice(s, e)
      // A CLIPPED remnant is often the keyword stuck to the structured value
      // the rule just took ("IBAN" in "IBAN SE45..."): junk, not PII. The
      // denylist models exactly those words, so clipped remnants (and only
      // those; untouched spans already passed the recognizer's own filter)
      // are checked against it.
      const wasClipped = s !== d.start || e !== d.end
      if (wasClipped && DEFAULT_DENYLIST.has(value.toLowerCase())) continue
      keptModel.push({ start: s, end: e, value, label: d.label })
    }
  }

  return redactFromDetections(input, [...ruleDetections, ...keptModel], {
    placeholder: options.placeholder,
  })
}
