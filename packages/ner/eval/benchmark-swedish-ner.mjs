#!/usr/bin/env node
/**
 * LARGE EXTERNAL benchmark: grade maskera-sv-ner against the public Swedish NER
 * Corpus (klintan / Webbnyheter 2012) test split, authored and labeled by
 * others. Privacy-clean artifacts exclude this corpus from fine-tuning,
 * distillation, and vocabulary selection. That makes it an external measure of
 * Maskera's task-specific recipe, but not proof that related text was absent
 * from KB-BERT's earlier third-party pretraining. Always verify the evaluated
 * artifact's privacy-attestation.json before assigning it that interpretation.
 *
 * Data: CoNLL-style "token  TAG" lines, blank line between sentences, tags
 * PER / LOC / ORG / MISC and "0" for outside. Non-BIO: consecutive same-tag
 * tokens form one entity.
 *
 * Fetch the test split first (gitignored, ~2.4k sentences):
 *   curl -fsSL https://raw.githubusercontent.com/klintan/swedish-ner-corpus/master/test_corpus.txt \
 *     -o training/.benchmark/test_corpus.txt
 *
 * Then:
 *   MASKERA_REMOTE=1 node packages/ner/eval/benchmark-swedish-ner.mjs
 * or with a local model copy:
 *   MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" \
 *   node packages/ner/eval/benchmark-swedish-ner.mjs
 *
 * Env:
 *   BENCHMARK_FILE     path to the CoNLL file (default training/.benchmark/test_corpus.txt)
 *   MASKERA_REMOTE=1   load MASKERA_MODEL from the Hugging Face Hub instead of
 *                      MASKERA_MODEL_PATH (defaults the model to joelhagvall/maskera-sv-ner)
 *   MASKERA_MODEL_PATH base dir containing the model folder (required unless MASKERA_REMOTE=1)
 *   MASKERA_MODEL      model folder/id (default: maskera-sv-ner, or the Hub id above)
 *   MASKERA_DTYPE      dtype (default: q4)
 *   LIMIT              only score the first N sentences (default: all)
 *   LOWERCASE=1        grade the corpus forced to lowercase (chat-register proxy)
 *
 * NOTE on fairness: MISC is outside our label space (we do PER/LOC/ORG only).
 * Model predictions overlapping a gold MISC span are dropped before scoring, so
 * MISC neither helps recall nor hurts precision. This is the only adjustment.
 */

import fs from "node:fs"
import { aggregate, scoreDocument } from "./score.mjs"

const FILE = process.env.BENCHMARK_FILE ?? "training/.benchmark/test_corpus.txt"
const REMOTE = process.env.MASKERA_REMOTE === "1"
const MODEL =
  process.env.MASKERA_MODEL ?? (REMOTE ? "joelhagvall/maskera-sv-ner" : "maskera-sv-ner")
const MODEL_PATH = process.env.MASKERA_MODEL_PATH
const DTYPE = process.env.MASKERA_DTYPE ?? "q4"
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Number.POSITIVE_INFINITY
// LOWERCASE=1 grades the model on the SAME corpus forced to lowercase, a proxy
// for the chat/support register maskera targets. Gold char spans are unchanged
// (toLowerCase preserves length for Latin/Swedish letters), so scoring still
// lines up. Run it alongside the cased pass and compare, per docs/BENCHMARKS.md
// "Error analysis" (lowercase is the biggest leak).
const LOWERCASE = process.env.LOWERCASE === "1"

const TAG_TO_LABEL = { PER: "PERSON", LOC: "LOCATION", ORG: "ORGANIZATION" }

function skip(reason) {
  console.log(`\nbenchmark skipped: ${reason}`)
  process.exit(0)
}

if (!fs.existsSync(FILE)) {
  skip(`no data at ${FILE} (see this file's header for the curl command)`)
}

// --- Parse CoNLL into docs with PER/LOC/ORG spans + separate MISC spans ----
function parse(text) {
  const docs = []
  let toks = [] // { token, tag }
  const flush = () => {
    if (!toks.length) return
    let sentence = ""
    const positioned = toks.map(({ token, tag }) => {
      const start = sentence.length
      sentence += token
      const end = sentence.length
      sentence += " "
      return { start, end, tag }
    })
    sentence = sentence.replace(/ $/, "")

    // Merge consecutive same-tag tokens into entities.
    const gold = []
    const misc = []
    let i = 0
    while (i < positioned.length) {
      const { tag } = positioned[i]
      if (tag === "0") {
        i++
        continue
      }
      let j = i
      while (j + 1 < positioned.length && positioned[j + 1].tag === tag) j++
      const span = { start: positioned[i].start, end: positioned[j].end }
      if (tag === "MISC") misc.push(span)
      else if (TAG_TO_LABEL[tag]) gold.push({ ...span, label: TAG_TO_LABEL[tag] })
      i = j + 1
    }
    docs.push({ text: sentence, gold, misc })
    toks = []
  }

  for (const ln of text.split(/\r?\n/)) {
    if (ln.trim() === "") {
      flush()
      continue
    }
    const parts = ln.trim().split(/\s+/)
    const tag = parts[parts.length - 1]
    const token = parts.slice(0, -1).join(" ")
    if (token) toks.push({ token, tag })
  }
  flush()
  return docs
}

const overlapsAny = (s, spans) => spans.some((m) => s.start < m.end && m.start < s.end)

// --- Load model ------------------------------------------------------------
try {
  await import("@huggingface/transformers")
} catch {
  skip('"@huggingface/transformers" is not installed')
}
let createNerRecognizer
try {
  ;({ createNerRecognizer } = await import("maskera"))
} catch {
  skip('could not import "maskera"; run `pnpm -C packages/ner build` first')
}
if (!MODEL_PATH && !REMOTE)
  skip("set MASKERA_MODEL_PATH to the directory containing the model folder, or MASKERA_REMOTE=1")

const docs = parse(fs.readFileSync(FILE, "utf8")).filter((d) => d.text.trim())
const subset = Number.isFinite(LIMIT) ? docs.slice(0, LIMIT) : docs
const totalGold = subset.reduce((n, d) => n + d.gold.length, 0)

console.log(`\nBenchmark: ${subset.length} sentences, ${totalGold} PER/LOC/ORG entities`)
if (LOWERCASE) console.log("Mode: LOWERCASE (text forced to lowercase, chat-register proxy)")
console.log(
  `Loading model "${MODEL}" (dtype=${DTYPE}) from ${REMOTE ? "the HF Hub" : MODEL_PATH} ...`,
)

const recognizer = createNerRecognizer({
  model: MODEL,
  dtype: DTYPE,
  device: "cpu",
  ...(REMOTE
    ? { allowRemoteModels: true }
    : { localModelPath: MODEL_PATH, allowLocalModels: true, allowRemoteModels: false }),
  minScore: process.env.MIN_SCORE ? Number(process.env.MIN_SCORE) : 0.5,
  // Gold uses the CoNLL-style vocabulary (see TAG_TO_LABEL); the product
  // default is Swedish (NAMN/PLATS/...), so map explicitly.
  labelMap: (g) =>
    ({ PER: "PERSON", LOC: "LOCATION", ORG: "ORGANIZATION", ADR: "ADDRESS" })[g] ?? g,
})
try {
  await recognizer.ready
} catch (err) {
  skip(`model failed to load: ${String(err).split("\n")[0]}`)
}

// --- Run + score -----------------------------------------------------------
const perLabel = {
  PERSON: { gold: 0, found: 0 },
  LOCATION: { gold: 0, found: 0 },
  ORGANIZATION: { gold: 0, found: 0 },
}
const results = []
let done = 0
for (const doc of subset) {
  const input = LOWERCASE ? doc.text.toLowerCase() : doc.text
  const predRaw = await recognizer.detect(input)
  // Fairness: drop predictions that overlap a gold MISC span (out of our scope).
  const pred = predRaw.filter((p) => !overlapsAny(p, doc.misc))
  const r = scoreDocument(doc.gold, pred)
  results.push(r)

  // Per-label recall (did any prediction exactly match each gold entity?).
  for (const g of doc.gold) {
    perLabel[g.label].gold++
    if (pred.some((p) => p.start === g.start && p.end === g.end)) perLabel[g.label].found++
  }

  if (++done % 500 === 0) console.log(`  ...${done}/${subset.length}`)
}

const m = aggregate(results)
const pct = (x) => `${(x * 100).toFixed(1)}%`

console.log(
  `\n=== Swedish NER Corpus test split (large external benchmark)${LOWERCASE ? " [LOWERCASED]" : ""} ===`,
)
console.log(`sentences:        ${subset.length}`)
console.log(`gold entities:    ${m.support}`)
console.log(`model predictions:${m.predicted}`)
console.log("--- span-level (label-agnostic) ---")
console.log(`precision:        ${pct(m.spanPrecision)}`)
console.log(`recall:           ${pct(m.spanRecall)}`)
console.log(`F1:               ${pct(m.spanF1)}`)
console.log("--- labeled ---")
console.log(`F1:               ${pct(m.labeledF1)}`)
console.log("--- safety ---")
console.log(`leaks (missed):   ${m.leakCount}  (${pct(m.leakRate)} of gold)`)
console.log("--- recall by type (exact span) ---")
for (const [label, c] of Object.entries(perLabel)) {
  console.log(`${label.padEnd(13)} ${pct(c.gold ? c.found / c.gold : 1)}  (${c.found}/${c.gold})`)
}
console.log("\nNote: a larger, messier held-out set than our own. In-distribution (we")
console.log("trained on this corpus's train split), so lower than curated and NOT a")
console.log("clean independent number; see docs/BENCHMARKS.md.\n")
