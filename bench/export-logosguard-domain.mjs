#!/usr/bin/env node
/**
 * Export the privacy-safe domain corpus as plain-text JSONL for a LogosGuard
 * file-redaction run. Only the source text is exported; gold annotations stay
 * local and are loaded by score-logosguard-domain.mjs.
 *
 * Usage:
 *   node bench/export-logosguard-domain.mjs [output-prefix]
 */

import { mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("../", import.meta.url))
const corpusDirectory = new URL("../packages/ner/eval/domain-regression/corpus/", import.meta.url)
const outputPrefix = resolve(repoRoot, process.argv[2] ?? "tmp/logosguard-domain")
const maxChunkCharacters = 48_000

const corpus = []
for (const file of readdirSync(corpusDirectory)
  .filter((name) => name.endsWith(".mjs"))
  .sort()) {
  const module = await import(new URL(file, corpusDirectory))
  corpus.push(...module.default)
}

const ids = new Set()
for (const test of corpus) {
  if (ids.has(test.id)) throw new Error(`duplicate corpus id: ${test.id}`)
  ids.add(test.id)
  if (typeof test.text !== "string") throw new Error(`${test.id}: text must be a string`)
}

const records = corpus.map(({ id, kategori, text }) =>
  JSON.stringify({ id, category: kategori, text }),
)
const chunks = []
let current = []
let currentCharacters = 0

for (const record of records) {
  const recordCharacters = record.length + 1
  if (recordCharacters > maxChunkCharacters) {
    throw new Error(`single record exceeds LogosGuard's file limit: ${record.slice(0, 80)}`)
  }
  if (current.length > 0 && currentCharacters + recordCharacters > maxChunkCharacters) {
    chunks.push(current)
    current = []
    currentCharacters = 0
  }
  current.push(record)
  currentCharacters += recordCharacters
}
if (current.length > 0) chunks.push(current)

mkdirSync(dirname(outputPrefix), { recursive: true })
for (const [index, chunk] of chunks.entries()) {
  const outputPath = `${outputPrefix}-${index + 1}-of-${chunks.length}.txt`
  const contents = `${chunk.join("\n")}\n`
  writeFileSync(outputPath, contents, "utf8")
  console.log(`${outputPath}: ${chunk.length} texts, ${contents.length} characters`)
}

console.log(
  `total: ${corpus.length} texts, ${corpus.reduce((sum, test) => sum + test.forvantad.length, 0)} gold annotations`,
)
