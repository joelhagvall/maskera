import type { Detection, PiiLabel, RedactOptions, RedactResult } from "@maskera/core"
import {
  adress,
  contextualDetectors,
  defaultDetectors,
  lagenhetsnummer,
  redactFromDetections,
  runDetectors,
} from "@maskera/core"

// Re-export the whole rule layer so one install + one import is enough:
// installing maskera pulls in @maskera/core automatically, and
// everything (redact, restore, detectors, validators) is importable from here.
export * from "@maskera/core"

/**
 * Canonical Hugging Face id for maskera's own Swedish PII model: a 43 MB
 * (q4) distilled KB-BERT for PER / LOC / ORG / ADR, task-trained on
 * privacy-audited synthetic Swedish with casing augmentation. MIT weights.
 * Change the owner to your own HF username if you host your own copy.
 */
export const MASKERA_SV_NER_MODEL = "joelhagvall/maskera-sv-ner"

/**
 * The exact Hub commit {@link MASKERA_SV_NER_MODEL} is pinned to (v19 weights).
 *
 * Without a pin, Transformers.js resolves `main`, so whatever sits on the Hub
 * at download time is what runs. That makes a compromised Hub account enough to
 * swap the weights of a redaction model under every installed consumer, with no
 * npm release and nothing to diff, and it means two runs of the same maskera
 * version can grade differently. Pinning trades automatic model updates for
 * reproducibility: a new model reaches consumers when this constant changes and
 * a release ships, which is also when the benchmark numbers move.
 *
 * Pass `revision: "main"` to opt back into always-latest.
 */
export const MASKERA_SV_NER_REVISION = "7ecd7a531c989d09ffb3d9ecf4168696786a204e"

/**
 * The default model is maskera's own Swedish model. Pass any other
 * Transformers.js token-classification model id via `options.model` if you
 * need different language coverage.
 */
export const DEFAULT_NER_MODEL = MASKERA_SV_NER_MODEL

/**
 * Map a raw model entity group to a maskera label; return `null` to drop the
 * entity. The group arrives as the model emits it minus the BIO prefix
 * ("PER", "LOC", "ORG", "ADR" for maskera-sv-ner), NOT as the Swedish
 * placeholder name: that rename is the default map's job, and a custom map
 * REPLACES it entirely. Compose with {@link defaultLabelMap} to keep the
 * Swedish names while remapping or dropping a group.
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

/**
 * The default {@link LabelMap}: maps maskera-sv-ner's groups to the Swedish
 * labels the rule detectors use (PER to NAMN, LOC to PLATS, ORG to
 * ORGANISATION, ADR to ADRESS) and upper-cases anything else, so third-party
 * models work out of the box. Exported so a custom `labelMap` can delegate to
 * it instead of re-implementing the rename:
 *
 * ```ts
 * // keep the Swedish placeholder names, but drop organisations
 * labelMap: (group) => {
 *   const label = defaultLabelMap(group)
 *   return label === "ORGANISATION" ? null : label
 * }
 * ```
 */
export const defaultLabelMap: LabelMap = (group) => {
  const key = group
    .replace(/^[BI]-/, "")
    .replace(/[\s_]/g, "")
    .toUpperCase()
  const mapped = DEFAULT_LABEL_MAP[key]
  if (mapped) return mapped
  // An unknown group passes through as the placeholder label verbatim, so a
  // hostile model must not be able to smuggle bracket or placeholder syntax
  // ("]...[NAMN_1]") into redacted output. Keep a safe charset; if nothing
  // survives, fall back to a generic label.
  const safe = key.replace(/[^A-Z0-9-]/g, "")
  return safe === "" ? "PII" : safe
}

/**
 * Common Swedish words the model can tag as PII when they sit in a name-like
 * position ("Kund Maria ...", "Mail: ...", "betalning till bankgiro ...").
 * These are role words, contact-channel words, payment-rail words and
 * unambiguous generic modifiers/service nouns that are never a name, place or
 * organisation on their own, so a detection whose WHOLE surface form
 * (case-insensitively) is one of them is dropped. Named multi-word detections
 * ("Gamla Stan", "Byggfirman AB") are retained unless the exact full phrase
 * is explicitly listed after being observed as a model false positive.
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
  "dotter",
  "dottern",
  // unambiguous modifiers and generic service nouns. Named multi-word
  // entities such as "Gamla Stan" or "Testbyns vårdcentral" do not equal a
  // denylist entry and are therefore retained.
  "gamla",
  "olåst",
  "butik",
  "butiken",
  "vårdcentral",
  "vårdcentralen",
  "ombud",
  "ombudet",
  "byrå",
  "byrån",
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
  // v19 can merge these two payment labels into one ADR span. Keep the phrase
  // exact: token-by-token filtering could suppress a real multi-word name.
  "betalkonto iban",
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
  // short role/common words observed as high-confidence model false positives
  "aw",
  "dr",
  "vd",
  "ekonomi",
  "oss",
  "vaken",
  "penicillin",
])

/**
 * A model-loading progress event. Hub downloads forward Transformers.js events
 * verbatim. Self-hosted models default to coarse `initiate` / `ready` events to
 * avoid Transformers.js 4.2's duplicate full-file metadata request; opt in to
 * native per-byte events only with {@link NerOptions.nativeLocalProgress}.
 */
export interface NerProgressEvent {
  status: string
  name?: string
  file?: string
  /** Percentage 0-100 (per file for `progress`, aggregate for `progress_total`). */
  progress?: number
  loaded?: number
  total?: number
  [key: string]: unknown
}

export interface NerOptions {
  /** Hugging Face model id. Default: {@link DEFAULT_NER_MODEL}. */
  model?: string
  /**
   * Hub revision (commit sha, tag or branch) to download the model from.
   *
   * Defaults to {@link MASKERA_SV_NER_REVISION} for maskera's own model, so
   * the weights are immutable per release; `"main"` opts into always-latest.
   * For any other `model` the default is Transformers.js's own (`main`), since
   * maskera's pin says nothing about a third-party repo. Ignored entirely when
   * loading from `localModelPath`.
   */
  revision?: string
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
  /**
   * Map raw model entity groups ("PER", "LOC", ...) to maskera labels; see
   * {@link LabelMap}. Default: {@link defaultLabelMap}.
   */
  labelMap?: LabelMap
  /** Progress callback while the model downloads; see {@link NerProgressEvent}. */
  onProgress?: (progress: NerProgressEvent) => void
  /**
   * Transformers.js `env.localModelPath`: base URL/path for locally hosted
   * models. Set this (plus `model`) to load your own model instead of the Hub.
   *
   * PROCESS-GLOBAL, see {@link allowRemoteModels}.
   */
  localModelPath?: string
  /**
   * Transformers.js cache directory. Also applied to `env.cacheDir`, which is
   * required by Yarn PnP because its dependency archive is read-only.
   */
  cacheDir?: string
  /**
   * Transformers.js `env.allowRemoteModels` (default left untouched).
   *
   * PROCESS-GLOBAL, like {@link localModelPath} and {@link allowLocalModels}:
   * Transformers.js keeps these on one shared module-level `env`, not per
   * pipeline, so a recognizer writes them for the whole process and the last
   * writer wins. Two recognizers with conflicting values will fight:
   *
   *   A = createNerRecognizer({ localModelPath: "/models/", allowRemoteModels: false })
   *   B = createNerRecognizer({ allowRemoteModels: true })
   *   // B's load leaves allowRemoteModels true. If A has not loaded yet, or
   *   // retries after a failed load, A now resolves against the network,
   *   // against its own setting. A recognizer that sets none of these
   *   // inherits whatever the previous one left behind.
   *
   * So treat them as one process-wide configuration decided once at startup,
   * not as per-recognizer options. If you need `allowRemoteModels: false` as an
   * actual guarantee, enforce it outside the library too (CSP `connect-src`,
   * network policy, an offline container).
   */
  allowRemoteModels?: boolean
  /**
   * Transformers.js `env.allowLocalModels` (default left untouched).
   *
   * PROCESS-GLOBAL, see {@link allowRemoteModels}.
   */
  allowLocalModels?: boolean
  /**
   * Forward native per-byte progress for a self-hosted model. Default: `false`.
   * Transformers.js 4.2 probes local files with an uncancelled full GET when a
   * progress callback is present, so only enable this with a patched/newer
   * runtime known not to race the real download.
   */
  nativeLocalProgress?: boolean
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
  const runtimeProcess = (
    globalThis as typeof globalThis & { process?: { versions?: { node?: string } } }
  ).process
  const defaultDevice = runtimeProcess?.versions?.node ? "cpu" : "auto"
  const {
    model = DEFAULT_NER_MODEL,
    // Only maskera's own model carries maskera's pin: forcing our sha onto a
    // caller's `model` would request a commit that repo has never heard of.
    revision = model === MASKERA_SV_NER_MODEL ? MASKERA_SV_NER_REVISION : undefined,
    dtype = "q4",
    device = defaultDevice,
    minScore = 0.5,
    labelMap = defaultLabelMap,
    denylist = DEFAULT_DENYLIST,
    onProgress,
    localModelPath,
    cacheDir,
    allowRemoteModels,
    allowLocalModels,
    nativeLocalProgress = false,
  } = options

  // Scores are probabilities in [0, 1]. An invalid threshold (NaN above all,
  // since `avg >= NaN` is always false) would silently drop EVERY model
  // detection, which is fail-open for PII. Reject bad config loudly instead.
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
    throw new Error(`maskera: minScore must be a finite number between 0 and 1, got ${minScore}`)
  }

  const denySet = denylist === null ? null : new Set(Array.from(denylist, (w) => w.toLowerCase()))

  let pipePromise: Promise<import("@huggingface/transformers").TokenClassificationPipeline> | null =
    null

  const withCause = (message: string, cause: unknown): Error => {
    const error = new Error(`${message}\n${String(cause)}`) as Error & { cause?: unknown }
    error.cause = cause
    return error
  }

  const configureCache = (transformersEnv: Record<string, unknown>): void => {
    if (cacheDir !== undefined) {
      transformersEnv.cacheDir = cacheDir
      return
    }

    // Yarn PnP resolves the package from a read-only zip/archive. Transformers
    // derives `/node_modules/.../.cache` from that virtual path and then fails
    // with EROFS. Keep normal npm/pnpm/Bun defaults untouched; only redirect
    // the known virtual/read-only forms to a project-local cache.
    const current = transformersEnv.cacheDir
    const normalized = typeof current === "string" ? current.replaceAll("\\", "/") : ""
    const isVirtualReadOnly =
      normalized.startsWith("/node_modules/") || normalized.includes(".zip/node_modules/")
    const runtimeProcess = (globalThis as typeof globalThis & { process?: { cwd?: () => string } })
      .process
    const cwd = runtimeProcess?.cwd?.()
    if (isVirtualReadOnly && cwd) {
      transformersEnv.cacheDir = `${cwd.replace(/[\\/]$/, "")}/.cache/transformers`
    }
  }

  const load = () => {
    if (!pipePromise) {
      pipePromise = import("@huggingface/transformers")
        .catch((err) => {
          throw withCause(
            'maskera: could not import the optional peer dependency "@huggingface/transformers".',
            err,
          )
        })
        .then(async (t) => {
          // Configure env on the exact module instance we use, so a custom
          // model path applies regardless of how the host bundles things.
          if (localModelPath !== undefined) t.env.localModelPath = localModelPath
          if (allowRemoteModels !== undefined) t.env.allowRemoteModels = allowRemoteModels
          if (allowLocalModels !== undefined) t.env.allowLocalModels = allowLocalModels
          configureCache(t.env)

          const coarseLocalProgress =
            localModelPath !== undefined && onProgress !== undefined && !nativeLocalProgress
          if (coarseLocalProgress) {
            onProgress({ status: "initiate", name: model, progress: 0 })
          }

          try {
            const pipe = await t.pipeline("token-classification", model, {
              dtype,
              device,
              cache_dir: cacheDir,
              revision,
              // Transformers.js 4.2 implements progress totals by probing
              // every local file with a full GET. Its 43 MB ONNX probe is not
              // consumed or cancelled in the published package and can race
              // the real download in a fresh Chromium cache. Coarse local
              // progress keeps the safe one-download path for npm consumers.
              progress_callback:
                onProgress && (localModelPath === undefined || nativeLocalProgress)
                  ? (p: unknown) => onProgress(p as NerProgressEvent)
                  : undefined,
            })
            if (coarseLocalProgress) {
              onProgress({ status: "ready", name: model, progress: 100 })
            }
            return pipe
          } catch (err) {
            throw withCause(`maskera: failed to load model "${model}".`, err)
          }
        })
        .catch((err) => {
          pipePromise = null
          throw err
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
    const { leftEnd, rightStart } = splitPoint(chunk)
    await runChunk(pipe, chunk.slice(0, leftEnd), offset, out)
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
          // Two overlapping chunks saw the same entity with different
          // boundaries, which is exactly what the seam overlap exists to
          // produce. Cover the UNION rather than keeping whichever span is
          // longer: `collected` is sorted by ascending start, so a longer `d`
          // can still begin later, and replacing `prev` with it dropped
          // `prev`'s head. A name cut by the seam ("Anna Karlsson" from the
          // left chunk, "Karlsson Bergström" from the right) leaked its first
          // name that way. Extending is safe because the spans touch.
          if (d.end > prev.end) {
            prev.end = d.end
            prev.value = text.slice(prev.start, prev.end)
          }
          continue
        }
        merged.push({ ...d })
      }
      // A single-character span is never meaningful PII on its own (the model
      // tags "Q" in "Q3" as ORG); masking it just mangles the word around it.
      // Counted in code points, not UTF-16 units: one astral symbol is still
      // one character even though its .length is 2.
      const detections = merged.filter((d) => [...d.value].length > 1)
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
      cursor = advancePastToken(text, lower, tok, cursor)
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
    // it here used to turn "Maskeragatan 44" into the partial span "Maskeragatan".
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
    let located = false
    if (joined && avg >= minScore && LETTER.test(joined)) {
      // Case-sensitive first. maskera-sv-ner's tokenizer is cased, so the
      // token's `word` still carries the casing the text had, and an exact hit
      // is always the more trustworthy of the two. The folded pass stays as the
      // fallback for tokenizers that lower-case or strip accents.
      const span =
        spanFromOffsets(group, text.length) ??
        locateGroup(text, text, group, cursor, false) ??
        locateGroup(text, lower, group, cursor, true)
      if (span) {
        located = true
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
        // detached A-D after the house number ("Maskeragatan 46 C"). q4 can
        // confidently tag the street + number but leave that final letter O.
        // Restrict the extension to A-D and require a non-word boundary after
        // it, so ordinary following words such as "i Stockholm" are untouched.
        if (base === "ADR" && DIGIT.test(text[end - 1] ?? "")) {
          const suffix = text.slice(end).match(/^(\s+[A-Da-d])(?=$|[^\p{L}\p{N}])/u)
          const suffixText = suffix?.[1]
          if (suffixText) end += suffixText.length
        }
        // The complement: an ADR span that stops at the street words can leave
        // the house number exposed ("Maskeras plats" tagged, the "1"
        // leaked; the 2026-07-14 sweep found the same on saint-prefixed
        // streets). A bare number right after a street span narrows the
        // address materially, so widen to include it (and any detached A-D
        // letter after it). Ordinary following words are untouched: the
        // extension requires digits immediately after the span.
        if (base === "ADR" && LETTER.test(text[end - 1] ?? "")) {
          const houseNumber = text
            .slice(end)
            .match(/^(\s+(?:nr\s+)?\d{1,4}(?:\s?[A-Da-d])?)(?=$|[^\p{L}\p{N}])/u)
          const houseText = houseNumber?.[1]
          if (houseText) end += houseText.length
        }
        // Identifier-label words: in "Kommun A, org.nr 202100-4748" the model's
        // ORG span can swallow the "org" of the following "org.nr", leaving a
        // dangling ".nr" outside the placeholder. The label word introduces the
        // structured identifier (the rules layer's span), it is never part of
        // the name, so trim it plus the separators before it. Requiring a
        // separator keeps entities that ARE such a word ("Org" as a name)
        // intact, and spans ending in a digit ("Testgatan nr 5") never match.
        // The separator run is bounded rather than `+`: unanchored `[...]+$`
        // backtracks quadratically over a span that is mostly separators.
        // locateGroup caps the whitespace it skips between pieces, so such a
        // span can no longer reach here, but the bound stays as a second line
        // of defence. A real label separator is a comma and a space or two.
        //
        // The search runs against the TAIL of the span, not the whole slice:
        // the longest match the pattern can produce is 16 separators +
        // "personnr" + "." = 25 characters, so anything further from `end`
        // can never participate. Slicing the full span made each iteration
        // O(span), and a hostile token stream (reconstruct is exported) could
        // chain one trim per label-word, i.e. O(span^2) on "org, org, org, …".
        for (;;) {
          const labelWord = text
            .slice(Math.max(start, end - LABEL_WORD_TAIL), end)
            .match(/[\s,;:(]{1,16}(?:org|orgnr|pnr|personnr|nr)\.?$/iu)
          if (!labelWord) break
          end -= labelWord[0].length
        }
        const soloFragment = group.length === 1 && (group[0]?.word.startsWith("##") ?? false)
        if (!soloFragment && isWholeWord(text, start, end)) {
          const label = labelMap(base)
          if (label) {
            out.push({ start, end, value: text.slice(start, end), label })
          }
        }
        // Advance whether or not the group was kept. A rejected group still
        // says where the tokenizer had got to, and a cursor left behind is
        // exactly what lets a later group re-match this same stretch of text.
        if (end > cursor) cursor = end
      }
    }
    if (!located) {
      for (const part of group) cursor = advancePastToken(text, lower, part, cursor)
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
/** Max whitespace skipped between two pieces of one entity; see locateGroup. */
const MAX_PIECE_GAP = 32
/**
 * How far back from a span's end an identifier-label word ("…, org.nr") can
 * start: 16 separator chars + "personnr" (8) + a trailing dot. See the trim
 * loop in reconstruct.
 */
const LABEL_WORD_TAIL = 25
const STREET_ADDRESS_TAIL =
  /^(?:gata(?:n)?|väg(?:en)?|gränd(?:en)?|allé(?:n)?|torg(?:et)?|plan)\s+\p{N}/iu

/** The surface text a token contributes, without the subword marker. */
const pieceOf = (t: RawToken) => (t.word.startsWith("##") ? t.word.slice(2) : t.word)

/**
 * The span the tokenizer itself reported, when it reported one.
 *
 * {@link RawToken} has always carried `start`/`end` and `reconstruct` ignored
 * them, searching for the surface string instead. That search exists for BERT
 * wordpiece, which tracks no offsets; where a tokenizer does track them they
 * are exact, and preferring them removes the wrong-occurrence failure mode
 * below outright rather than merely narrowing it.
 */
function spanFromOffsets(group: RawToken[], length: number): { start: number; end: number } | null {
  const start = group[0]?.start
  const end = group[group.length - 1]?.end
  if (typeof start !== "number" || typeof end !== "number") return null
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  if (start < 0 || end > length || start >= end) return null
  return { start, end }
}

/**
 * Move the search cursor past one token's surface text.
 *
 * {@link locateGroup} takes the first occurrence at or after `cursor`, so the
 * cursor is what separates an entity from an identically spelled word earlier
 * in the sentence, and its folded fallback pass makes even the casing no help.
 * Tokens tagged `O` used not to move the cursor at all.
 *
 * Transformers.js's token-classification pipeline drops `O` tokens before we
 * see them, so on maskera's own path this never fires; the case-sensitive
 * lookup above is what carries that job. It matters for anyone calling the
 * exported {@link reconstruct} with a full token stream, and it is the only
 * correct thing to do with an `O` token when one does arrive.
 *
 * Only a piece sitting exactly where the next token belongs counts, which is
 * immediately after the previous one with nothing but whitespace between:
 * wordpiece splits on whitespace and punctuation and makes a token of every
 * other character, so consecutive tokens are adjacent by construction. A
 * tokenizer configured to strip accents turns "Åsa" into "asa", which cannot be
 * found at its true position at all, and a plain distance bound would happily
 * let that piece drag the cursor to some later "asa" and skip every real entity
 * in between. Failing to advance is always safe; overshooting is not.
 */
function advancePastToken(text: string, lower: string, token: RawToken, cursor: number): number {
  const end = token.end
  if (typeof end === "number" && Number.isInteger(end) && end > cursor && end <= text.length) {
    return end
  }
  const piece = pieceOf(token)
  if (!piece) return cursor
  let at = text.indexOf(piece, cursor)
  if (at < 0) at = lower.indexOf(safeLower(piece), cursor)
  if (at < 0 || at - cursor > MAX_PIECE_GAP) return cursor
  for (let k = cursor; k < at; k++) {
    if (!WHITESPACE.test(text[k] as string)) return cursor
  }
  return at + piece.length
}

/**
 * Locate a token group's span in the original text, starting at `cursor`.
 * The tokenizer discards whitespace, so "Karl-Gustav" comes back as the
 * pieces `Karl`, `-`, `Gustav`, so we match piece by piece, allowing optional
 * whitespace before each new word (but none before a `##` continuation),
 * instead of guessing a single joined surface string.
 *
 * `haystack` is `text` itself for the case-sensitive pass and its {@link
 * safeLower} form for the folded fallback; `fold` says which, so the pieces are
 * normalised the same way the haystack was.
 *
 * The whitespace skip between pieces is capped at {@link MAX_PIECE_GAP}:
 * pieces of one entity sit a space or two apart, and an unbounded skip let
 * the retry loop below re-walk a 200k-space run (PDF extraction produces
 * exactly those) once per anchor of the head piece. Two pieces further apart
 * than the cap are not one entity anyway.
 */
function locateGroup(
  text: string,
  haystack: string,
  group: RawToken[],
  cursor: number,
  fold: boolean,
): { start: number; end: number } | null {
  const norm = fold ? safeLower : identity
  const head = group[0]
  if (!head) return null
  const first = norm(pieceOf(head))
  if (!first) return null

  let start = haystack.indexOf(first, cursor)
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
        let skipped = 0
        while (skipped < MAX_PIECE_GAP && pos < text.length && WHITESPACE.test(text[pos] ?? "")) {
          pos++
          skipped++
        }
      }
      const piece = norm(pieceOf(tok))
      if (piece && haystack.startsWith(piece, pos)) {
        pos += piece.length
      } else {
        ok = false
        break
      }
    }
    if (ok) return { start, end: pos }
    start = haystack.indexOf(first, start + 1)
  }
  return null
}

const identity = (s: string): string => s

/**
 * Where to cut an over-long chunk in two, with an overlap so an entity sitting
 * on the seam still appears whole in one of the halves.
 *
 * Splitting at whitespace is a PREFERENCE, never a licence to stand still.
 * The search walks up to 200 characters down from the middle, so on a short
 * but token-dense chunk whose only space sits near the start it would land
 * there, `mid - overlap` would clamp to 0, and the right-hand slice would be
 * the input itself: a fixed point that made `detect()` never return. 500
 * characters were enough (CJK and long symbol runs tokenize about 1:1, so they
 * pass MAX_TOKENS while staying short enough for the window to reach the
 * start), and because the runaway recursion floods the microtask queue it
 * starves timers too, so nothing times out and the process never recovers.
 *
 * Exported for tests: `leftEnd < chunk.length` and `0 < rightStart` is the
 * whole termination argument, and it is cheap to verify exhaustively.
 */
export function splitPoint(chunk: string): { leftEnd: number; rightStart: number } {
  const half = Math.floor(chunk.length / 2)
  const overlap = Math.min(100, Math.floor(chunk.length / 8))
  let mid = half
  for (let i = half; i > half - 200 && i > 1; i--) {
    if (WHITESPACE.test(chunk[i] ?? "")) {
      mid = i
      break
    }
  }
  // Fall back to the exact middle, which always leaves both sides shorter.
  if (mid + overlap >= chunk.length || mid <= overlap) mid = half
  return { leftEnd: mid + overlap, rightStart: mid - overlap }
}

/**
 * The model emits subword pieces, so a fragment can land in the middle of an
 * ordinary word (e.g. "par" inside "Motpart") or be pure digits ("14:20"). We
 * only keep spans that sit on word boundaries, the char on each side must not
 * be a letter, which drops both classes of false positive. Numbers are the
 * rule layer's job anyway.
 */
export function isWholeWord(text: string, start: number, end: number): boolean {
  const before = text[start - 1] ?? ""
  const after = text[end] ?? ""
  return !LETTER.test(before) && !LETTER.test(after)
}

/** Whether a hybrid detection came from the deterministic or model layer. */
export type HybridDetectionSource = "rule" | "model"

/** Built-in hybrid policies. Omit `profile` for the general default. */
export type RedactionProfile = "general" | "clinical"

/**
 * Optional final precision policy for the hybrid pipeline. Returning `false`
 * drops the detection. The source is explicit because suppressing a
 * deterministic rule has a very different privacy cost from suppressing a
 * probabilistic model guess.
 */
export type HybridDetectionFilter = (
  detection: Detection,
  input: string,
  source: HybridDetectionSource,
) => boolean

const CLINICAL_NON_PII = new Set([
  "diabetes",
  "dietist",
  "hemrehab",
  "ordinera hemrehab",
  "penicillin",
  "pneumoni",
  "vaken",
  "vfu huvudtrauma",
])

const CLINICAL_MEASUREMENT =
  /^(?:af|blodtryck|bt|crp|gcs|glukos|hb|kalium|kreatinin|mottagning|na|natrium|p-glukos|puls|sat|saturation|spo2|temp|temperatur|troponin|vårdas\s+avd)\b[\s:=/-]*(?:x?\d)/iu
const CLINICAL_IDENTIFIER_LABEL =
  /^journal(?:nummer|nr)\b[\s:#-]*(?:(?:[\p{L}\p{N}]{2,12}[-/]){1,3}[\p{L}\p{N}]{2,12}|\d{5,20})$/iu
const MEDICATION_WITH_DOSE = /^\p{L}[\p{L}'’-]*(?:\s+\p{L}[\p{L}'’-]*){0,2}\s+\d+(?:[.,]\d+)?$/u
const CLINICAL_UNIT_AFTER = /^\s*(?:g|ie|mg|mg\/ml|mikrogram|ml|mmhg|mmol\/l|µg|μg)(?=$|[^\p{L}])/iu

/**
 * Opt-in precision policy for clinical text. It removes high-confidence model
 * mistakes that are syntactically clinical measurements, medication doses or
 * unambiguous care terms. Rule detections are retained: structured PII must
 * never become dependent on a medical-language heuristic.
 *
 * Prefer `redactWithNer(text, { recognizer, profile: "clinical" })` for normal
 * journal/clinical workflows. This exported filter is the advanced building
 * block for callers composing their own policy. It is not the global default
 * because a domain filter always trades some recall for utility.
 */
export const clinicalPrecisionFilter: HybridDetectionFilter = (detection, input, source) => {
  if (source === "rule") return true
  const value = detection.value.trim().toLowerCase()
  if (CLINICAL_NON_PII.has(value)) return false
  if (CLINICAL_MEASUREMENT.test(value)) return false
  // The contextual rule still masks the identifier itself. Drop only the model's
  // wider, wrongly typed "Journalnummer <identifier>" span so the label word and
  // surrounding clinical prose stay readable.
  if (CLINICAL_IDENTIFIER_LABEL.test(value)) return false
  if (
    MEDICATION_WITH_DOSE.test(detection.value.trim()) &&
    CLINICAL_UNIT_AFTER.test(input.slice(detection.end, detection.end + 24))
  ) {
    return false
  }
  return true
}

// Lowercase town names are where q4 most often confuses LOC with ORG. Only
// override known Swedish localities and only when the model emitted the whole
// surface in lowercase; cased organisation names that share a city name keep
// the model's label. This changes the placeholder label, never whether the
// value is protected.
const LOWERCASE_SWEDISH_LOCALITIES = new Set([
  "alingsås",
  "borlänge",
  "borås",
  "eskilstuna",
  "falun",
  "gävle",
  "göteborg",
  "halmstad",
  "helsingborg",
  "hudiksvall",
  "härnösand",
  "jönköping",
  "kalmar",
  "karlskrona",
  "karlstad",
  "kiruna",
  "kristianstad",
  "linköping",
  "luleå",
  "lund",
  "malmö",
  "motala",
  "norrköping",
  "nyköping",
  "skellefteå",
  "stockholm",
  "sundsvall",
  "södertälje",
  "trollhättan",
  "uddevalla",
  "umeå",
  "uppsala",
  "visby",
  "västerås",
  "växjö",
  "örebro",
  "örnsköldsvik",
  "östersund",
])

const STREET_NAME_SURFACE =
  /(?:allén|backen|gata|gatan|gränd|gränden|gången|kajen|leden|plan|stigen|stranden|stråket|terrassen|torg|torget|väg|vägen)$/iu
const HOUSE_NUMBER_AFTER = /^(\s+(?:nr\s+)?\d{1,4}(?:\s?[A-Da-d])?)(?=$|[^\p{L}\p{N}])/u

/** Repair safe, surface-level q4 boundary/label errors before overlap merging. */
function normalizeModelDetection(input: string, detection: Detection): Detection {
  let normalized = detection
  const lower = detection.value.toLowerCase()
  if (
    detection.label === "ORGANISATION" &&
    detection.value === lower &&
    LOWERCASE_SWEDISH_LOCALITIES.has(lower)
  ) {
    normalized = { ...normalized, label: "PLATS" }
  }

  if (
    (normalized.label === "ADRESS" ||
      normalized.label === "PLATS" ||
      normalized.label === "ORGANISATION") &&
    STREET_NAME_SURFACE.test(normalized.value)
  ) {
    const tail = input.slice(normalized.end).match(HOUSE_NUMBER_AFTER)?.[1]
    if (tail) {
      const end = normalized.end + tail.length
      normalized = {
        ...normalized,
        end,
        value: input.slice(normalized.start, end),
        label: "ADRESS",
      }
    }
  }
  return normalized
}

/**
 * The hybrid entry point's default rule set. Whoever calls redactWithNer has
 * free text about people (nobody loads a 43 MB name model for server logs),
 * so the free-text heuristics `adress` and `lagenhetsnummer` are on by
 * default here: both are low-risk (street suffix + house number, literal
 * "lgh" prefix), and the address RULE guarantees the house number is always
 * inside the mask where the model's ADR span sometimes splits it. `regnummer`
 * stays opt-in even here: three letters + three digits is also the shape of
 * booking codes and case ids, exactly what support text is full of. The
 * synchronous rules-only `redact()` keeps the conservative structured
 * defaults.
 */
export const hybridDefaultDetectors = [
  ...defaultDetectors,
  ...contextualDetectors,
  adress,
  lagenhetsnummer,
]

export interface RedactWithNerOptions extends Pick<RedactOptions, "placeholder"> {
  recognizer: NerRecognizer
  /**
   * Named built-in policy. `clinical` preserves common measurements, doses
   * and care terms; omit this option (or use `general`) for the default.
   */
  profile?: RedactionProfile
  /**
   * Rule-based detectors to combine with the model.
   * Default: {@link hybridDefaultDetectors} (all structured built-ins plus
   * the `adress` and `lagenhetsnummer` heuristics).
   */
  detectors?: RedactOptions["detectors"]
  /**
   * Additional custom precision policy applied to both layers before overlap
   * resolution and composed with the selected profile. See
   * {@link clinicalPrecisionFilter}.
   */
  detectionFilter?: HybridDetectionFilter
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
  const profileFilter = options.profile === "clinical" ? clinicalPrecisionFilter : undefined
  const keepDetection = (detection: Detection, source: HybridDetectionSource): boolean =>
    (profileFilter?.(detection, input, source) ?? true) &&
    (options.detectionFilter?.(detection, input, source) ?? true)

  // Same folded view as the synchronous `redact()`, so a zero-width space
  // cannot hide a personnummer from the rule half of the hybrid either.
  const ruleDetections = runDetectors(input, options.detectors ?? hybridDefaultDetectors).filter(
    (detection) => keepDetection(detection, "rule"),
  )

  const modelDetections = (await options.recognizer.detect(input))
    .map((detection) => normalizeModelDetection(input, detection))
    .filter((detection) => keepDetection(detection, "model"))

  // Rules are authoritative on THEIR spans, but a model span that merely
  // touches a rule span must not be dropped wholesale: the model sometimes
  // glues a name to the e-mail local-part that follows it, and dropping the
  // whole span would leak the name. Clip away the rule intervals and keep
  // whatever meaningful segments remain.
  const WORD_CHAR = /[\p{L}\p{N}]/u
  // Clip by interval subtraction against the rule spans, sorted once, rather
  // than re-walking the whole segment list per rule span: that list grows by
  // one per overlapping rule, so the nested version was quadratic in the rule
  // count under one model span. Measured on a 79 kB log dump with 4k e-mail
  // detections and 50 document-wide model spans: 3.3 s of blocked event loop,
  // doubling the log quadrupled it. The single cursor sweep below visits each
  // rule span once per model span it can actually overlap.
  const sortedRules = [...ruleDetections].sort((a, b) => a.start - b.start || a.end - b.end)
  const keptModel: Detection[] = []
  for (const d of modelDetections) {
    const segments: Array<[number, number]> = []
    let cursor = d.start
    for (const r of sortedRules) {
      if (r.start >= d.end) break
      if (r.end <= cursor) continue
      if (r.start > cursor) segments.push([cursor, Math.min(r.start, d.end)])
      cursor = Math.max(cursor, r.end)
      if (cursor >= d.end) break
    }
    if (cursor < d.end) segments.push([cursor, d.end])
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
