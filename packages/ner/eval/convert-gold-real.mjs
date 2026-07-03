#!/usr/bin/env node
/**
 * Convert training/eval/gold-real.txt (the independent, hand-labelled set in
 * [PER:...] bracket format) into the corpus.mjs format, so run-eval.mjs can
 * grade the shipped pipeline on it:
 *
 *   node packages/ner/eval/convert-gold-real.mjs        # prints the corpus path
 *   CORPUS_FILE=<printed path> MASKERA_REMOTE=1 MASKERA_F1_FLOOR=0 MASKERA_LEAK_CEIL=1 \
 *     node packages/ner/eval/run-eval.mjs
 *
 * See docs/BENCHMARKS.md for the canonical numbers this produces.
 */
import { readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SRC = resolve(fileURLToPath(import.meta.url), "../../../../training/eval/gold-real.txt")
const OUT = join(tmpdir(), "maskera-gold-real-corpus.mjs")

const LABEL = { PER: "PERSON", LOC: "LOCATION", ORG: "ORGANIZATION" }
const TAG = /\[(PER|LOC|ORG):([^\]]+)\]/g

const corpus = []
for (const line of readFileSync(SRC, "utf8").split("\n")) {
  if (!line.trim() || line.startsWith("#")) continue
  let text = ""
  let last = 0
  const spans = []
  for (const m of line.matchAll(TAG)) {
    text += line.slice(last, m.index)
    spans.push({ start: text.length, value: m[2], label: LABEL[m[1]] })
    text += m[2]
    last = m.index + m[0].length
  }
  text += line.slice(last)
  const entities = spans.map((s) => {
    // nth = which occurrence of `value` this span is, counted the same way
    // score.mjs resolves spans (left-to-right indexOf).
    let nth = 0
    let i = text.indexOf(s.value)
    while (i !== -1 && i <= s.start) {
      nth++
      i = text.indexOf(s.value, i + 1)
    }
    return nth > 1 ? { value: s.value, label: s.label, nth } : { value: s.value, label: s.label }
  })
  corpus.push({ text, entities })
}

writeFileSync(OUT, `export const corpus = ${JSON.stringify(corpus, null, 2)}\n`)
const total = corpus.reduce((n, d) => n + d.entities.length, 0)
console.log(`${corpus.length} docs, ${total} entities`)
console.log(OUT)
