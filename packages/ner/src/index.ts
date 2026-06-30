import type { Detection, PiiLabel, RedactOptions, RedactResult } from "@maska/core"
import { defaultDetectors, redactFromDetections } from "@maska/core"

/**
 * Default model: Rampart (nationaldesignstudio/rampart), a 14.7 MB 4-bit
 * quantized MiniLM token-classification model, CC BY 4.0.
 * Latin-script (incl. Swedish); evaluate Swedish recall before relying on it.
 * Attribution required — see this package's README/NOTICE.
 */
export const DEFAULT_NER_MODEL = "nationaldesignstudio/rampart"

/**
 * Map a model entity group (e.g. "GIVENNAME", "CITY") to a maska label.
 * Return `null` to drop the entity. The default normalises a handful of
 * common OpenPII groups to coarse labels and upper-cases the rest.
 */
export type LabelMap = (entityGroup: string) => PiiLabel | null

const DEFAULT_LABEL_MAP: Record<string, PiiLabel> = {
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
  /** Map model entity groups to maska labels. Default: {@link defaultLabelMap}. */
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
  /** Run the model and return maska-compatible detections. */
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
            `@maska/ner: failed to load "${model}". Is the optional peer ` +
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

interface RawToken {
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
function reconstruct(
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
      if (contiguous && (isSubword || continuesEntity)) {
        group.push(next)
        j++
      } else {
        break
      }
    }

    let surface = ""
    for (const p of group) {
      if (p.word.startsWith("##")) surface += p.word.slice(2)
      else surface += (surface ? " " : "") + p.word
    }

    const avg = group.reduce((s, p) => s + p.score, 0) / group.length
    if (surface && avg >= minScore) {
      const idx = lower.indexOf(surface.toLowerCase(), cursor)
      if (idx >= 0) {
        const end = idx + surface.length
        const label = labelMap(base)
        if (label) {
          out.push({ start: idx, end, value: text.slice(idx, end), label })
          cursor = end
        }
      }
    }
    i = j
  }
  return out
}

export interface RedactWithNerOptions extends Pick<RedactOptions, "placeholder"> {
  recognizer: NerRecognizer
  /** Rule-based detectors to combine with the model. Default: all built-ins. */
  detectors?: RedactOptions["detectors"]
}

/**
 * Hybrid redaction: run the deterministic rule detectors AND the NER model,
 * then merge everything through core's stable-placeholder / overlap engine.
 * Rule detections win ties (they're added first and are higher-confidence).
 */
export async function redactWithNer(
  input: string,
  options: RedactWithNerOptions,
): Promise<RedactResult> {
  const detectors = options.detectors ?? defaultDetectors
  const detections: Detection[] = []
  for (const detector of detectors) {
    for (const m of detector.detect(input)) {
      detections.push({ ...m, label: detector.label })
    }
  }
  detections.push(...(await options.recognizer.detect(input)))
  return redactFromDetections(input, detections, { placeholder: options.placeholder })
}
