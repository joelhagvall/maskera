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
const AGGREGATE_ONLY = process.env.MASKERA_AGGREGATE_ONLY === "1"
const { corpus } = await import(CORPUS_FILE)

const { createNerRecognizer } = await import("maskera")
const recognizer = createNerRecognizer({
  model: process.env.MASKERA_MODEL ?? "maskera-sv-ner",
  dtype: process.env.MASKERA_DTYPE ?? "q4",
  device: "cpu",
  localModelPath: process.env.MASKERA_MODEL_PATH,
  allowLocalModels: true,
  allowRemoteModels: false,
  // The gold corpora keep the CoNLL-style vocabulary (PERSON/LOCATION/...)
  // even though the product default is Swedish (NAMN/PLATS/...), so map
  // explicitly instead of relying on the default.
  labelMap: (g) =>
    ({ PER: "PERSON", LOC: "LOCATION", ORG: "ORGANIZATION", ADR: "ADDRESS" })[g] ?? g,
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
const falsePositiveByRegister = new Map()
const falsePositiveByKind = new Map()
const affectedDocuments = new Set()
const allFalsePositiveByLabel = new Map()
const allFalsePositiveByKind = new Map()
const allFalsePositiveByRegister = new Map()
const allFalsePositiveByDocument = new Map()
const allAffectedDocuments = new Set()
const allFalseSpans = []

const increment = (map, key) => map.set(key, (map.get(key) ?? 0) + 1)

for (const [documentIndex, doc] of corpus.entries()) {
  const gold = resolveSpans(doc.text, doc.entities)
  const pred = await recognizer.detect(doc.text)
  const goldAdr = gold.filter((g) => g.label === "ADDRESS")
  const predAdr = pred.filter((p) => p.label === "ADDRESS")

  const usedGold = new Set()
  for (const p of pred) {
    const exactGoldIndex = gold.findIndex((g, index) => !usedGold.has(index) && sameSpan(g, p))
    if (exactGoldIndex >= 0) {
      usedGold.add(exactGoldIndex)
      continue
    }
    const overlappingGold = gold.find((g) => overlaps(g, p))
    const span = doc.text.slice(p.start, p.end)
    const kind = overlappingGold
      ? `boundary:${p.label}:gold-${overlappingGold.label}`
      : /\d/u.test(span)
        ? `extra:${p.label}:numeric`
        : `extra:${p.label}:text`
    increment(allFalsePositiveByLabel, p.label)
    increment(allFalsePositiveByKind, kind)
    increment(allFalsePositiveByRegister, doc.register ?? "unspecified")
    increment(allFalsePositiveByDocument, `${documentIndex + 1}:${p.label}:${kind}`)
    allAffectedDocuments.add(doc.text)
    allFalseSpans.push({ document: documentIndex + 1, span, label: p.label })
  }

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
      const span = doc.text.slice(p.start, p.end)
      const overlapsOtherGold = gold.find((g) => g.label !== "ADDRESS" && overlaps(g, p))
      const kind = overlapsOtherGold
        ? `label-confusion:${overlapsOtherGold.label}`
        : /\d/u.test(span)
          ? "unannotated:numeric"
          : "unannotated:text"
      adrFalsePos.push({ text: doc.text, span })
      increment(falsePositiveByRegister, doc.register ?? "unspecified")
      increment(falsePositiveByKind, kind)
      affectedDocuments.add(doc.text)
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

console.log(`documents with false ADDRESS flags: ${affectedDocuments.size}/${corpus.length}`)
for (const [kind, count] of [...falsePositiveByKind].sort()) {
  console.log(`false ADDRESS category ${kind}: ${count}`)
}
for (const [register, count] of [...falsePositiveByRegister].sort()) {
  console.log(`false ADDRESS register ${register}: ${count}`)
}
console.log(`documents with any false span: ${allAffectedDocuments.size}/${corpus.length}`)
for (const [label, count] of [...allFalsePositiveByLabel].sort()) {
  console.log(`false span predicted label ${label}: ${count}`)
}
for (const [kind, count] of [...allFalsePositiveByKind].sort()) {
  console.log(`false span category ${kind}: ${count}`)
}
for (const [register, count] of [...allFalsePositiveByRegister].sort()) {
  console.log(`false span register ${register}: ${count}`)
}
for (const [document, count] of [...allFalsePositiveByDocument].sort(
  ([left], [right]) => Number(left.split(":", 1)[0]) - Number(right.split(":", 1)[0]),
)) {
  console.log(`false span document ${document}: ${count}`)
}

if (!AGGREGATE_ONLY) {
  console.log("\n--- gold ADDRESS  ->  what the model predicted over that span ---")
  for (const s of spanDump) console.log(`  "${s.gold}"  ->  ${s.pred}`)

  if (adrFalsePos.length) {
    console.log("\n--- false ADDRESS flags (should be none) ---")
    for (const f of adrFalsePos) console.log(`  "${f.span}"  in: ${f.text}`)
  } else {
    console.log("\n--- no false ADDRESS flags on the distractor set ---")
  }

  if (allFalseSpans.length) {
    console.log("\n--- all false spans by synthetic document index ---")
    for (const item of allFalseSpans) {
      console.log(`  document ${item.document}: "${item.span}" [${item.label}]`)
    }
  }
}
