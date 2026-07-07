#!/usr/bin/env node
/**
 * ADR-focused analysis over corpus-adr.mjs. Prints the per-type breakdown the
 * generic run-eval.mjs does not: address redaction recall (masked under ANY
 * label), exact-span recall, leaks, mislabels (address tagged LOCATION etc.),
 * and ADR false positives on the distractor sentences. Dumps every gold vs
 * predicted ADDRESS span so span-boundary disagreements are visible, not hidden
 * inside an aggregate F1.
 */
import { resolveSpans } from "./score.mjs"

const CORPUS_FILE = process.env.CORPUS_FILE ?? "./corpus-adr.mjs"
const { corpus } = await import(CORPUS_FILE)

const { createNerRecognizer } = await import("maskera")
const recognizer = createNerRecognizer({
  model: process.env.MASKERA_MODEL ?? "maskera-sv-ner-v5",
  dtype: process.env.MASKERA_DTYPE ?? "q4",
  device: "cpu",
  localModelPath: process.env.MASKERA_MODEL_PATH,
  allowLocalModels: true,
  allowRemoteModels: false,
})
await recognizer.ready

const overlaps = (a, b) => a.start < b.end && b.start < a.end
const sameSpan = (a, b) => a.start === b.start && a.end === b.end

let adrGold = 0
let adrExact = 0
let adrOverlap = 0 // redaction recall: masked under any label
let adrLabeled = 0 // masked AND labeled ADDRESS
let adrLeak = 0
const adrFalsePos = [] // predicted ADDRESS not overlapping any gold ADDRESS
const spanDump = []

for (const doc of corpus) {
  const gold = resolveSpans(doc.text, doc.entities)
  const pred = await recognizer.detect(doc.text)
  const goldAdr = gold.filter((g) => g.label === "ADDRESS")
  const predAdr = pred.filter((p) => p.label === "ADDRESS")

  for (const g of goldAdr) {
    adrGold++
    const anyPred = pred.filter((p) => overlaps(g, p))
    if (anyPred.length) adrOverlap++
    else adrLeak++
    if (pred.some((p) => overlaps(g, p) && p.label === "ADDRESS")) adrLabeled++
    if (predAdr.some((p) => sameSpan(g, p))) adrExact++
    spanDump.push({
      text: doc.text,
      gold: g.value,
      pred:
        anyPred.map((p) => `${doc.text.slice(p.start, p.end)}[${p.label}]`).join(" + ") || "—MISS—",
    })
  }

  // ADR false positives: model said ADDRESS where no gold ADDRESS overlaps.
  for (const p of predAdr) {
    if (!goldAdr.some((g) => overlaps(g, p))) {
      adrFalsePos.push({ text: doc.text, span: doc.text.slice(p.start, p.end) })
    }
  }
}

const pct = (n, d) => (d === 0 ? "n/a" : `${((100 * n) / d).toFixed(1)}%`)
const adrPredTotal = adrLabeled + adrFalsePos.length

console.log("\n=== ADR (street-address) eval ===")
console.log(`address gold spans:        ${adrGold}`)
console.log(`redaction recall (any lbl):${adrOverlap}/${adrGold}  ${pct(adrOverlap, adrGold)}`)
console.log(`labeled ADDRESS recall:    ${adrLabeled}/${adrGold}  ${pct(adrLabeled, adrGold)}`)
console.log(`exact-span recall:         ${adrExact}/${adrGold}  ${pct(adrExact, adrGold)}`)
console.log(`leaks (masked nowhere):    ${adrLeak}/${adrGold}  ${pct(adrLeak, adrGold)}`)
console.log(
  `ADDRESS precision:         ${adrLabeled}/${adrPredTotal}  ${pct(adrLabeled, adrPredTotal)}  (${adrFalsePos.length} false ADDRESS flags)`,
)

console.log("\n--- gold ADDRESS  ->  what the model predicted over that span ---")
for (const s of spanDump) console.log(`  "${s.gold}"  ->  ${s.pred}`)

if (adrFalsePos.length) {
  console.log("\n--- false ADDRESS flags (should be none) ---")
  for (const f of adrFalsePos) console.log(`  "${f.span}"  in: ${f.text}`)
} else {
  console.log("\n--- no false ADDRESS flags on the distractor set ---")
}
