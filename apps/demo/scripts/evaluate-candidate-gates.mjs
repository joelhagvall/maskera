#!/usr/bin/env node
/** Aggregate-only gate over the hand-authored, synthetic marked-up corpus. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"

import { createNerRecognizer } from "maskera"

const TYPES = ["PER", "LOC", "ORG", "ADR"]
const MARKUP = /\[(PER|LOC|ORG|ADR):([^\]]+)\]/g
const MODEL = process.env.MASKERA_MODEL
const MODEL_ROOT = process.env.MASKERA_MODEL_PATH ?? resolve(process.cwd(), "../../training")
const GOLD_FILE =
  process.env.MASKERA_GOLD_FILE ?? resolve(process.cwd(), "../../training/eval/gold.txt")
const F1_FLOOR = Number(process.env.SYNTHETIC_GOLD_F1_FLOOR ?? "0.90")
const RECALL_FLOOR = Number(process.env.SYNTHETIC_GOLD_RECALL_FLOOR ?? "0.90")
const RESULT_FILE = process.env.MASKERA_RESULT_FILE

if (!MODEL) throw new Error("MASKERA_MODEL is required")

function loadGold(path) {
  const examples = []
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue
    let text = ""
    let offset = 0
    let match
    const spans = []
    MARKUP.lastIndex = 0
    while ((match = MARKUP.exec(line))) {
      text += line.slice(offset, match.index)
      const start = text.length
      text += match[2]
      spans.push({ start, end: start + match[2].length, label: match[1] })
      offset = match.index + match[0].length
    }
    text += line.slice(offset)
    examples.push({ text, spans })
  }
  return examples
}

const overlaps = (left, right) => Math.max(left.start, right.start) < Math.min(left.end, right.end)

function score(gold, predicted, typeAware) {
  const used = new Set()
  let truePositive = 0
  for (const expected of gold) {
    const index = predicted.findIndex(
      (candidate, candidateIndex) =>
        !used.has(candidateIndex) &&
        (!typeAware || candidate.label === expected.label) &&
        overlaps(candidate, expected),
    )
    if (index >= 0) {
      used.add(index)
      truePositive++
    }
  }
  return {
    truePositive,
    falsePositive: predicted.length - truePositive,
    falseNegative: gold.length - truePositive,
  }
}

function metrics(counts) {
  const precision = counts.truePositive / (counts.truePositive + counts.falsePositive || 1)
  const recall = counts.truePositive / (counts.truePositive + counts.falseNegative || 1)
  const f1 = (2 * precision * recall) / (precision + recall || 1)
  return { recall, f1 }
}

const recognizer = createNerRecognizer({
  model: MODEL,
  localModelPath: `${MODEL_ROOT}/`,
  allowLocalModels: true,
  allowRemoteModels: false,
  dtype: "q4",
  device: "cpu",
  labelMap: (label) => label,
})
await recognizer.ready

const totals = {
  typed: { truePositive: 0, falsePositive: 0, falseNegative: 0 },
  covered: { truePositive: 0, falsePositive: 0, falseNegative: 0 },
}
for (const example of loadGold(GOLD_FILE)) {
  const predicted = (await recognizer.detect(example.text))
    .filter((detection) => TYPES.includes(detection.label))
    .map(({ start, end, label }) => ({ start, end, label }))
  for (const [kind, typeAware] of [
    ["typed", true],
    ["covered", false],
  ]) {
    const counts = score(example.spans, predicted, typeAware)
    for (const key of Object.keys(counts)) totals[kind][key] += counts[key]
  }
}

const typed = metrics(totals.typed)
const covered = metrics(totals.covered)
if (RESULT_FILE) {
  const resultPath = resolve(process.cwd(), RESULT_FILE)
  mkdirSync(dirname(resultPath), { recursive: true })
  writeFileSync(
    resultPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: "synthetic-gold",
        totals,
        metrics: { typed, covered },
      },
      null,
      2,
    )}\n`,
    "utf8",
  )
  console.log(`machine result: ${resultPath}`)
}
console.log(
  `RESULT synthetic_gold type_f1=${typed.f1.toFixed(4)} type_recall=${typed.recall.toFixed(4)} masked_recall=${covered.recall.toFixed(4)}`,
)

if (typed.f1 < F1_FLOOR || covered.recall < RECALL_FLOOR) {
  console.error(
    `GATE FAIL (G2): aggregate synthetic-gold metrics below floors (type F1 ${F1_FLOOR}, masked recall ${RECALL_FLOOR})`,
  )
  process.exit(1)
}
console.log("GATE PASS (G2): aggregate synthetic-gold floors met")
