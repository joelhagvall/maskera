#!/usr/bin/env node
/**
 * Score LogosGuard and Maskera output against the same privacy-safe Swedish
 * domain corpus and the same character-survival definition. LogosGuard's
 * v2.4.4 text-file flow decodes UTF-8 as Windows-1252, so that reversible
 * mojibake is repaired before scoring. JSONL metadata is ignored; documents
 * are paired with the frozen export in order because LogosGuard may redact
 * digits inside the synthetic record IDs.
 *
 * Usage:
 *   node bench/score-logosguard-domain.mjs \
 *     tmp/logosguard-domain-1-of-2.redacted.txt \
 *     tmp/logosguard-domain-2-of-2.redacted.txt \
 *     --maskera tmp/maskera-domain.redacted.jsonl \
 *     --out docs/benchmark-logosguard-2.4.4.json
 */

import { createHash } from "node:crypto"
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const WINDOWS_1252_BYTES = new Map(
  [
    0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039,
    0x0152, 0x008d, 0x017d, 0x008f, 0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
    0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
  ].map((codePoint, index) => [codePoint, 0x80 + index]),
)

const repoRoot = fileURLToPath(new URL("../", import.meta.url))
const corpusDirectory = new URL("../packages/ner/eval/domain-regression/corpus/", import.meta.url)
const options = parseArguments(process.argv.slice(2))
const outputPath = resolve(repoRoot, options.out ?? "docs/benchmark-logosguard-2.4.4.json")
const logosGuardPaths = (
  options.positional.length > 0
    ? options.positional
    : ["tmp/logosguard-domain-1-of-2.redacted.txt", "tmp/logosguard-domain-2-of-2.redacted.txt"]
).map((file) => resolve(repoRoot, file))
const maskeraPath = resolve(repoRoot, options.maskera ?? "tmp/maskera-domain.redacted.jsonl")
const maskeraPackage = JSON.parse(
  readFileSync(resolve(repoRoot, "packages/ner/package.json"), "utf8"),
)
const maskeraArtifactFile = resolve(
  repoRoot,
  "apps/demo/public/models/maskera-sv-ner-v19/onnx/model_q4.onnx",
)
const maskeraArtifact = readFileSync(maskeraArtifactFile)

const corpusFiles = readdirSync(corpusDirectory)
  .filter((name) => name.endsWith(".mjs"))
  .sort()
  .map((name) => new URL(name, corpusDirectory))
const corpus = []
for (const file of corpusFiles) {
  const module = await import(file)
  corpus.push(...module.default)
}

const logosGuardFiles = logosGuardPaths.map((file) => ({
  file,
  contents: readFileSync(file, "utf8"),
}))
const maskeraFile = { file: maskeraPath, contents: readFileSync(maskeraPath, "utf8") }
const logosGuardPredictions = logosGuardFiles.flatMap(({ file, contents }) =>
  parseJsonLines(file, contents),
)
const maskeraPredictions = parseJsonLines(maskeraFile.file, maskeraFile.contents)

for (const [name, predictions] of [
  ["LogosGuard", logosGuardPredictions],
  ["Maskera", maskeraPredictions],
]) {
  if (predictions.length !== corpus.length) {
    throw new Error(`${name} returned ${predictions.length} documents; corpus has ${corpus.length}`)
  }
}

const maskera = scoreSystem(corpus, maskeraPredictions, {
  placeholderPattern: /\[[A-ZÅÄÖ][A-ZÅÄÖ0-9_]*_\d+\]/gu,
})
const logosGuard = scoreSystem(corpus, logosGuardPredictions, {
  placeholderPattern: /\[REDACTED:[^\]]+\]/gu,
  prepareMasked: repairMojibake,
})

const result = {
  schemaVersion: 1,
  measuredAt: "2026-08-14",
  corpus: {
    name: "Maskera privacy-safe Swedish domain regression corpus",
    sourceDirectory: "packages/ner/eval/domain-regression/corpus",
    authorCoupled: true,
    texts: corpus.length,
    annotations: corpus.reduce((sum, test) => sum + test.forvantad.length, 0),
    sha256: sha256FileSet(corpusFiles),
  },
  method: {
    input: "Two ordered JSONL-as-text chunks below LogosGuard's 50,000-character file limit",
    scoring:
      "A full hit removes every Unicode letter or digit from the annotated value; retaining some is a partial leak and retaining all is a clear-text miss.",
    encoding:
      "LogosGuard 2.4.4 returned UTF-8 input as reversible Windows-1252 mojibake; output text was restored to Unicode before scoring.",
    exclusions:
      "JSONL id and category metadata are excluded because LogosGuard also redacted digits inside record IDs.",
    precision:
      "The corpus is not exhaustively annotated for every defensible name, place or organisation, so this run does not report precision.",
  },
  systems: {
    maskera: {
      name: "Maskera",
      version: `${maskeraPackage.version} / maskera-sv-ner-v19`,
      surface: "Local JavaScript pipeline, q4 ONNX on CPU, general profile",
      artifact: {
        model: "maskera-sv-ner-v19",
        dtype: "q4",
        path: "onnx/model_q4.onnx",
        sha256: sha256(maskeraArtifact),
        bytes: maskeraArtifact.byteLength,
      },
      files: [fileMetadata(maskeraFile)],
      ...maskera,
    },
    logosguard: {
      name: "LogosGuard",
      version: "2.4.4",
      surface: "Chrome 151.0.7922.138 extension file redaction through Perplexity",
      plan: "Free",
      accuracy: "Balanced (recommended)",
      files: logosGuardFiles.map(fileMetadata),
      ...logosGuard,
    },
  },
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8")

for (const system of Object.values(result.systems)) {
  console.log(
    `${system.name} ${system.version}: ${system.totals.texts} texts / ${system.totals.annotations} annotations`,
  )
  console.log(`full hits: ${system.totals.hits} (${system.totals.fullHitRatePct}%)`)
  console.log(`partial leaks: ${system.totals.partials}`)
  console.log(`clear-text misses: ${system.totals.misses}`)
  console.log(`redactions in text fields: ${system.totals.redactions}`)
}
console.log(`result: ${relative(repoRoot, outputPath)}`)

function parseArguments(arguments_) {
  const parsed = { positional: [] }
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]
    if (argument === "--out" || argument === "--maskera") {
      const value = arguments_[index + 1]
      if (!value) throw new Error(`${argument} requires a path`)
      parsed[argument.slice(2)] = value
      index += 1
    } else {
      parsed.positional.push(argument)
    }
  }
  return parsed
}

function parseJsonLines(file, contents) {
  return contents
    .trimEnd()
    .split("\n")
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch (error) {
        throw new Error(`${relative(repoRoot, file)}:${index + 1}: invalid JSON: ${error.message}`)
      }
    })
}

function fileMetadata({ file, contents }) {
  return {
    path: relative(repoRoot, file),
    sha256: sha256(contents),
    bytes: Buffer.byteLength(contents),
  }
}

function scoreSystem(tests, predictions, options) {
  const documents = tests.map((test, index) => scoreDocument(test, predictions[index], options))
  const categories = new Map()
  const totals = {
    texts: documents.length,
    annotations: 0,
    hits: 0,
    partials: 0,
    misses: 0,
    redactions: 0,
  }

  for (const document of documents) {
    const category = categories.get(document.category) ?? {
      texts: 0,
      annotations: 0,
      hits: 0,
      partials: 0,
      misses: 0,
      redactions: 0,
    }
    category.texts += 1
    category.annotations += document.annotations.length
    category.hits += document.hits.length
    category.partials += document.partials.length
    category.misses += document.misses.length
    category.redactions += document.redactions
    categories.set(document.category, category)

    totals.annotations += document.annotations.length
    totals.hits += document.hits.length
    totals.partials += document.partials.length
    totals.misses += document.misses.length
    totals.redactions += document.redactions
  }

  return {
    totals: {
      ...totals,
      fullHitRatePct: percentNumber(totals.hits / totals.annotations),
      leakRatePct: percentNumber((totals.partials + totals.misses) / totals.annotations),
    },
    categories: Object.fromEntries(
      [...categories].map(([name, category]) => [
        name,
        { ...category, fullHitRatePct: percentNumber(category.hits / category.annotations) },
      ]),
    ),
    documents: documents.map(publicDocument),
  }
}

function publicDocument(document) {
  return {
    id: document.id,
    category: document.category,
    maskedSha256: sha256(document.masked),
    redactions: document.redactions,
    annotations: document.annotations.map(
      ({ materialCharacters, retainedCharacters, outcome }) => ({
        materialCharacters,
        retainedCharacters,
        outcome,
      }),
    ),
    hits: document.hits.length,
    partials: document.partials.length,
    misses: document.misses.length,
  }
}

function scoreDocument(test, prediction, { placeholderPattern, prepareMasked = (value) => value }) {
  if (!prediction || typeof prediction.text !== "string") {
    throw new Error(`${test.id}: prediction must contain a text string`)
  }
  const masked = prepareMasked(prediction.text)
  const surviving = survivingCharacters(test.text, masked, test.id, placeholderPattern)
  const annotations = test.forvantad.map((value) => {
    const start = fold(test.text).indexOf(fold(value))
    if (start < 0) throw new Error(`${test.id}: gold value is absent: ${value}`)
    const material = []
    for (let index = start; index < start + value.length; index += 1) {
      if (/[\p{L}\p{N}]/u.test(test.text[index])) material.push(index)
    }
    if (material.length === 0) throw new Error(`${test.id}: gold value has no material characters`)
    const retained = material.filter((index) => surviving[index]).length
    return {
      value,
      materialCharacters: material.length,
      retainedCharacters: retained,
      outcome: retained === 0 ? "hit" : retained === material.length ? "miss" : "partial",
    }
  })

  return {
    id: test.id,
    category: test.kategori,
    masked,
    redactions: [...masked.matchAll(placeholderPattern)].length,
    annotations,
    hits: annotations
      .filter((annotation) => annotation.outcome === "hit")
      .map(({ value }) => value),
    partials: annotations
      .filter((annotation) => annotation.outcome === "partial")
      .map(({ value, retainedCharacters, materialCharacters }) => ({
        value,
        retainedCharacters,
        materialCharacters,
      })),
    misses: annotations
      .filter((annotation) => annotation.outcome === "miss")
      .map(({ value }) => value),
  }
}

function survivingCharacters(original, masked, id, placeholderPattern) {
  const surviving = new Array(original.length).fill(false)
  const segments = masked.split(placeholderPattern)
  let cursor = 0

  for (const segment of segments) {
    if (segment.length === 0) continue
    const index = original.indexOf(segment, cursor)
    if (index < 0) {
      throw new Error(
        `${id}: unredacted segment no longer matches the source after index ${cursor}: ${JSON.stringify(segment.slice(0, 80))}`,
      )
    }
    for (let offset = 0; offset < segment.length; offset += 1) surviving[index + offset] = true
    cursor = index + segment.length
  }
  return surviving
}

function repairMojibake(value) {
  const bytes = []
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint <= 0xff) {
      bytes.push(codePoint)
      continue
    }
    const byte = WINDOWS_1252_BYTES.get(codePoint)
    if (byte === undefined) {
      throw new Error(`Cannot restore LogosGuard byte for ${JSON.stringify(character)}`)
    }
    bytes.push(byte)
  }
  return Buffer.from(bytes).toString("utf8")
}

function fold(value) {
  return value.normalize("NFKC").toLocaleLowerCase("sv-SE")
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex")
}

function sha256FileSet(files) {
  const hash = createHash("sha256")
  for (const file of files) {
    const path = relative(repoRoot, fileURLToPath(file))
    hash.update(path)
    hash.update("\0")
    hash.update(readFileSync(file))
    hash.update("\0")
  }
  return hash.digest("hex")
}

function percentNumber(value) {
  return (value * 100).toFixed(1)
}
