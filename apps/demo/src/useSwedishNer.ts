import { type RedactResult, redact, restore } from "@maskera/core"
import { useEffect, useMemo, useRef, useState } from "react"
import { demoDetectors } from "./detectors"
import type { NerWorkerMsg } from "./ner.worker"

export type NerStatus = "loading" | "ready" | "error"

export interface SwedishNer {
  /**
   * Current redaction result: rules-only until the model has analyzed the
   * current text, then the rules+model hybrid.
   */
  result: RedactResult
  status: NerStatus
  /** Model download progress (0–100) while loading. */
  progress: number
  /** True while the model is (re)analyzing the current text. */
  analyzing: boolean
}

/**
 * Redacts `text` with the rule layer instantly, then upgrades to the
 * rules+model hybrid once maskera's model is ready.
 *
 * All model work (Transformers.js, WASM, inference) runs in a web worker so
 * the main thread never blocks, and the worker is spawned only after the
 * first paint so the page renders before the heavy loading starts.
 */
export function useSwedishNer(text: string): SwedishNer {
  const [status, setStatus] = useState<NerStatus>("loading")
  const [progress, setProgress] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  // The text belonging to the latest request id, so a worker result can be
  // stored together with the text it was computed for.
  const requestTextRef = useRef("")

  const ruleResult = useMemo(() => redact(text, { detectors: demoDetectors }), [text])
  const [nerResult, setNerResult] = useState<{ forText: string; result: RedactResult } | null>(null)
  const ready = status === "ready"

  // Derive during render: the hybrid result when it matches the current text,
  // otherwise the rule result for the text as typed. This keeps highlight
  // offsets in sync while the worker is still analyzing, instead of showing a
  // stale result for the previous text.
  const result = nerResult && nerResult.forText === text ? nerResult.result : ruleResult

  // Spawn the worker after the first paint (double rAF fires after the
  // browser has rendered the initial frame), so hero and cards are visible
  // before the model download and WASM init begin.
  useEffect(() => {
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const worker = new Worker(new URL("./ner.worker.ts", import.meta.url), { type: "module" })
        workerRef.current = worker
        worker.onmessage = (e: MessageEvent<NerWorkerMsg>) => {
          const msg = e.data
          if (msg.type === "progress") setProgress(msg.progress)
          if (msg.type === "ready") setStatus("ready")
          if (msg.type === "error") setStatus("error")
          if (msg.type === "result") {
            if (msg.id !== requestIdRef.current) return // stale, a newer text is in flight
            setAnalyzing(false)
            if (msg.failed || !msg.text || !msg.map || !msg.redactions) return
            const map = msg.map
            setNerResult({
              forText: requestTextRef.current,
              result: {
                text: msg.text,
                map,
                redactions: msg.redactions,
                restore: (s) => restore(s, map),
              },
            })
          }
        }
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  // Ask the worker to reanalyze (debounced) whenever the text changes.
  useEffect(() => {
    const worker = workerRef.current
    if (!ready || !worker) return
    setAnalyzing(true)
    const id = ++requestIdRef.current
    requestTextRef.current = text
    const timer = setTimeout(() => worker.postMessage({ id, text }), 250)
    return () => clearTimeout(timer)
  }, [text, ready])

  return { result, status, progress, analyzing }
}
