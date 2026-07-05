#!/usr/bin/env node
/**
 * Measure the shipped pipeline's latency: model cold start, warm per-sentence
 * inference, and the rules-only layer, on the curated corpus sentences.
 *
 * Numbers land in docs/BENCHMARKS.md (the single source of truth); run this
 * on the machine named there when updating them.
 *
 * Usage:
 *   pnpm -C packages/ner build
 *   MASKERA_REMOTE=1 node packages/ner/eval/bench-latency.mjs
 *
 * Env (same semantics as run-eval.mjs):
 *   MASKERA_REMOTE=1    load the model from the Hugging Face Hub (cached
 *                       locally after the first run; cold start below is
 *                       load-from-disk, not download)
 *   MASKERA_MODEL_PATH  local model dir (alternative to MASKERA_REMOTE)
 *   MASKERA_MODEL       model folder/id (default as in run-eval.mjs)
 *   MASKERA_DTYPE       quantization dtype (default: q4)
 *   MASKERA_DEVICE      onnxruntime device (default: cpu)
 */

import { performance } from "node:perf_hooks"
import { corpus } from "./corpus.mjs"

const REMOTE = process.env.MASKERA_REMOTE === "1"
const MODEL =
  process.env.MASKERA_MODEL ?? (REMOTE ? "joelhagvall/maskera-sv-ner" : "maskera-sv-ner")
const MODEL_PATH = process.env.MASKERA_MODEL_PATH
const DTYPE = process.env.MASKERA_DTYPE ?? "q4"
const DEVICE = process.env.MASKERA_DEVICE ?? "cpu"

const texts = corpus.map((d) => d.text)
const chars = texts.reduce((n, t) => n + t.length, 0)

function stats(samples) {
  const s = [...samples].sort((a, b) => a - b)
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]
  return {
    median: at(0.5),
    p95: at(0.95),
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  }
}

const ms = (x) => `${x.toFixed(1)} ms`

// --- Rules-only layer (@maskera/core), no model involved. ---
const { redact } = await import("@maskera/core")
{
  // Warm up the regex engines, then time whole-corpus passes.
  for (let i = 0; i < 5; i++) for (const t of texts) redact(t)
  const passes = []
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now()
    for (const t of texts) redact(t)
    passes.push(performance.now() - t0)
  }
  const perPass = stats(passes)
  console.log("=== rules only (@maskera/core redact) ===")
  console.log(`corpus:            ${texts.length} sentences, ${chars} chars`)
  console.log(`whole corpus pass: median ${ms(perPass.median)}`)
  console.log(`per sentence:      median ${(perPass.median / texts.length).toFixed(3)} ms`)
}

// --- Model pipeline (maskera). ---
const { createNerRecognizer } = await import("maskera")

console.log(`\n=== model (dtype=${DTYPE}, device=${DEVICE}) ===`)
const t0 = performance.now()
const recognizer = createNerRecognizer({
  model: MODEL,
  dtype: DTYPE,
  device: DEVICE,
  ...(REMOTE
    ? { allowRemoteModels: true }
    : { localModelPath: MODEL_PATH, allowLocalModels: true, allowRemoteModels: false }),
})
await recognizer.ready
const coldStart = performance.now() - t0
console.log(`cold start (load + init, assets in local cache): ${ms(coldStart)}`)

// First inferences after load run slower (session warmup); measure separately.
const tFirst = performance.now()
await recognizer.detect(texts[0])
console.log(`first inference:   ${ms(performance.now() - tFirst)}`)

for (let i = 0; i < 10; i++) await recognizer.detect(texts[i % texts.length])

const perText = []
for (const t of texts) {
  const s = performance.now()
  await recognizer.detect(t)
  perText.push(performance.now() - s)
}
const warm = stats(perText)
console.log(
  `warm inference:    median ${ms(warm.median)}   p95 ${ms(warm.p95)}   mean ${ms(warm.mean)}   (per sentence, n=${texts.length})`,
)
console.log(
  `avg sentence length: ${Math.round(chars / texts.length)} chars; throughput ~${Math.round(
    chars / texts.length / warm.mean,
  )} kchars/s warm`,
)
