#!/usr/bin/env node
/**
 * Export the gold sets to plain JSON with resolved character spans, so that
 * non-Node systems (Presidio via Python, etc.) can read the exact same corpora
 * the maskera eval harness grades against.
 *
 * Output: bench/corpora/<name>.json = [{ text, gold: [{start,end,label,value}] }]
 *
 * Sources (single source of truth, never copied):
 *   - curated:   packages/ner/eval/corpus.mjs
 *   - adr:       packages/ner/eval/corpus-adr.mjs
 *   - gold-real: training/eval/gold-real.txt via the existing converter
 */
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { resolveSpans } from "../packages/ner/eval/score.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..")
const OUT_DIR = join(HERE, "corpora")
mkdirSync(OUT_DIR, { recursive: true })

const sets = [
  { name: "curated", file: join(ROOT, "packages/ner/eval/corpus.mjs") },
  { name: "adr", file: join(ROOT, "packages/ner/eval/corpus-adr.mjs") },
]

// gold-real goes through the existing converter; its last stdout line is the
// path of the generated corpus module.
const convLines = execFileSync("node", [join(ROOT, "packages/ner/eval/convert-gold-real.mjs")], {
  encoding: "utf8",
})
  .trim()
  .split("\n")
sets.push({ name: "gold-real", file: convLines[convLines.length - 1] })

for (const { name, file } of sets) {
  const { corpus } = await import(file)
  const docs = corpus.map((d) => ({ text: d.text, gold: resolveSpans(d.text, d.entities) }))
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(docs, null, 1))
  const entities = docs.reduce((n, d) => n + d.gold.length, 0)
  console.log(`${name}: ${docs.length} docs, ${entities} entities`)
}
