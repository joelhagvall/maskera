import type { Redaction } from "@maskera/core"
import { createNerRecognizer, redactWithNer } from "maskera"
import { ruleDetectors } from "./detectors"
import modelMeta from "./model-meta.json"

/** Messages from the worker to the main thread. */
export type NerWorkerMsg =
  | { type: "progress"; progress: number }
  | { type: "ready" }
  | { type: "error" }
  | {
      type: "result"
      id: number
      failed?: boolean
      text?: string
      map?: Record<string, string>
      redactions?: Redaction[]
    }

// Everything heavy lives here: the Transformers.js import, the WASM runtime
// and the model itself. The main thread only ever sees plain result objects.

const recognizerPromise = (async () => {
  // Self-host the ONNX WASM runtime (copied to /ort/ by scripts/fetch-model.mjs)
  // instead of Transformers.js's default jsDelivr CDN, so the demo makes zero
  // external requests. Same module instance as maskera uses, so the
  // setting applies before the recognizer initializes.
  const transformers = await import("@huggingface/transformers")
  const onnxWasm = transformers.env.backends.onnx?.wasm
  if (onnxWasm) onnxWasm.wasmPaths = "/ort/"

  // Version suffix in the path busts the browser's Cache Storage when a new
  // model ships: Transformers.js caches by URL and never revalidates, so
  // returning visitors would silently keep the old weights forever.
  const recognizer = createNerRecognizer({
    model: "maskera-sv-ner-v15",
    localModelPath: "/models/",
    allowLocalModels: true,
    allowRemoteModels: false,
    dtype: "q4",
    device: "wasm",
    onProgress: (p) => {
      const prog = p as { status?: string; file?: string; loaded?: number }
      // Track the onnx weights only (41 of 41.6 MB): their bytes ARE the
      // download for any bar purpose. Compute the percentage ourselves from
      // `loaded` against the known file size: the event's own `progress` (and
      // the aggregate progress_total) is pinned at 100 whenever the server
      // omits content-length, which Vercel does for this file (brotli,
      // chunked) - the very bug where the bar sat frozen at 100%.
      if (
        prog?.status === "progress" &&
        typeof prog.loaded === "number" &&
        prog.file?.endsWith(".onnx")
      ) {
        postMessage({
          type: "progress",
          // floor + cap: 100 must mean the download actually finished, since
          // the UI switches to the "starting up" phase at 100.
          progress: Math.min(100, Math.floor((prog.loaded / modelMeta.onnxBytes) * 100)),
        } satisfies NerWorkerMsg)
      }
    },
  })
  await recognizer.ready
  return recognizer
})()

recognizerPromise
  .then(() => postMessage({ type: "ready" } satisfies NerWorkerMsg))
  .catch((err) => {
    // A failed model load is an expected, handled state: the UI shows an
    // "AI-modellen kunde inte laddas" status off the message below. Keep the
    // raw stack for local debugging, but don't spew it to the production
    // console (no telemetry reads it, and it trips Lighthouse's console-error
    // audit when the audit's throttling cuts the 43 MB download short).
    if (import.meta.env.DEV) console.error(err)
    postMessage({ type: "error" } satisfies NerWorkerMsg)
  })

self.onmessage = async (e: MessageEvent<{ id: number; text: string }>) => {
  const { id, text } = e.data
  try {
    const recognizer = await recognizerPromise
    const result = await redactWithNer(text, { recognizer, detectors: ruleDetectors })
    postMessage({
      type: "result",
      id,
      text: result.text,
      map: result.map,
      redactions: result.redactions,
    } satisfies NerWorkerMsg)
  } catch {
    postMessage({ type: "result", id, failed: true } satisfies NerWorkerMsg)
  }
}
