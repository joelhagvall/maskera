#!/usr/bin/env node
/**
 * Grade the Swedish NER model against the gold corpus (./corpus.mjs) and print
 * precision / recall / F1, with an F1 floor that fails the run if the model
 * regresses below it.
 *
 * OPT-IN: this needs the actual model + the optional peer dep
 * `@huggingface/transformers`, neither of which exists in CI yet. So if either
 * is missing it prints a note and exits 0 (skip) rather than failing the build.
 * The day the model is published, wire this into a CI job that has the model
 * and it becomes a real release gate.
 *
 * Usage:
 *   pnpm -C packages/ner build                # build dist (the runner imports it)
 *   MASKERA_MODEL_PATH=/abs/path/to/models \
 *   MASKERA_MODEL=maskera-sv-ner \
 *   node packages/ner/eval/run-eval.mjs
 *
 * Env:
 *   MASKERA_MODEL_PATH  base dir that contains <MASKERA_MODEL>/ (Transformers.js localModelPath)
 *   MASKERA_MODEL       model folder/id (default: maskera-sv-ner)
 *   MASKERA_F1_FLOOR    minimum acceptable span-F1 (default: 0.80)
 *   MASKERA_DTYPE       quantization dtype (default: q4)
 */

import { corpus } from "./corpus.mjs"
import { evaluate } from "./score.mjs"

const F1_FLOOR = Number(process.env.MASKERA_F1_FLOOR ?? "0.80")
const MODEL = process.env.MASKERA_MODEL ?? "maskera-sv-ner"
const MODEL_PATH = process.env.MASKERA_MODEL_PATH
const DTYPE = process.env.MASKERA_DTYPE ?? "q4"

function skip(reason) {
  console.log(`\n⏭  eval skipped — ${reason}`)
  console.log("   (eval is opt-in until the model is published; this is not a failure)\n")
  process.exit(0)
}

// 1. Make sure the optional model runtime is actually installed.
try {
  await import("@huggingface/transformers")
} catch {
  skip('"@huggingface/transformers" is not installed')
}

// 2. Load our recognizer from the built package.
let createNerRecognizer
try {
  ;({ createNerRecognizer } = await import("@maskera/ner"))
} catch {
  skip('could not import "@maskera/ner" — run `pnpm -C packages/ner build` first')
}

if (!MODEL_PATH) {
  skip("set MASKERA_MODEL_PATH to the directory containing the model folder")
}

// 3. Build the recognizer and grade the corpus.
const recognizer = createNerRecognizer({
  model: MODEL,
  dtype: DTYPE,
  device: "cpu",
  localModelPath: MODEL_PATH,
  allowLocalModels: true,
  allowRemoteModels: false,
})

console.log(`\nLoading model "${MODEL}" (dtype=${DTYPE}) from ${MODEL_PATH} …`)
try {
  await recognizer.ready
} catch (err) {
  skip(`model failed to load: ${String(err).split("\n")[0]}`)
}

const detectCache = new Map()
async function detectAll() {
  for (const doc of corpus) {
    detectCache.set(doc.text, await recognizer.detect(doc.text))
  }
}
await detectAll()

const { metrics, perDoc } = evaluate(corpus, (text) => detectCache.get(text) ?? [])

// 4. Report.
const pct = (x) => `${(x * 100).toFixed(1)}%`
console.log("\n=== NER eval ===")
console.log(`documents:        ${corpus.length}`)
console.log(`gold entities:    ${metrics.support}`)
console.log(`model predictions:${metrics.predicted}`)
console.log("--- span-level (label-agnostic) ---")
console.log(`precision:        ${pct(metrics.spanPrecision)}`)
console.log(`recall:           ${pct(metrics.spanRecall)}`)
console.log(`F1:               ${pct(metrics.spanF1)}`)
console.log("--- labeled ---")
console.log(`F1:               ${pct(metrics.labeledF1)}`)
console.log("--- safety ---")
console.log(`leaks (missed):   ${metrics.leakCount}  (${pct(metrics.leakRate)} of gold)`)

// Show the worst offenders to make failures actionable.
const leaky = perDoc.filter((d) => d.result.leaks.length > 0)
if (leaky.length) {
  console.log("\nMissed entities (leaks):")
  for (const d of leaky) {
    for (const l of d.result.leaks) {
      console.log(`  • "${l.value}" [${l.label}]  in: ${d.doc.text}`)
    }
  }
}

// 5. Gate.
console.log(`\nF1 floor: ${pct(F1_FLOOR)}`)
if (metrics.spanF1 < F1_FLOOR) {
  console.error(`\n❌ span-F1 ${pct(metrics.spanF1)} is below the floor ${pct(F1_FLOOR)}`)
  process.exit(1)
}
console.log("✅ model meets the F1 floor\n")
