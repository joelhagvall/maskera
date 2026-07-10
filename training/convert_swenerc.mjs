/**
 * Convert the manually annotated Swe-NERC v1 TSV corpus to maskera BIO JSONL.
 *
 * Swe-NERC adds Swedish forum, blog, child-health, medical-journal, news and
 * Wikipedia registers. We keep its PRS/LOC/GRO labels and map the remaining
 * semantic classes (time, symptom, treatment, event, work/product) to O because
 * they are outside maskera's PII label scheme.
 *
 * Source: Språkbanken Text, Swe-NERC v1, CC BY 4.0.
 * https://doi.org/10.23695/322q-rd36
 *
 * Usage: node convert_swenerc.mjs [srcTsv] [trainJsonl] [valJsonl]
 */
import { appendFileSync, readFileSync } from "node:fs"

const SRC = process.argv[2] ?? ".benchmark/swe_nerc_v1.tsv"
const TRAIN_DEST = process.argv[3] ?? "data/train.jsonl"
const VAL_DEST = process.argv[4] ?? "data/val.jsonl"
const DEV_SHARE = Number(process.env.SWENERC_DEV_SHARE ?? 0.1)

if (!Number.isFinite(DEV_SHARE) || DEV_SHARE < 0 || DEV_SHARE >= 1) {
  throw new Error(`SWENERC_DEV_SHARE must be a number in [0, 1); got ${DEV_SHARE}`)
}

const LABEL_MAP = new Map([
  ["PRS", "PER"],
  ["LOC", "LOC"],
  ["GRO", "ORG"],
])

const hash01 = (value) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 2 ** 32
}

const trainOut = []
const valOut = []
let sentenceTokens = []
let sentenceLabels = []
let sentenceCount = 0

const flush = () => {
  if (!sentenceTokens.length) return
  const tags = []
  let previous = "O"
  for (const sourceLabel of sentenceLabels) {
    const label = LABEL_MAP.get(sourceLabel) ?? "O"
    if (label === "O") tags.push("O")
    else tags.push(`${label === previous ? "I" : "B"}-${label}`)
    previous = label
  }
  const serialized = JSON.stringify({ tokens: sentenceTokens, tags })
  const splitKey = `${sentenceCount}\u001f${sentenceTokens.join("\u001f")}`
  if (hash01(splitKey) < DEV_SHARE) valOut.push(serialized)
  else trainOut.push(serialized)
  sentenceCount++
  sentenceTokens = []
  sentenceLabels = []
}

for (const [lineIndex, line] of readFileSync(SRC, "utf8").split(/\r?\n/).entries()) {
  if (!line.trim()) {
    flush()
    continue
  }
  const fields = line.split("\t")
  if (fields.length < 2 || !fields[0] || !fields[1]) {
    throw new Error(`${SRC}:${lineIndex + 1}: expected tab-separated token and label`)
  }
  sentenceTokens.push(fields[0])
  sentenceLabels.push(fields[1].trim())
}
flush()

if (trainOut.length) appendFileSync(TRAIN_DEST, `${trainOut.join("\n")}\n`)
if (valOut.length) appendFileSync(VAL_DEST, `${valOut.join("\n")}\n`)

const countEntities = (rows) =>
  rows.reduce(
    (total, row) => total + JSON.parse(row).tags.filter((tag) => tag.startsWith("B-")).length,
    0,
  )

console.log(
  `Appended ${trainOut.length} Swe-NERC train sentences (${countEntities(trainOut)} entities) -> ${TRAIN_DEST}`,
)
console.log(
  `Appended ${valOut.length} Swe-NERC held-out dev sentences (${countEntities(valOut)} entities) -> ${VAL_DEST}`,
)
