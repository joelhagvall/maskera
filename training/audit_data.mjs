/** Fail fast on malformed, heavily duplicated or leaking BIO training data. */
import { readFileSync } from "node:fs"

import { assertSyntheticAddressSpans, assertTrainingRowPrivacy } from "./privacy_guard.mjs"

const TRAIN = process.argv[2] ?? "data/train.jsonl"
const VAL = process.argv[3] ?? "data/val.jsonl"
const MAX_DUP_SHARE = Number(process.env.MAX_DUP_SHARE ?? 0.02)
const MAX_OVERLAP_SHARE = Number(process.env.MAX_OVERLAP_SHARE ?? 0.01)
const VALID_TAG = /^(?:O|[BI]-(?:PER|LOC|ORG|ADR))$/

const load = (path) => {
  const rows = []
  const surfaces = new Set()
  const labels = { PER: 0, LOC: 0, ORG: 0, ADR: 0, O: 0 }
  let duplicates = 0

  for (const [lineIndex, line] of readFileSync(path, "utf8").split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    let row
    try {
      row = JSON.parse(line)
    } catch (error) {
      throw new Error(`${path}:${lineIndex + 1}: invalid JSON: ${error.message}`)
    }
    if (!Array.isArray(row.tokens) || !Array.isArray(row.tags) || row.tokens.length === 0) {
      throw new Error(`${path}:${lineIndex + 1}: tokens/tags must be non-empty arrays`)
    }
    if (row.tokens.length !== row.tags.length) {
      throw new Error(
        `${path}:${lineIndex + 1}: ${row.tokens.length} tokens != ${row.tags.length} tags`,
      )
    }
    assertTrainingRowPrivacy(row.tokens, `${path}:${lineIndex + 1}`)
    assertSyntheticAddressSpans(row.tokens, row.tags, `${path}:${lineIndex + 1}`)
    let previous = "O"
    for (const [index, tag] of row.tags.entries()) {
      if (!VALID_TAG.test(tag)) throw new Error(`${path}:${lineIndex + 1}: invalid tag ${tag}`)
      const label = tag === "O" ? "O" : tag.slice(2)
      labels[label]++
      if (tag.startsWith("I-") && previous !== label) {
        throw new Error(`${path}:${lineIndex + 1}: orphan ${tag} at token ${index}`)
      }
      previous = label
    }
    const surface = row.tokens.join(" ")
    if (surfaces.has(surface)) duplicates++
    surfaces.add(surface)
    rows.push(row)
  }
  const duplicateShare = duplicates / Math.max(1, rows.length)
  if (duplicateShare > MAX_DUP_SHARE) {
    throw new Error(
      `${path}: duplicate share ${(100 * duplicateShare).toFixed(2)}% exceeds ${(100 * MAX_DUP_SHARE).toFixed(2)}%`,
    )
  }
  return { rows, surfaces, duplicates, duplicateShare, labels }
}

const train = load(TRAIN)
const val = load(VAL)
const overlap = [...val.surfaces].filter((surface) => train.surfaces.has(surface)).length
const overlapShare = overlap / Math.max(1, val.surfaces.size)
if (overlapShare > MAX_OVERLAP_SHARE) {
  throw new Error(
    `train/val surface overlap ${(100 * overlapShare).toFixed(2)}% exceeds ${(100 * MAX_OVERLAP_SHARE).toFixed(2)}%`,
  )
}

for (const [name, data] of [
  ["train", train],
  ["validation", val],
]) {
  console.log(
    `${name}: ${data.rows.length} rows, ${data.surfaces.size} unique, ${data.duplicates} duplicates`,
  )
  console.log(`${name} labels:`, data.labels)
}
console.log(`train/validation surface overlap: ${overlap} (${(100 * overlapShare).toFixed(2)}%)`)
console.log("Data audit passed")
