import { type RedactResult, redact } from "@maskera/core"
import { type NerRecognizer, createNerRecognizer, redactWithNer } from "@maskera/ner"
import { useEffect, useMemo, useRef, useState } from "react"
import { demoDetectors, ruleDetectors } from "./detectors"

export type NerStatus = "loading" | "ready" | "error"

export interface SwedishNer {
  /** Current redaction result — rules-only until the model is ready, then hybrid. */
  result: RedactResult
  status: NerStatus
  /** Model download progress (0–100) while loading. */
  progress: number
  /** True while the model is (re)analyzing the current text. */
  analyzing: boolean
}

/**
 * Loads our distilled Swedish model once (always on) and redacts `text`.
 * The instant rule-only result is shown while the model loads, then it upgrades
 * to the rules+model hybrid seamlessly.
 */
export function useSwedishNer(text: string): SwedishNer {
  const [status, setStatus] = useState<NerStatus>("loading")
  const [progress, setProgress] = useState(0)
  const [analyzing, setAnalyzing] = useState(false)
  const recognizerRef = useRef<NerRecognizer | null>(null)

  const ruleResult = useMemo(() => redact(text, { detectors: demoDetectors }), [text])
  const [result, setResult] = useState<RedactResult>(ruleResult)
  const ready = status === "ready"

  // Recompute the hybrid result (debounced) once the model is ready.
  useEffect(() => {
    const rec = recognizerRef.current
    if (!ready || !rec) {
      setResult(ruleResult)
      return
    }
    let cancelled = false
    setAnalyzing(true)
    const timer = setTimeout(() => {
      redactWithNer(text, { recognizer: rec, detectors: ruleDetectors })
        .then((r) => !cancelled && setResult(r))
        .catch(() => !cancelled && setResult(ruleResult))
        .finally(() => !cancelled && setAnalyzing(false))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [text, ready, ruleResult])

  // Auto-load the model once on mount.
  useEffect(() => {
    let cancelled = false
    const rec = createNerRecognizer({
      model: "maskera-sv-ner",
      localModelPath: "/models/",
      allowLocalModels: true,
      allowRemoteModels: false,
      dtype: "q8",
      device: "wasm",
      onProgress: (p) => {
        const prog = p as { status?: string; progress?: number }
        if (prog?.status === "progress" && typeof prog.progress === "number") {
          setProgress(Math.round(prog.progress))
        }
      },
    })
    recognizerRef.current = rec
    rec.ready
      .then(() => !cancelled && setStatus("ready"))
      .catch((err) => {
        console.error(err)
        if (!cancelled) {
          recognizerRef.current = null
          setStatus("error")
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { result, status, progress, analyzing }
}
