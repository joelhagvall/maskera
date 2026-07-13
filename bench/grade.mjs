#!/usr/bin/env node
/**
 * Grade one or more systems' predictions against a gold corpus, using the SAME
 * scoring code the maskera CI gates run (packages/ner/eval/score.mjs): exact
 * character-span matching, plus "leaks" = gold entities with zero overlapping
 * prediction (the safety number).
 *
 * Usage:
 *   node bench/grade.mjs <corpus-name>            # grades every bench/out/<corpus>.<system>.json
 *   node bench/grade.mjs <corpus-name> --json     # machine-readable output (for the results doc)
 *
 * Predictions format (bench/out/<corpus>.<system>.json):
 *   { system, corpus, docs: [{ text, spans: [{start,end,label}] }] }
 * docs MUST be in corpus order; grade.mjs verifies text alignment and throws
 * on mismatch rather than silently mis-grading.
 */
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { aggregate, scoreDocument } from "../packages/ner/eval/score.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const corpusName = process.argv[2]
const asJson = process.argv.includes("--json")
if (!corpusName) {
  console.error("usage: node bench/grade.mjs <corpus-name> [--json]")
  process.exit(1)
}

const gold = JSON.parse(readFileSync(join(HERE, "corpora", `${corpusName}.json`), "utf8"))
const LABELS = ["PERSON", "LOCATION", "ORGANIZATION", "ADDRESS"]

const outDir = join(HERE, "out")
const predFiles = readdirSync(outDir)
  .filter((f) => f.startsWith(`${corpusName}.`) && f.endsWith(".json"))
  .sort()

function gradeSystem(pred) {
  if (pred.docs.length !== gold.length) {
    throw new Error(`${pred.system}: ${pred.docs.length} docs, corpus has ${gold.length}`)
  }
  const perDoc = gold.map((doc, i) => {
    if (pred.docs[i].text !== doc.text) {
      throw new Error(`${pred.system}: doc ${i} text mismatch`)
    }
    return { gold: doc.gold, spans: pred.docs[i].spans }
  })

  const overall = aggregate(perDoc.map((d) => scoreDocument(d.gold, d.spans)))

  // Per-label view: gold and predictions both filtered to the label, so a
  // system that only does PERSON (e.g. Privacy Filter) gets a fair per-class
  // number even though its overall recall is capped by missing classes.
  const perLabel = {}
  for (const label of LABELS) {
    const results = perDoc.map((d) =>
      scoreDocument(
        d.gold.filter((g) => g.label === label),
        d.spans.filter((s) => s.label === label),
      ),
    )
    const m = aggregate(results)
    if (m.support > 0 || m.predicted > 0) perLabel[label] = m
  }

  // Leak examples make failures concrete in the results doc.
  const leakExamples = []
  for (const d of perDoc) {
    const r = scoreDocument(d.gold, d.spans)
    for (const l of r.leaks) leakExamples.push({ value: l.value, label: l.label })
  }

  return { system: pred.system, overall, perLabel, leakExamples }
}

const results = predFiles.map((f) => gradeSystem(JSON.parse(readFileSync(join(outDir, f), "utf8"))))

if (asJson) {
  console.log(JSON.stringify({ corpus: corpusName, results }, null, 2))
  process.exit(0)
}

const pct = (x) => `${(x * 100).toFixed(1)}%`
console.log(
  `\n=== ${corpusName} (${gold.length} docs, ${gold.reduce((n, d) => n + d.gold.length, 0)} gold entities) ===\n`,
)
console.log("| system | precision | recall | span F1 | labeled F1 | leaks |")
console.log("| --- | ---: | ---: | ---: | ---: | ---: |")
for (const r of results) {
  const m = r.overall
  console.log(
    `| ${r.system} | ${pct(m.spanPrecision)} | ${pct(m.spanRecall)} | ${pct(m.spanF1)} | ${pct(m.labeledF1)} | ${m.leakCount} (${pct(m.leakRate)}) |`,
  )
}
for (const r of results) {
  console.log(`\n--- ${r.system} per label ---`)
  for (const [label, m] of Object.entries(r.perLabel)) {
    console.log(
      `  ${label.padEnd(13)} P ${pct(m.spanPrecision).padStart(6)}  R ${pct(m.spanRecall).padStart(6)}  leaks ${m.leakCount}/${m.support}`,
    )
  }
  if (r.leakExamples.length) {
    const shown = r.leakExamples.slice(0, 12)
    console.log(
      `  leaked: ${shown.map((l) => `"${l.value}"[${l.label}]`).join(", ")}${r.leakExamples.length > shown.length ? " …" : ""}`,
    )
  }
}
