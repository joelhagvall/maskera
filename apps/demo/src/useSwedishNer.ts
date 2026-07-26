import { type RedactResult, redact, restore } from "@maskera/core"
import { useEffect, useMemo, useRef, useState } from "react"
import { demoDetectors } from "./detectors"
import type { NerWorkerMsg } from "./ner.worker"

export type NerStatus = "idle" | "loading" | "ready" | "error"

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
export function useSwedishNer(text: string, activation: number): SwedishNer {
  const [status, setStatus] = useState<NerStatus>(activation > 0 ? "loading" : "idle")
  const [progress, setProgress] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  // At most one inference is ever sent to the worker at a time. Without this
  // gate, debounced keystrokes during a slow (large-document) inference queue
  // full-text jobs in the worker faster than it can drain them, and it burns
  // CPU on texts the main thread has already superseded.
  const inFlightRef = useRef(false)
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
  // before the model download and WASM init begin. activation === 0 is the
  // passive/direct-landing state: rules work, but no worker or model fetch is
  // started until the visitor asks to use the model.
  useEffect(() => {
    if (activation === 0) return

    requestIdRef.current += 1
    requestTextRef.current = ""
    inFlightRef.current = false
    setStatus("loading")
    setProgress(0)
    setAnalyzing(false)
    setNerResult(null)

    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const worker = new Worker(new URL("./ner.worker.ts", import.meta.url), { type: "module" })
        workerRef.current = worker
        // A worker whose script fails to fetch or evaluate (e.g. deploy skew:
        // a stale tab requesting a hashed chunk that no longer exists) never
        // posts a message, so without this the UI stays on "loading" forever.
        worker.onerror = () => {
          setAnalyzing(false)
          setStatus("error")
        }
        worker.onmessage = (e: MessageEvent<NerWorkerMsg>) => {
          const msg = e.data
          if (msg.type === "progress") setProgress(msg.progress)
          if (msg.type === "ready") setStatus("ready")
          if (msg.type === "error") {
            setAnalyzing(false)
            setStatus("error")
          }
          if (msg.type === "result") {
            inFlightRef.current = false
            if (msg.id !== requestIdRef.current) {
              // Stale: a newer text superseded this one while the worker was
              // busy. Send it now that the worker is free, instead of letting
              // more debounced copies queue up behind a slow inference.
              if (requestTextRef.current) {
                inFlightRef.current = true
                worker.postMessage({ id: requestIdRef.current, text: requestTextRef.current })
              }
              return
            }
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
  }, [activation])

  // Ask the worker to reanalyze (debounced) whenever the text changes.
  useEffect(() => {
    const worker = workerRef.current
    if (!ready || !worker) return

    const id = ++requestIdRef.current
    requestTextRef.current = text

    if (!text) {
      setAnalyzing(false)
      setNerResult(null)
      return
    }

    setAnalyzing(true)
    const timer = setTimeout(() => {
      // Worker busy: skip this send. When the in-flight result arrives it is
      // stale by definition (this effect already bumped the request id), and
      // the result handler sends the latest text then.
      if (inFlightRef.current) return
      inFlightRef.current = true
      worker.postMessage({ id, text })
    }, 250)
    return () => clearTimeout(timer)
  }, [text, ready])

  return { result, status, progress, analyzing }
}
