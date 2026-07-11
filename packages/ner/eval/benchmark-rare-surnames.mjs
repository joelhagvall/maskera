#!/usr/bin/env node
/**
 * Rare-surname chat-register benchmark: the v13 publish gate born from the
 * v12 publish hold ("hej jag heter tjulander..." unmasked). Grades a model on
 * training/eval/rare-surnames.txt: a few hundred generated chat-register
 * sentences whose surnames are verified to DECOMPOSE under the trimmed
 * inference vocab and are absent from all training data (see
 * training/gen_rare_surname_eval.mjs).
 *
 * The safety metric is masked-at-all recall (was the surname covered by ANY
 * detection, any label); PER-typed recall is reported alongside. Per
 * docs/ROADMAP.md, a v13 candidate must BEAT v11 on this eval, not tie it.
 *
 *   MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v12-onnx \
 *   node packages/ner/eval/benchmark-rare-surnames.mjs
 *
 * Env:
 *   BENCHMARK_FILE     gold file (default training/eval/rare-surnames.txt)
 *   MASKERA_MODEL_PATH base dir containing the model folder (required)
 *   MASKERA_MODEL      model folder/id (default: maskera-sv-ner)
 *   MASKERA_DTYPE      dtype (default: q4)
 *
 * Last line is machine-readable for run-script gates:
 *   RESULT masked_recall=0.9932 per_recall=0.9864 leaks=2/294
 */
import fs from "node:fs"

const FILE = process.env.BENCHMARK_FILE ?? "training/eval/rare-surnames.txt"
const MODEL = process.env.MASKERA_MODEL ?? "maskera-sv-ner"
const MODEL_PATH = process.env.MASKERA_MODEL_PATH
const DTYPE = process.env.MASKERA_DTYPE ?? "q4"

function skip(reason) {
  console.log(`\nbenchmark skipped: ${reason}`)
  process.exit(0)
}

if (!fs.existsSync(FILE)) skip(`no data at ${FILE} (node training/gen_rare_surname_eval.mjs)`)
if (!MODEL_PATH) skip("set MASKERA_MODEL_PATH to the directory containing the model folder")

// --- parse the [PER:...] gold format (one sentence per line) ---------------
const RE = /\[(PER|LOC|ORG|ADR):([^\]]+)\]/g
const docs = []
for (const line of fs.readFileSync(FILE, "utf8").split("\n")) {
  if (!line.trim() || line.trimStart().startsWith("#")) continue
  let text = ""
  let pos = 0
  const gold = []
  RE.lastIndex = 0
  let m = RE.exec(line)
  while (m) {
    text += line.slice(pos, m.index)
    const start = text.length
    text += m[2]
    gold.push({ start, end: text.length, label: m[1], value: m[2] })
    pos = m.index + m[0].length
    m = RE.exec(line)
  }
  text += line.slice(pos)
  docs.push({ text, gold })
}

let createNerRecognizer
try {
  ;({ createNerRecognizer } = await import("maskera"))
} catch {
  skip('could not import "maskera"; run `pnpm -C packages/ner build` first')
}

console.log(`\nRare-surname benchmark: ${docs.length} sentences from ${FILE}`)
console.log(`Loading model "${MODEL}" (dtype=${DTYPE}) from ${MODEL_PATH} ...`)
const recognizer = createNerRecognizer({
  model: MODEL,
  dtype: DTYPE,
  device: "cpu",
  localModelPath: MODEL_PATH,
  allowLocalModels: true,
  allowRemoteModels: false,
  labelMap: (g) => g,
})
try {
  await recognizer.ready
} catch (err) {
  skip(`model failed to load: ${String(err).split("\n")[0]}`)
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end
let total = 0
let masked = 0
let per = 0
const leaks = []
for (const doc of docs) {
  const pred = await recognizer.detect(doc.text)
  for (const g of doc.gold) {
    total++
    const hit = pred.filter((p) => overlaps(p, g))
    if (hit.length) masked++
    else leaks.push(doc.text)
    if (hit.some((p) => p.label === "PER")) per++
  }
}

const pct = (x) => `${((100 * x) / total).toFixed(1)}%`
console.log("\n=== rare-surname chat register (decomposing, out-of-training) ===")
console.log(`gold surnames:            ${total}`)
console.log(`masked at all (safety):   ${masked}  (${pct(masked)})`)
console.log(`masked as PER (typed):    ${per}  (${pct(per)})`)
console.log(`leaks:                    ${leaks.length}  (${pct(leaks.length)})`)
if (leaks.length) {
  console.log("--- leaked sentences (first 20) ---")
  for (const l of leaks.slice(0, 20)) console.log(`  ${l}`)
}
console.log(
  `\nRESULT masked_recall=${(masked / total).toFixed(4)} per_recall=${(per / total).toFixed(4)} leaks=${leaks.length}/${total}`,
)
