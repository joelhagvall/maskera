#!/usr/bin/env node
/**
 * Validate the provenance and annotation shape of an independently authored
 * fictional gold corpus before Maskera ever runs against it.
 *
 * Usage:
 *   node scripts/check-independent-gold.mjs packages/ner/eval/corpus-stage2.mjs
 *   node scripts/check-independent-gold.mjs packages/ner/eval/corpus-stage2.mjs --freeze
 *
 * Draft mode validates every row. Freeze mode additionally enforces the
 * public benchmark bar: 200+ rows, 3+ writers, target-register coverage and
 * a blind second pass over at least 20% of rows.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const ALLOWED_LABELS = new Set(["PERSON", "LOCATION", "ORGANIZATION", "ADDRESS"])
const ALLOWED_REGISTERS = new Set(["support", "healthcare", "authority", "everyday"])
const REQUIRED_FREEZE_REGISTERS = new Set(["support", "healthcare", "authority"])
const SYNTHETIC_ADDRESS_MARKER =
  /(?:masker|påhitt|provdata|fiktiv|syntet|testkorpus|exempeldata|nollpost)/iu
const REQUIRED_PROVENANCE = [
  "independentlyAuthored",
  "fictional",
  "annotatedBeforeModelRun",
  "excludedFromTraining",
]

function occurrenceIndex(text, value, nth) {
  let from = 0
  let index = -1
  for (let occurrence = 0; occurrence < nth; occurrence++) {
    index = text.indexOf(value, from)
    if (index < 0) return -1
    from = index + 1
  }
  return index
}

function validIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
}

export function validateIndependentGold({ corpus, provenance, freeze = false }) {
  const issues = []
  const issue = (location, message) => issues.push(`${location}: ${message}`)

  if (!provenance || typeof provenance !== "object") {
    issue("provenance", "missing corpus-level provenance declaration")
  } else {
    for (const field of REQUIRED_PROVENANCE) {
      if (provenance[field] !== true) issue(`provenance.${field}`, "must be true")
    }
    if (provenance.writersSawModelOutput !== false) {
      issue("provenance.writersSawModelOutput", "must be false")
    }
    if (freeze && !validIsoDate(provenance.frozenAt)) {
      issue("provenance.frozenAt", "must be an ISO date in freeze mode")
    }
  }

  if (!Array.isArray(corpus)) {
    issue("corpus", "must be an array")
    return issues
  }

  const writers = new Set()
  const registers = new Set()
  const normalizedTexts = new Set()
  let secondReviewed = 0

  for (const [index, doc] of corpus.entries()) {
    const location = `corpus[${index}]`
    if (!doc || typeof doc !== "object") {
      issue(location, "must be an object")
      continue
    }
    if (typeof doc.text !== "string" || doc.text.trim() === "") {
      issue(`${location}.text`, "must be a non-empty string")
    } else {
      const normalized = doc.text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()
      if (normalizedTexts.has(normalized)) issue(`${location}.text`, "duplicates another row")
      normalizedTexts.add(normalized)
    }
    if (typeof doc.writer !== "string" || !/^W[A-Z0-9_-]+$/i.test(doc.writer)) {
      issue(`${location}.writer`, "must be an anonymised id such as W1")
    } else {
      writers.add(doc.writer)
    }
    if (!ALLOWED_REGISTERS.has(doc.register)) {
      issue(`${location}.register`, "must be support, healthcare, authority or everyday")
    } else {
      registers.add(doc.register)
    }
    if (!validIsoDate(doc.collected)) {
      issue(`${location}.collected`, "must be an ISO date")
    }
    if (typeof doc.secondReviewed !== "boolean") {
      issue(`${location}.secondReviewed`, "must be an explicit boolean")
    } else if (doc.secondReviewed) {
      secondReviewed++
    }
    if (!Array.isArray(doc.entities)) {
      issue(`${location}.entities`, "must be an array")
      continue
    }

    const spans = []
    for (const [entityIndex, entity] of doc.entities.entries()) {
      const entityLocation = `${location}.entities[${entityIndex}]`
      if (!entity || typeof entity !== "object") {
        issue(entityLocation, "must be an object")
        continue
      }
      if (typeof entity.value !== "string" || entity.value === "") {
        issue(`${entityLocation}.value`, "must be a non-empty exact substring")
        continue
      }
      if (!ALLOWED_LABELS.has(entity.label)) {
        issue(`${entityLocation}.label`, "must be PERSON, LOCATION, ORGANIZATION or ADDRESS")
      }
      const nth = entity.nth ?? 1
      if (!Number.isInteger(nth) || nth < 1) {
        issue(`${entityLocation}.nth`, "must be a positive integer")
        continue
      }
      const start = typeof doc.text === "string" ? occurrenceIndex(doc.text, entity.value, nth) : -1
      if (start < 0) {
        issue(entityLocation, "annotated value/occurrence is absent from text")
        continue
      }
      const end = start + entity.value.length
      if (spans.some((span) => start < span.end && span.start < end)) {
        issue(entityLocation, "overlaps another gold entity")
      }
      spans.push({ start, end })
      if (entity.label === "ADDRESS" && !SYNTHETIC_ADDRESS_MARKER.test(entity.value)) {
        issue(entityLocation, "ADDRESS lacks a conspicuous synthetic marker")
      }
    }
  }

  if (freeze) {
    if (corpus.length < 200) issue("corpus", "freeze mode requires at least 200 rows")
    if (writers.size < 3) issue("corpus", "freeze mode requires at least 3 writers")
    for (const register of REQUIRED_FREEZE_REGISTERS) {
      if (!registers.has(register)) issue("corpus", `freeze mode requires register ${register}`)
    }
    if (secondReviewed < Math.ceil(corpus.length * 0.2)) {
      issue("corpus", "freeze mode requires blind second review of at least 20% of rows")
    }
  }

  return issues
}

async function main() {
  const args = process.argv.slice(2)
  const freeze = args.includes("--freeze")
  const file = args.find((arg) => !arg.startsWith("--"))
  if (!file) {
    console.error("usage: node scripts/check-independent-gold.mjs <corpus.mjs> [--freeze]")
    process.exitCode = 1
    return
  }

  const absoluteFile = resolve(file)
  const { corpus, provenance } = await import(pathToFileURL(absoluteFile).href)
  const issues = validateIndependentGold({ corpus, provenance, freeze })
  if (issues.length > 0) {
    console.error("Independent gold corpus validation failed:\n")
    for (const issue of issues) console.error(`- ${issue}`)
    process.exitCode = 1
    return
  }

  const fixtureChecker = fileURLToPath(new URL("./check-fixture-identifiers.mjs", import.meta.url))
  execFileSync(process.execPath, [fixtureChecker, absoluteFile], { stdio: "inherit" })
  console.log(`independent gold: ${corpus.length} rows pass ${freeze ? "freeze" : "draft"} checks`)
  if (freeze) {
    const digest = createHash("sha256").update(readFileSync(absoluteFile)).digest("hex")
    console.log(`frozen corpus sha256: ${digest}`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
