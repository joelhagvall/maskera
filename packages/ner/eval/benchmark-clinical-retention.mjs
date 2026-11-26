#!/usr/bin/env node
/**
 * Clinical retention benchmark (over-redaction on PII-free clinical text).
 *
 * Why it exists: Kodhjälpen (icd-kodhjalp) tested maskera as the name filter
 * in front of its ICD-10-SE model on 2026-10-08. Names were caught, but on
 * short telegraphic case text the hybrid pipeline also masked diagnoses
 * ("Gonartros", "höftfraktur"), body parts as PLATS ("överarmen") and "Kvinna"
 * as NAMN, and every eponym (Parkinsons sjukdom, Colles fraktur). The clinical
 * profile barely changed that. A coding model cannot code "[NAMN_1] med
 * [NAMN_2]". benchmark-retention.mjs measures the same failure on news prose;
 * this one measures it where it hurts.
 *
 * Data: ./corpus-clinical-retention.mjs (PII-free texts, and controls that
 * must still be masked). Scores the shipped hybrid pipeline (redactWithNer),
 * rules included: on PII-free text every redaction is a false flag.
 *
 * Build first, then run from the repository root:
 *   pnpm -C packages/core build && pnpm -C packages/ner build
 *   node packages/ner/eval/benchmark-clinical-retention.mjs
 *   MASKERA_PROFILE=clinical node packages/ner/eval/benchmark-clinical-retention.mjs
 *
 * Env:
 *   MASKERA_PROFILE     general or clinical (default: general)
 *   MASKERA_REMOTE=1    load joelhagvall/maskera-sv-ner (pinned revision) from the Hugging Face Hub
 *   MASKERA_MODEL_PATH  directory containing the model folder (default: apps/demo/public/models)
 *   MASKERA_MODEL       model folder name (default: maskera-sv-ner-v19)
 *   MASKERA_DTYPE       quantization dtype (default: q4)
 *   MASKERA_LEXICON     a clinical-lexicon.json (build-clinical-lexicon.mjs): adds the
 *                       experimental clinical-lexicon-filter.mjs as detectionFilter
 *
 * Recall guard: the domain regression corpus (domain-regression/corpus, read
 * only) is run through the same pipeline, and every annotated PII string that
 * stays in clear text is a leak. A precision fix must not move that number.
 *
 * Not part of the release benchmark contract: no gate, no published number.
 * Last line is machine-readable:
 *   RESULT clean_texts=NN/MM false_flags=NN control_leaks=NN/MM domain_leaks=NN/MM profile=... lexicon=yes|no
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createNerRecognizer, redactWithNer } from "../dist/index.js"
import { createClinicalLexiconFilter } from "./clinical-lexicon-filter.mjs"

// The held-out texts are scored as their own category: rules were never tuned on them.
const corpus = [...tuned, ...heldOut]

import tuned, { controls, heldOut } from "./corpus-clinical-retention.mjs"

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))
const profile = process.env.MASKERA_PROFILE ?? "general"
const remote = process.env.MASKERA_REMOTE === "1"
const model = process.env.MASKERA_MODEL ?? "maskera-sv-ner-v19"
const modelPath = resolve(repoRoot, process.env.MASKERA_MODEL_PATH ?? "apps/demo/public/models")
const dtype = process.env.MASKERA_DTYPE ?? "q4"
const lexiconPath = process.env.MASKERA_LEXICON
const detectionFilter = lexiconPath
  ? createClinicalLexiconFilter(JSON.parse(readFileSync(resolve(lexiconPath), "utf8")))
  : undefined
const options = { profile, ...(detectionFilter ? { detectionFilter } : {}) }

if (!new Set(["general", "clinical"]).has(profile)) {
  throw new Error('MASKERA_PROFILE must be "general" or "clinical"')
}
if (!remote && !existsSync(resolve(modelPath, model, "config.json"))) {
  throw new Error(
    `Model not found at ${modelPath}/${model}. Set MASKERA_MODEL_PATH, or MASKERA_REMOTE=1.`,
  )
}

const recognizer = createNerRecognizer({
  device: "cpu",
  dtype,
  ...(remote
    ? {}
    : { model, localModelPath: modelPath, allowLocalModels: true, allowRemoteModels: false }),
})
await recognizer.ready
console.log(`Clinical retention: ${corpus.length} PII-free texts, ${controls.length} controls`)
console.log(
  `Pipeline: ${remote ? "Hub (pinned)" : model} (${dtype}, CPU), profile=${profile}, lexicon filter: ${lexiconPath ? "yes" : "no"}\n`,
)

const categories = new Map()
const flags = new Map()
let falseFlags = 0
for (const test of corpus) {
  const { text, redactions } = await redactWithNer(test.text, { recognizer, ...options })
  const category = categories.get(test.kategori) ?? { texts: 0, clean: 0 }
  category.texts++
  if (redactions.length === 0) category.clean++
  categories.set(test.kategori, category)
  falseFlags += redactions.length
  for (const r of redactions) {
    const key = `${r.value} [${r.label}]`
    flags.set(key, (flags.get(key) ?? 0) + 1)
  }
  if (redactions.length) console.log(`  ${test.id}: ${text}`)
}

let controlLeaks = 0
for (const test of controls) {
  const { text } = await redactWithNer(test.text, { recognizer, ...options })
  const leaked = test.forvantad.filter((value) => text.includes(value))
  if (leaked.length) {
    controlLeaks++
    console.log(`  LEAK ${test.id}: ${leaked.join(", ")}`)
  }
}

const domainDirectory = new URL("./domain-regression/corpus/", import.meta.url)
const domain = []
for (const file of readdirSync(domainDirectory)
  .filter((f) => f.endsWith(".mjs"))
  .sort()) {
  domain.push(...(await import(new URL(file, domainDirectory))).default)
}
let domainExpected = 0
let domainLeaks = 0
for (const test of domain) {
  const { text } = await redactWithNer(test.text, { recognizer, ...options })
  for (const value of test.forvantad) {
    domainExpected++
    if (text.includes(value)) {
      domainLeaks++
      console.log(`  DOMAIN LEAK ${test.id}: ${value}`)
    }
  }
}

const clean = [...categories.values()].reduce((sum, c) => sum + c.clean, 0)
console.log("\n=== clinical retention ===")
for (const [name, c] of categories)
  console.log(`${name.padEnd(12)} ${c.clean}/${c.texts} texts untouched`)
console.log(`false-flag spans: ${falseFlags}`)
console.log(`control leaks:    ${controlLeaks}/${controls.length}`)
console.log(
  `domain leaks:     ${domainLeaks}/${domainExpected} annotated PII strings in clear text`,
)
const top = [...flags.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
if (top.length) {
  console.log("--- most-flagged terms ---")
  for (const [term, n] of top) console.log(`  ${String(n).padStart(3)}x ${term}`)
}
console.log(
  `\nRESULT clean_texts=${clean}/${corpus.length} false_flags=${falseFlags} control_leaks=${controlLeaks}/${controls.length} domain_leaks=${domainLeaks}/${domainExpected} profile=${profile} lexicon=${lexiconPath ? "yes" : "no"}`,
)
