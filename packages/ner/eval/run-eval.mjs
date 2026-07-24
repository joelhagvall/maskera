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
 *   MASKERA_REMOTE=1    load MASKERA_MODEL from the Hugging Face Hub instead of
 *                       MASKERA_MODEL_PATH (what CI uses; defaults the model to
 *                       joelhagvall/maskera-sv-ner)
 *   MASKERA_MODEL       model folder/id (default: maskera-sv-ner, or the Hub id above)
 *   MASKERA_REVISION    Hub revision to grade (default: the sha the package pins,
 *                       i.e. what consumers actually download). Set to "main" to
 *                       grade whatever currently sits on the Hub instead, which
 *                       is what the weekly canary needs in order to catch a bad
 *                       upload: the pin deliberately hides one from consumers.
 *   MASKERA_F1_FLOOR    minimum acceptable span-F1 (default: 0.80)
 *   MASKERA_LEAK_CEIL   maximum acceptable leak rate, the share of gold entities
 *                       with zero overlapping prediction (default: 0.08)
 *   MASKERA_DTYPE       quantization dtype (default: q4)
 */

import { evaluate } from "./score.mjs"

// Default to the bundled gold corpus, or point CORPUS_FILE at your own domain
// set (see corpus-domain.template.mjs) to grade the model on YOUR real text.
const CORPUS_FILE = process.env.CORPUS_FILE ?? "./corpus.mjs"
const { corpus } = await import(CORPUS_FILE)

const F1_FLOOR = Number(process.env.MASKERA_F1_FLOOR ?? "0.80")
const LEAK_CEIL = Number(process.env.MASKERA_LEAK_CEIL ?? "0.08")
const REMOTE = process.env.MASKERA_REMOTE === "1"
const MODEL =
  process.env.MASKERA_MODEL ?? (REMOTE ? "joelhagvall/maskera-sv-ner" : "maskera-sv-ner")
const MODEL_PATH = process.env.MASKERA_MODEL_PATH
const DTYPE = process.env.MASKERA_DTYPE ?? "q4"
const REVISION = process.env.MASKERA_REVISION

function skip(reason) {
  console.log(`\n⏭  eval skipped: ${reason}`)
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
  ;({ createNerRecognizer } = await import("maskera"))
} catch {
  skip('could not import "maskera": run `pnpm -C packages/ner build` first')
}

if (!MODEL_PATH && !REMOTE) {
  skip("set MASKERA_MODEL_PATH to the directory containing the model folder, or MASKERA_REMOTE=1")
}

// 3. Build the recognizer and grade the corpus.
const recognizer = createNerRecognizer({
  model: MODEL,
  dtype: DTYPE,
  device: "cpu",
  ...(REMOTE
    ? { allowRemoteModels: true, ...(REVISION ? { revision: REVISION } : {}) }
    : { localModelPath: MODEL_PATH, allowLocalModels: true, allowRemoteModels: false }),
  // The gold corpora keep the CoNLL-style vocabulary (PERSON/LOCATION/...)
  // even though the product default is Swedish (NAMN/PLATS/...), so map
  // explicitly instead of relying on the default.
  labelMap: (g) =>
    ({ PER: "PERSON", LOC: "LOCATION", ORG: "ORGANIZATION", ADR: "ADDRESS" })[g] ?? g,
})

// Name the revision in the log: "the gate passed" means nothing without
// knowing whether it graded the pinned weights or the Hub's current head.
const source = REMOTE ? `the HF Hub @ ${REVISION ?? "the pinned revision"}` : MODEL_PATH
console.log(`\nLoading model "${MODEL}" (dtype=${DTYPE}) from ${source} …`)
try {
  await recognizer.ready
} catch (err) {
  if (REMOTE) {
    // In CI the model MUST load: a broken Hub artifact is exactly what the
    // canary exists to catch.
    console.error(`\n❌ model failed to load from the Hub: ${String(err)}`)
    process.exit(1)
  }
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

// 5. Gate: F1 floor for overall quality, leak ceiling for safety. A model can
// hold its F1 while starting to miss a class of entities entirely; the leak
// gate is what catches that.
console.log(`\nF1 floor: ${pct(F1_FLOOR)}   leak ceiling: ${pct(LEAK_CEIL)}`)
let failed = false
if (metrics.spanF1 < F1_FLOOR) {
  console.error(`❌ span-F1 ${pct(metrics.spanF1)} is below the floor ${pct(F1_FLOOR)}`)
  failed = true
}
if (metrics.leakRate > LEAK_CEIL) {
  console.error(`❌ leak rate ${pct(metrics.leakRate)} exceeds the ceiling ${pct(LEAK_CEIL)}`)
  failed = true
}
if (failed) process.exit(1)
console.log("✅ model meets the F1 floor and leak ceiling\n")
