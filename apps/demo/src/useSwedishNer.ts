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
  /**
   * True from the moment the text changes until the model has answered for
   * it (derived during render, so it is already true on the first render of
   * a new text, before `analyzing` flips). Callers use it to hold layout
   * steady instead of reacting to the interim rules-only result.
   */
  pending: boolean
}

/** Model answers kept per text; the model is deterministic, so they stay valid. */
const ANSWER_LIMIT = 64
const NO_PREWARM: readonly string[] = []
/** Typing pause before a new text is sent to the model. */
const DEBOUNCE_MS = 250

/**
 * Redacts `text` with the rule layer instantly, then upgrades to the
 * rules+model hybrid once maskera's model is ready.
 *
 * All model work (Transformers.js, WASM, inference) runs in a web worker so
 * the main thread never blocks, and the worker is spawned only after the
 * first paint so the page renders before the heavy loading starts.
 *
 * Answers are remembered per text, so a text seen before (an example picked
 * again) is shown at once without another inference. `prewarm` texts are
 * analyzed in the background once the model is ready and nothing else is
 * waiting, so even the first pick of an example needs no wait: examples whose
 * personal data only the model finds (names, places) would otherwise show an
 * empty result for the debounce plus one inference.
 */
export function useSwedishNer(
  text: string,
  activation: number,
  prewarm: readonly string[] = NO_PREWARM,
): SwedishNer {
  const [status, setStatus] = useState<NerStatus>(activation > 0 ? "loading" : "idle")
  const [progress, setProgress] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const [answers, setAnswers] = useState<ReadonlyMap<string, RedactResult>>(() => new Map())
  // The text whose latest inference failed: the rules stand for it.
  const [failedText, setFailedText] = useState<string | null>(null)

  const workerRef = useRef<Worker | null>(null)
  // At most one inference is ever sent to the worker at a time. Without this
  // gate, debounced keystrokes during a slow (large-document) inference queue
  // full-text jobs in the worker faster than it can drain them, and it burns
  // CPU on texts the main thread has already superseded.
  const inFlightRef = useRef(false)
  const nextIdRef = useRef(0)
  const textByIdRef = useRef(new Map<number, string>())
  // The text the visitor is looking at and still waiting for; `due` once its
  // debounce has passed. Prewarming waits while it is set.
  const latestRef = useRef<{ text: string; due: boolean } | null>(null)
  const answersRef = useRef(answers)
  const prewarmRef = useRef(prewarm)
  const prewarmQueueRef = useRef<string[]>([])
  const pumpRef = useRef<() => void>(() => {})

  useEffect(() => {
    prewarmRef.current = prewarm
  }, [prewarm])

  const ruleResult = useMemo(() => redact(text, { detectors: demoDetectors }), [text])
  const ready = status === "ready"

  // Derive during render: the hybrid result when the model has answered for
  // this exact text, otherwise the rule result for the text as typed. This
  // keeps highlight offsets in sync while the worker is still analyzing,
  // instead of showing a stale result for the previous text.
  const result = answers.get(text) ?? ruleResult
  const pending = ready && text !== "" && !answers.has(text) && failedText !== text

  // Spawn the worker after the first paint (double rAF fires after the
  // browser has rendered the initial frame), so hero and cards are visible
  // before the model download and WASM init begin. activation === 0 is the
  // passive/direct-landing state: rules work, but no worker or model fetch is
  // started until the visitor asks to use the model.
  useEffect(() => {
    if (activation === 0) return

    inFlightRef.current = false
    textByIdRef.current.clear()
    latestRef.current = null
    prewarmQueueRef.current = []
    setStatus("loading")
    setProgress(0)
    setAnalyzing(false)
    setFailedText(null)

    const remember = (forText: string, answer: RedactResult) => {
      const next = new Map(answersRef.current)
      next.delete(forText)
      next.set(forText, answer)
      while (next.size > ANSWER_LIMIT) next.delete(next.keys().next().value as string)
      answersRef.current = next
      setAnswers(next)
    }

    // Send the next job when the worker is free: the visitor's text first,
    // background prewarming only when nothing is waiting for the visitor.
    const pump = () => {
      const worker = workerRef.current
      if (!worker || inFlightRef.current) return
      const latest = latestRef.current
      let job: string | undefined
      if (latest) {
        if (latest.due && !answersRef.current.has(latest.text)) job = latest.text
      } else {
        while (job === undefined && prewarmQueueRef.current.length > 0) {
          const candidate = prewarmQueueRef.current.shift()
          if (candidate && !answersRef.current.has(candidate)) job = candidate
        }
      }
      if (job === undefined) return
      const id = ++nextIdRef.current
      textByIdRef.current.set(id, job)
      inFlightRef.current = true
      worker.postMessage({ id, text: job })
    }
    pumpRef.current = pump

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
          if (msg.type === "ready") {
            prewarmQueueRef.current = [...prewarmRef.current]
            setStatus("ready")
          }
          if (msg.type === "error") {
            setAnalyzing(false)
            setStatus("error")
          }
          if (msg.type === "result") {
            inFlightRef.current = false
            const forText = textByIdRef.current.get(msg.id)
            textByIdRef.current.delete(msg.id)
            if (forText !== undefined) {
              const failed = msg.failed || !msg.text || !msg.map || !msg.redactions
              if (!failed && msg.text && msg.map && msg.redactions) {
                const map = msg.map
                remember(forText, {
                  text: msg.text,
                  map,
                  redactions: msg.redactions,
                  restore: (s) => restore(s, map),
                })
              }
              if (latestRef.current?.text === forText) {
                latestRef.current = null
                setAnalyzing(false)
                setFailedText(failed ? forText : null)
              }
            }
            pump()
          }
        }
      })
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      workerRef.current?.terminate()
      workerRef.current = null
      pumpRef.current = () => {}
    }
  }, [activation])

  // Ask the worker to analyze (debounced) whenever the text changes. A text
  // the model has already answered for needs no request at all.
  useEffect(() => {
    if (!ready || !workerRef.current) return

    if (!text || answersRef.current.has(text)) {
      latestRef.current = null
      setAnalyzing(false)
      pumpRef.current()
      return
    }

    latestRef.current = { text, due: false }
    setAnalyzing(true)
    const timer = setTimeout(() => {
      if (latestRef.current?.text === text) latestRef.current.due = true
      pumpRef.current()
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, ready])

  return { result, status, progress, analyzing, pending }
}
