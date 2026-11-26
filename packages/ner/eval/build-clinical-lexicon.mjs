#!/usr/bin/env node
/**
 * Builds the word list for the experimental clinical lexicon filter
 * (clinical-lexicon-filter.mjs) from the Swedish code lists ICD-10-SE and
 * KVÅ: every word in a code's title, description, examples and inclusions.
 *
 * Input: a SQLite file with a `codes` table, as icd-kodhjalp builds it
 * (`bun run data:fetch && bun run data:build` there, data/codes.sqlite) from
 * eHälsomyndigheten's files. Output (gitignored, as the classifications'
 * terms of reuse are not settled for this package):
 *   training/.benchmark/clinical-lexicon.json
 *
 *   node packages/ner/eval/build-clinical-lexicon.mjs ../icd-kodhjalp/data/codes.sqlite
 *
 * Word classes:
 * - words: seen in lower case somewhere, so ordinary vocabulary. Words that
 *   are also given names, surnames or towns in the training generator's lists
 *   or in training/lexicon/homograph-first-names.txt are removed: the filter
 *   must never unmask a person or a place.
 * - eponyms: only ever capitalized, never seen in lower case (Parkinsons,
 *   Crohns, Downs): person names that are part of a diagnosis. The filter
 *   drops them only in front of a head noun, never alone.
 * - heads: the words that follow an eponym (sjukdom, syndrom, fraktur).
 * - acronyms: words written in capitals (KOL, AML, STEMI if listed).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))
const input = process.argv[2]
if (!input) throw new Error("Usage: build-clinical-lexicon.mjs <codes.sqlite>")
const output = resolve(repoRoot, "training/.benchmark/clinical-lexicon.json")

const db = new DatabaseSync(resolve(input), { readOnly: true })
const texts = []
for (const row of db.prepare("SELECT title, description, examples, includes FROM codes").all()) {
  for (const field of [row.title, row.description, row.examples, row.includes]) {
    if (!field) continue
    // List fields are JSON arrays of strings; the rest is plain text.
    const parsed = field.startsWith("[") ? safeJson(field) : null
    if (Array.isArray(parsed)) texts.push(...parsed.filter((item) => typeof item === "string"))
    else texts.push(field)
  }
}

function safeJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const WORD = /\p{L}[\p{L}'’-]*\p{L}|\p{L}/gu
const lower = new Set()
const capitalized = new Set()
const acronyms = new Set()
const followers = new Map() // capitalized word -> Set of the lower-case words after it
for (const text of texts) {
  const words = [...text.matchAll(WORD)]
  words.forEach((match, index) => {
    const word = match[0]
    if (word === word.toLowerCase()) {
      lower.add(word)
      return
    }
    if (word.length >= 2 && word.length <= 6 && word === word.toUpperCase()) {
      acronyms.add(word.toLowerCase())
      return
    }
    if (!/^\p{Lu}\p{Ll}/u.test(word)) return
    // Capitalized, at a sentence start or not: a word only counts as ordinary
    // vocabulary once it is also seen in lower case.
    const key = word.toLowerCase()
    capitalized.add(key)
    const next = words[index + 1]?.[0]
    if (next && next === next.toLowerCase()) {
      if (!followers.has(key)) followers.set(key, new Set())
      followers.get(key).add(next)
    }
  })
}

// Names and places the filter must never unmask.
const generator = readFileSync(resolve(repoRoot, "training/generate_data.mjs"), "utf8")
const listOf = (name) => {
  const match = generator.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\]`))
  return match ? [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase()) : []
}
const homographs = readFileSync(
  resolve(repoRoot, "training/lexicon/homograph-first-names.txt"),
  "utf8",
)
  .split("\n")
  .filter((line) => line && !line.startsWith("#"))
  .map((line) => line.split("\t")[0].toLowerCase())
const protectedWords = new Set(
  [
    ...listOf("FIRST"),
    ...listOf("LAST"),
    ...listOf("CITIES"),
    ...listOf("DISTRICTS"),
    ...listOf("NICKNAMES"),
    ...listOf("FOREIGN"),
    ...homographs,
  ].flatMap((name) => name.split(/[\s-]+/)),
)

const eponyms = [...capitalized].filter((word) => !lower.has(word))
const words = [...lower].filter((word) => word.length >= 3 && !protectedWords.has(word))
// What follows a capitalized-only word in the code texts: "Parkinsons sjukdom", "Downs syndrom".
const heads = new Set()
for (const [word, set] of followers)
  if (!lower.has(word)) for (const next of set) if (next.length >= 4) heads.add(next)
const acronymList = [...acronyms].filter((word) => !protectedWords.has(word))

mkdirSync(dirname(output), { recursive: true })
writeFileSync(
  output,
  `${JSON.stringify({ source: input, words: words.sort(), eponyms: eponyms.sort(), heads: [...heads].sort(), acronyms: acronymList.sort(), protectedNames: [...protectedWords].sort() })}\n`,
)
console.log(
  `${words.length} words, ${eponyms.length} eponyms, ${heads.size} heads, ${acronymList.length} acronyms, ${protectedWords.size} protected names -> ${output}`,
)
