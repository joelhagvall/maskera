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
  NAME: "PERSON",
  CITY: "LOCATION",
  STATE: "LOCATION",
  COUNTRY: "LOCATION",
  STREET: "ADDRESS",
  STREETADDRESS: "ADDRESS",
  BUILDINGNUMBER: "ADDRESS",
  SECONDARYADDRESS: "ADDRESS",
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
  } = options

  let pipePromise: Promise<import("@huggingface/transformers").TokenClassificationPipeline> | null =
    null

  const load = () => {
    if (!pipePromise) {
      pipePromise = import("@huggingface/transformers")
        .then((t) =>
          t.pipeline("token-classification", model, {
            dtype,
            device,
            progress_callback: onProgress,
          }),
        )
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
      const raw = await pipe(text, { aggregation_strategy: "first" })
      const out: Detection[] = []
      for (const r of raw) {
        if (r.score < minScore) continue
        if (r.start == null || r.end == null) continue
        const group = r.entity_group ?? r.entity
        if (!group) continue
        const label = labelMap(group)
        if (!label) continue
        out.push({ start: r.start, end: r.end, value: text.slice(r.start, r.end), label })
      }
      return out
    },
  }
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
