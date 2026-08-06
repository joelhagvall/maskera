#!/usr/bin/env node
/**
 * Run the shipped hybrid pipeline against the privacy-safe Swedish domain
 * regression corpus in ./corpus.
 *
 * Build first, then run from the repository root:
 *   pnpm eval:domain
 *   pnpm eval:domain:clinical
 *
 * Optional environment variables:
 *   MASKERA_MODEL_PATH  directory containing the model folder
 *   MASKERA_MODEL       model folder name (default: maskera-sv-ner-v19)
 *   MASKERA_DTYPE       quantization dtype (default: q4)
 *   MASKERA_PROFILE     general or clinical (default: general)
 *   MASKERA_HIT_FLOOR   minimum full-hit rate (default: 0.98)
 *   MASKERA_REPORT      write a detailed Markdown report to this path
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createNerRecognizer, redactWithNer } from "../../dist/index.js"

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url))
const corpusDirectory = new URL("./corpus/", import.meta.url)
const model = process.env.MASKERA_MODEL ?? "maskera-sv-ner-v19"
const modelPath = resolve(repoRoot, process.env.MASKERA_MODEL_PATH ?? "apps/demo/public/models")
const dtype = process.env.MASKERA_DTYPE ?? "q4"
const profile = process.env.MASKERA_PROFILE ?? "general"
const hitFloor = Number(process.env.MASKERA_HIT_FLOOR ?? "0.98")
const reportPath = process.env.MASKERA_REPORT
  ? resolve(repoRoot, process.env.MASKERA_REPORT)
  : undefined
const STOP_WORDS = new Set(["och", "att", "den", "det", "som", "med", "har", "ska"])
const NAME_LIKE = /^[A-ZÅÄÖ][a-zåäöé'-]+( [A-ZÅÄÖ][a-zåäöé'-]+)+$/

if (!new Set(["general", "clinical"]).has(profile)) {
  throw new Error('MASKERA_PROFILE must be "general" or "clinical"')
}
if (!Number.isFinite(hitFloor) || hitFloor < 0 || hitFloor > 1) {
  throw new Error("MASKERA_HIT_FLOOR must be a number from 0 to 1")
}

const modelConfig = resolve(modelPath, model, "config.json")
if (!existsSync(modelConfig)) {
  throw new Error(
    `Model not found at ${modelConfig}. Set MASKERA_MODEL_PATH to the directory containing ${model}/.`,
  )
}

const corpusFiles = readdirSync(corpusDirectory)
  .filter((file) => file.endsWith(".mjs"))
  .sort()
const corpus = []
for (const file of corpusFiles) {
  const module = await import(new URL(file, corpusDirectory))
  corpus.push(...module.default)
}

validateCorpus(corpus)
console.log(
  `Domain corpus: ${corpus.length} texts, ${corpusFiles.length} files, ${corpus.reduce((sum, test) => sum + test.forvantad.length, 0)} annotations`,
)
console.log(`Pipeline: ${model} (${dtype}, CPU), profile=${profile}`)

const recognizer = createNerRecognizer({
  model,
  localModelPath: modelPath,
  allowLocalModels: true,
  allowRemoteModels: false,
  device: "cpu",
  dtype,
})
await recognizer.ready

const results = []
for (const [index, test] of corpus.entries()) {
  const startedAt = performance.now()
  const { text: masked, redactions } = await redactWithNer(test.text, {
    recognizer,
    profile,
  })
  const outcome = scoreExpected(test, masked)
  const extras = classifyUnannotatedRedactions(test, redactions)
  results.push({
    test,
    masked,
    redactions,
    extras,
    ...outcome,
    durationMs: performance.now() - startedAt,
  })
  if ((index + 1) % 25 === 0 || index + 1 === corpus.length) {
    console.log(`[${index + 1}/${corpus.length}] complete`)
  }
}

const summary = summarize(results)
printSummary(summary)

if (reportPath) {
  mkdirSync(dirname(reportPath), { recursive: true })
  writeFileSync(reportPath, renderReport(summary, results), "utf8")
  console.log(`Detailed report: ${reportPath}`)
}

if (summary.hitRate < hitFloor) {
  console.error(
    `FAIL: full-hit rate ${percent(summary.hitRate)} is below the ${percent(hitFloor)} floor`,
  )
  process.exitCode = 1
} else {
  console.log(`PASS: full-hit rate meets the ${percent(hitFloor)} floor`)
}

function validateCorpus(tests) {
  if (tests.length === 0) throw new Error("Domain corpus is empty")
  const ids = new Set()
  for (const test of tests) {
    if (!test || typeof test.id !== "string" || typeof test.kategori !== "string") {
      throw new Error("Every corpus entry must have string id and kategori fields")
    }
    if (ids.has(test.id)) throw new Error(`Duplicate corpus id: ${test.id}`)
    ids.add(test.id)
    if (typeof test.text !== "string" || !Array.isArray(test.forvantad)) {
      throw new Error(`${test.id}: text must be a string and forvantad must be an array`)
    }
    if (test.forvantad.length === 0) throw new Error(`${test.id}: forvantad must not be empty`)
    for (const expected of test.forvantad) {
      if (typeof expected !== "string" || expected.length === 0) {
        throw new Error(`${test.id}: every expected value must be a non-empty string`)
      }
      if (!normalize(test.text).includes(normalize(expected))) {
        throw new Error(`${test.id}: expected value is absent from text: ${expected}`)
      }
    }
  }
}

function scoreExpected(test, masked) {
  const normalizedMasked = normalize(masked)
  const hits = []
  const partials = []
  const misses = []

  for (const expected of test.forvantad) {
    if (boundaryPattern(normalize(expected)).test(normalizedMasked)) {
      misses.push(expected)
      continue
    }
    const leakedWords = expected
      .split(/\s+/)
      .map(stripPunctuation)
      .filter((word) => word.length >= 4 && !STOP_WORDS.has(normalize(word)))
      .filter((word) => boundaryPattern(normalize(word)).test(normalizedMasked))
    if (leakedWords.length > 0) partials.push({ expected, leakedWords })
    else hits.push(expected)
  }
  return { hits, partials, misses }
}

function classifyUnannotatedRedactions(test, redactions) {
  const expectedWords = new Set(
    test.forvantad.flatMap((expected) =>
      normalize(expected)
        .split(" ")
        .map(stripPunctuation)
        .filter((word) => word.length >= 3),
    ),
  )

  return redactions
    .filter((redaction) => {
      const words = normalize(redaction.value)
        .split(" ")
        .map(stripPunctuation)
        .filter((word) => word.length >= 3)
      return !words.some((word) => expectedWords.has(word))
    })
    .map((redaction) => ({
      value: redaction.value,
      label: redaction.label,
      classification: classifyExtra(redaction),
    }))
}

function classifyExtra(redaction) {
  if (redaction.label === "POSTNUMMER") return "defensible:postcode"
  if (redaction.label === "PLATS") return "defensible:place"
  if (redaction.label === "ORGANISATION") return "defensible:organisation"
  if (redaction.label === "NAMN" && NAME_LIKE.test(redaction.value)) {
    return "defensible:name-like"
  }
  return "candidate"
}

function summarize(results) {
  const totals = {
    texts: results.length,
    annotations: 0,
    hits: 0,
    partials: 0,
    misses: 0,
    redactions: 0,
    extras: 0,
    candidates: 0,
    durationMs: 0,
  }
  const categories = new Map()

  for (const result of results) {
    const category = categories.get(result.test.kategori) ?? {
      texts: 0,
      annotations: 0,
      hits: 0,
      partials: 0,
      misses: 0,
      extras: 0,
      candidates: 0,
    }
    const annotationCount = result.test.forvantad.length
    const candidateCount = result.extras.filter(
      (extra) => extra.classification === "candidate",
    ).length
    category.texts += 1
    category.annotations += annotationCount
    category.hits += result.hits.length
    category.partials += result.partials.length
    category.misses += result.misses.length
    category.extras += result.extras.length
    category.candidates += candidateCount
    categories.set(result.test.kategori, category)

    totals.annotations += annotationCount
    totals.hits += result.hits.length
    totals.partials += result.partials.length
    totals.misses += result.misses.length
    totals.redactions += result.redactions.length
    totals.extras += result.extras.length
    totals.candidates += candidateCount
    totals.durationMs += result.durationMs
  }

  return {
    ...totals,
    hitRate: totals.hits / totals.annotations,
    categories,
  }
}

function printSummary(summary) {
  console.log("\n=== Domain regression summary ===")
  console.log(`texts:              ${summary.texts}`)
  console.log(`annotations:        ${summary.annotations}`)
  console.log(`full hits:          ${summary.hits}`)
  console.log(`partial leaks:      ${summary.partials}`)
  console.log(`clear-text misses:  ${summary.misses}`)
  console.log(`full-hit rate:      ${percent(summary.hitRate)}`)
  console.log(`redactions:         ${summary.redactions}`)
  console.log(`unannotated extras: ${summary.extras}`)
  console.log(`candidate junk*:    ${summary.candidates}`)
  console.log(`pipeline time:      ${(summary.durationMs / 1000).toFixed(1)} s`)
  console.log("\nPer category:")
  for (const [name, category] of summary.categories) {
    console.log(
      `  ${name}: ${category.hits}/${category.annotations} (${percent(category.hits / category.annotations)}), ${category.partials} partial, ${category.misses} miss, ${category.candidates} candidate junk`,
    )
  }
  console.log(
    "\n* Coarse heuristic over unannotated redactions; it is a comparison signal, not precision gold.",
  )
}

function renderReport(summary, results) {
  const lines = [
    "# Domain regression report",
    "",
    `Model: ${model} (${dtype}, CPU); profile: ${profile}; corpus: ${summary.texts} texts / ${summary.annotations} annotations.`,
    "",
    "## Summary",
    "",
    `- Full hits: **${summary.hits}**`,
    `- Partial leaks: **${summary.partials}**`,
    `- Clear-text misses: **${summary.misses}**`,
    `- Full-hit rate: **${percent(summary.hitRate)}**`,
    `- Candidate junk redactions: **${summary.candidates} / ${summary.redactions}**`,
    "",
    "Candidate junk is a coarse heuristic over unannotated redactions, not a precision-gold measurement.",
    "",
    "## Per category",
    "",
    "| category | texts | annotations | hits | partial | miss | hit rate | candidate junk |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ]
  for (const [name, category] of summary.categories) {
    lines.push(
      `| ${name} | ${category.texts} | ${category.annotations} | ${category.hits} | ${category.partials} | ${category.misses} | ${percent(category.hits / category.annotations)} | ${category.candidates} |`,
    )
  }

  lines.push("", "## Failures", "")
  const failures = results.filter(
    (result) => result.misses.length > 0 || result.partials.length > 0,
  )
  if (failures.length === 0) lines.push("None.")
  for (const result of failures) {
    for (const expected of result.misses) {
      lines.push(`- **${result.test.id}**: clear-text miss \`${expected}\``)
    }
    for (const partial of result.partials) {
      lines.push(
        `- **${result.test.id}**: partial \`${partial.expected}\`; retained: ${partial.leakedWords.map((word) => `\`${word}\``).join(", ")}`,
      )
    }
  }

  lines.push("", "## Candidate junk redactions", "")
  const candidates = results.flatMap((result) =>
    result.extras
      .filter((extra) => extra.classification === "candidate")
      .map((extra) => ({ id: result.test.id, ...extra })),
  )
  if (candidates.length === 0) lines.push("None.")
  for (const candidate of candidates) {
    lines.push(`- **${candidate.id}**: [${candidate.label}] \`${candidate.value}\``)
  }
  lines.push("")
  return lines.join("\n")
}

function normalize(value) {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}

function stripPunctuation(value) {
  return value.replace(/[.,;:!?()"']/g, "")
}

function boundaryPattern(value) {
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`,
    "u",
  )
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`
}
