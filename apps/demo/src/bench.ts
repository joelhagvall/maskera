// Browser latency bench: same recognizer config as the live demo worker
// (self-hosted model, wasm, q4), timed over the curated corpus sentences.
// Driven by scripts/bench-browser.mjs; prints one BENCH_RESULT JSON line.
import { createNerRecognizer } from "maskera"
// @ts-expect-error plain .mjs corpus without type declarations
import { corpus } from "../../../packages/ner/eval/corpus.mjs"

const texts: string[] = (corpus as Array<{ text: string }>).map((d) => d.text)
const chars = texts.reduce((n, t) => n + t.length, 0)

const params = new URLSearchParams(window.location.search)
const device = (params.get("device") ?? "wasm") as "wasm" | "webgpu"

function stats(samples: number[]) {
  const s = [...samples].sort((a, b) => a - b)
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]
  return {
    median: at(0.5),
    p95: at(0.95),
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  }
}

async function main() {
  const t0 = performance.now()
  const recognizer = createNerRecognizer({
    model: "maskera-sv-ner-v18",
    localModelPath: "/models/",
    allowLocalModels: true,
    allowRemoteModels: false,
    dtype: "q4",
    device,
  })
  await recognizer.ready
  const coldStart = performance.now() - t0

  const tFirst = performance.now()
  await recognizer.detect(texts[0])
  const firstInference = performance.now() - tFirst

  for (let i = 0; i < 10; i++) await recognizer.detect(texts[i % texts.length])

  const perText: number[] = []
  for (const t of texts) {
    const s = performance.now()
    await recognizer.detect(t)
    perText.push(performance.now() - s)
  }
  const warm = stats(perText)

  const result = {
    device,
    sentences: texts.length,
    chars,
    coldStartMs: coldStart,
    firstInferenceMs: firstInference,
    warmMedianMs: warm.median,
    warmP95Ms: warm.p95,
    warmMeanMs: warm.mean,
  }
  const out = document.querySelector("#out")
  if (out) out.textContent = JSON.stringify(result, null, 2)
  console.log(`BENCH_RESULT ${JSON.stringify(result)}`)
}

main().catch((err) => {
  const out = document.querySelector("#out")
  if (out) out.textContent = String(err)
  console.log(`BENCH_ERROR ${String(err)}`)
})
