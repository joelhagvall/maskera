#!/usr/bin/env node
/**
 * Public-term retention benchmark (over-redaction on PII-free text).
 *
 * Why it exists (docs/ROADMAP.md, v14 ruler fixes): a redaction tool that
 * masks everything scores perfect recall, so recall numbers need a paired
 * utility number. Rampart publishes private-term recall alongside public-term
 * retention (91.69%); maskera tracked precision and ADR distractors but had
 * no named retention metric. This benchmark provides it.
 *
 * Data: the sentences of the Swedish NER Corpus (klintan) test split whose
 * gold tags are ALL "0" (no PER/LOC/ORG and no MISC): real news prose that a
 * privacy filter should pass through untouched. MISC-bearing sentences are
 * excluded so ambiguity about MISC (nationalities, events) cannot count for
 * or against the model. Caveat: the corpus does not annotate ADR/structured
 * PII, so only the NER model's detections are graded (same surface as the
 * other benchmarks), not the rules layer, whose detections on unannotated
 * text could be genuine PII rather than false flags.
 *
 * Metrics:
 *   token retention  = 1 - (tokens covered by any detection / all tokens),
 *                      the headline number (comparable to Rampart's)
 *   clean sentences  = sentences with zero detections
 *   false flags      = detected spans (each an over-redaction), listed
 *
 * Fetch the test split first (gitignored):
 *   curl -fsSL https://raw.githubusercontent.com/klintan/swedish-ner-corpus/master/test_corpus.txt \
 *     -o training/.benchmark/test_corpus.txt
 *
 * Run:
 *   MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" \
 *   node packages/ner/eval/benchmark-retention.mjs
 *
 * Env:
 *   BENCHMARK_FILE     path to the CoNLL file (default training/.benchmark/test_corpus.txt)
 *   MASKERA_MODEL_PATH base dir containing the model folder (required)
 *   MASKERA_MODEL      model folder/id (default: maskera-sv-ner)
 *   MASKERA_DTYPE      dtype (default: q4)
 *   LIMIT              only score the first N PII-free sentences (default: all)
 *   LOWERCASE=1        force the text to lowercase (chat-register proxy)
 *
 * Last line is machine-readable for run-script gates:
 *   RESULT token_retention=0.9x_ clean_sentences=0.9x_ false_flags=NN/MM
 */

import fs from "node:fs"

const FILE = process.env.BENCHMARK_FILE ?? "training/.benchmark/test_corpus.txt"
const MODEL = process.env.MASKERA_MODEL ?? "maskera-sv-ner"
const MODEL_PATH = process.env.MASKERA_MODEL_PATH
const DTYPE = process.env.MASKERA_DTYPE ?? "q4"
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Number.POSITIVE_INFINITY
const LOWERCASE = process.env.LOWERCASE === "1"

function skip(reason) {
  console.log(`\nbenchmark skipped: ${reason}`)
  process.exit(0)
}

if (!fs.existsSync(FILE)) skip(`no data at ${FILE} (see this file's header for the curl command)`)
if (!MODEL_PATH) skip("set MASKERA_MODEL_PATH to the directory containing the model folder")

// --- Parse CoNLL, keep only sentences where every tag is "0" ----------------
function parse(text) {
  const sentences = []
  let toks = []
  const flush = () => {
    if (!toks.length) return
    if (toks.every(({ tag }) => tag === "0")) sentences.push(toks.map(({ token }) => token))
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
  return sentences
}

let createNerRecognizer
try {
  ;({ createNerRecognizer } = await import("maskera"))
} catch {
  skip('could not import "maskera"; run `pnpm -C packages/ner build` first')
}

const all = parse(fs.readFileSync(FILE, "utf8"))
const subset = Number.isFinite(LIMIT) ? all.slice(0, LIMIT) : all
console.log(`\nRetention benchmark: ${subset.length} PII-free sentences from ${FILE}`)
if (LOWERCASE) console.log("Mode: LOWERCASE (text forced to lowercase, chat-register proxy)")
console.log(`Loading model "${MODEL}" (dtype=${DTYPE}) from ${MODEL_PATH} ...`)
const recognizer = createNerRecognizer({
  model: MODEL,
  dtype: DTYPE,
  device: "cpu",
  localModelPath: MODEL_PATH,
  allowLocalModels: true,
  allowRemoteModels: false,
  labelMap: (g) => g,
})
try {
  await recognizer.ready
} catch (err) {
  skip(`model failed to load: ${String(err).split("\n")[0]}`)
}

let tokensTotal = 0
let tokensFlagged = 0
let cleanSentences = 0
const flags = new Map() // flagged term -> count
let flagCount = 0
for (const tokens of subset) {
  // Rebuild the sentence with token char offsets (space-joined, like the
  // klintan benchmark).
  let sentence = ""
  const positioned = tokens.map((token) => {
    const start = sentence.length
    sentence += token
    const end = sentence.length
    sentence += " "
    return { start, end }
  })
  sentence = sentence.replace(/ $/, "")
  if (LOWERCASE) sentence = sentence.toLowerCase()

  const pred = await recognizer.detect(sentence)
  tokensTotal += tokens.length
  if (!pred.length) {
    cleanSentences++
    continue
  }
  flagCount += pred.length
  for (const p of pred) {
    const term = sentence.slice(p.start, p.end)
    flags.set(`${term} [${p.label}]`, (flags.get(`${term} [${p.label}]`) ?? 0) + 1)
  }
  for (const t of positioned) {
    if (pred.some((p) => p.start < t.end && t.start < p.end)) tokensFlagged++
  }
}

const retention = 1 - tokensFlagged / tokensTotal
const clean = cleanSentences / subset.length
console.log("\n=== public-term retention (PII-free news sentences) ===")
console.log(`sentences:                ${subset.length}`)
console.log(
  `token retention:          ${(100 * retention).toFixed(2)}%  (${tokensFlagged}/${tokensTotal} tokens over-redacted)`,
)
console.log(`clean sentences:          ${cleanSentences}  (${(100 * clean).toFixed(1)}%)`)
console.log(`false-flag spans:         ${flagCount}`)
const top = [...flags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
if (top.length) {
  console.log("--- most-flagged terms ---")
  for (const [term, n] of top) console.log(`  ${String(n).padStart(3)}x ${term}`)
}
console.log(
  `\nRESULT token_retention=${retention.toFixed(4)} clean_sentences=${clean.toFixed(4)} false_flags=${flagCount}/${subset.length}`,
)
