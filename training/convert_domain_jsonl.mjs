/**
 * Validate and append annotated target-domain text to maskera's BIO JSONL.
 *
 * Input: one JSON object per line:
 *   {
 *     "id": "support-001",
 *     "text": "hej jag heter nadia saleh och bor i malmö",
 *     "entities": [
 *       { "start": 15, "end": 26, "label": "PERSON", "value": "nadia saleh" },
 *       { "start": 36, "end": 41, "label": "LOCATION", "value": "malmö" }
 *     ]
 *   }
 *
 * Labels may use either public names (PERSON/LOCATION/ORGANIZATION/ADDRESS) or
 * training names (PER/LOC/ORG/ADR). `value` is optional but recommended: when
 * present it protects against stale character offsets. Set the optional
 * `group` field to a conversation/ticket id so related messages cannot be split
 * across training and development.
 *
 * The input must be lawful to use: donated/invented text, consented private
 * data kept private, or already-lawfully-public material. Never feed the gold
 * eval corpus to this script.
 *
 * Usage:
 *   node convert_domain_jsonl.mjs [input] [trainJsonl] [valJsonl]
 */
import { appendFileSync, readFileSync } from "node:fs"

const SRC = process.argv[2] ?? "domain-data/annotated.jsonl"
const TRAIN_DEST = process.argv[3] ?? "data/train.jsonl"
const VAL_DEST = process.argv[4] ?? "data/val.jsonl"
const DEV_SHARE = Number(process.env.DOMAIN_DEV_SHARE ?? 0.2)

if (!Number.isFinite(DEV_SHARE) || DEV_SHARE < 0 || DEV_SHARE >= 1) {
  throw new Error(`DOMAIN_DEV_SHARE must be a number in [0, 1); got ${DEV_SHARE}`)
}

const LABELS = new Map([
  ["PER", "PER"],
  ["PERSON", "PER"],
  ["LOC", "LOC"],
  ["LOCATION", "LOC"],
  ["ORG", "ORG"],
  ["ORGANIZATION", "ORG"],
  ["ORGANISATION", "ORG"],
  ["ADR", "ADR"],
  ["ADDRESS", "ADR"],
  ["ADRESS", "ADR"],
])

const hash01 = (value) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 2 ** 32
}

// Words/numbers stay intact; punctuation becomes its own word-level token.
// The model's WordPiece tokenizer may split these further during training.
const tokenize = (text) => {
  const tokens = []
  const pattern = /[\p{L}\p{M}\p{N}]+(?:[-'’][\p{L}\p{M}\p{N}]+)*|[^\s]/gu
  for (const match of text.matchAll(pattern)) {
    tokens.push({ value: match[0], start: match.index, end: match.index + match[0].length })
  }
  return tokens
}

const trainOut = []
const valOut = []
const converted = []
const seenTexts = new Set()
let entityCount = 0

const lines = readFileSync(SRC, "utf8").split(/\r?\n/)
for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
  const raw = lines[lineIndex]
  if (!raw?.trim()) continue

  let doc
  try {
    doc = JSON.parse(raw)
  } catch (error) {
    throw new Error(`${SRC}:${lineIndex + 1}: invalid JSON: ${error.message}`)
  }
  const where = `${SRC}:${lineIndex + 1}${doc.id ? ` (${doc.id})` : ""}`
  if (typeof doc.text !== "string" || !doc.text.trim()) {
    throw new Error(`${where}: text must be a non-empty string`)
  }
  if (!Array.isArray(doc.entities)) {
    throw new Error(`${where}: entities must be an array (use [] for a hard negative)`)
  }
  if (seenTexts.has(doc.text)) throw new Error(`${where}: duplicate text`)
  seenTexts.add(doc.text)

  const entities = doc.entities
    .map((entity, entityIndex) => {
      const label = LABELS.get(String(entity.label).toUpperCase())
      if (!label)
        throw new Error(`${where}: entity ${entityIndex} has unknown label ${entity.label}`)
      if (
        !Number.isInteger(entity.start) ||
        !Number.isInteger(entity.end) ||
        entity.start < 0 ||
        entity.end <= entity.start ||
        entity.end > doc.text.length
      ) {
        throw new Error(`${where}: entity ${entityIndex} has invalid [start, end) offsets`)
      }
      const actual = doc.text.slice(entity.start, entity.end)
      if (entity.value !== undefined && entity.value !== actual) {
        throw new Error(
          `${where}: entity ${entityIndex} value mismatch; offsets select ${JSON.stringify(actual)}`,
        )
      }
      return { ...entity, label }
    })
    .sort((a, b) => a.start - b.start || a.end - b.end)

  for (let i = 1; i < entities.length; i++) {
    if (entities[i].start < entities[i - 1].end) {
      throw new Error(`${where}: overlapping entities are not supported`)
    }
  }

  const wordTokens = tokenize(doc.text)
  const tokens = []
  const tags = []
  const started = new Set()
  for (const token of wordTokens) {
    const overlaps = entities.filter(
      (entity) => token.start < entity.end && entity.start < token.end,
    )
    if (overlaps.length > 1) throw new Error(`${where}: token overlaps multiple entities`)
    const entity = overlaps[0]
    if (!entity) {
      tokens.push(token.value)
      tags.push("O")
      continue
    }
    if (token.start < entity.start || token.end > entity.end) {
      throw new Error(
        `${where}: entity boundary cuts through token ${JSON.stringify(token.value)}; adjust offsets`,
      )
    }
    tokens.push(token.value)
    tags.push(`${started.has(entity) ? "I" : "B"}-${entity.label}`)
    started.add(entity)
  }
  if (started.size !== entities.length) {
    throw new Error(`${where}: at least one entity contains no token`)
  }

  entityCount += entities.length
  const serialized = JSON.stringify({ tokens, tags })
  const group = String(doc.group ?? doc.id ?? doc.text)
  converted.push({ serialized, group })
}

// Select an exact, deterministic number of development groups instead of
// independently thresholding every row. Thresholding can accidentally put all
// of a small first annotation batch into dev, and related messages must stay on
// the same side of the boundary.
const groups = [...new Set(converted.map((row) => row.group))].sort(
  (a, b) => hash01(a) - hash01(b) || a.localeCompare(b),
)
const requestedDevGroups = Math.round(groups.length * DEV_SHARE)
const devGroupCount = Math.min(Math.max(0, requestedDevGroups), Math.max(0, groups.length - 1))
const devGroups = new Set(groups.slice(0, devGroupCount))
for (const row of converted) {
  if (devGroups.has(row.group)) valOut.push(row.serialized)
  else trainOut.push(row.serialized)
}

if (trainOut.length) appendFileSync(TRAIN_DEST, `${trainOut.join("\n")}\n`)
if (valOut.length) appendFileSync(VAL_DEST, `${valOut.join("\n")}\n`)

console.log(
  `Validated ${trainOut.length + valOut.length} target-domain documents (${entityCount} entities)`,
)
console.log(`Appended ${trainOut.length} train -> ${TRAIN_DEST}`)
console.log(`Appended ${valOut.length} held-out dev -> ${VAL_DEST}`)
