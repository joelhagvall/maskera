/**
 * Convert Amazon MASSIVE (sv-SE) to maskera BIO JSONL.
 *
 * MASSIVE is the only gold-quality corpus in maskera's TARGET REGISTER:
 * lowercase, informal, first-person Swedish ("skriv ett mejl till john och
 * lennart"), professionally localized by native speakers. CC BY 4.0
 * (commercial OK). https://huggingface.co/datasets/AmazonScience/massive
 *
 * Slot mapping: person + artist_name -> PER (artist names are personal names;
 * for redaction, recall on names is the safety metric), place_name -> LOC,
 * business_name + transport_agency + app_name -> ORG (uber, spotify, foodora:
 * clean company-name slots). Everything else (date, time, food_type,
 * house_place, business_type...) -> O. No street-address slot exists, so
 * MASSIVE contributes no ADR signal.
 *
 * POISON SLOTS ARE DROPPED, NOT TAGGED O: media_type (facebook, aftonbladet,
 * s.v.t. mixed with verbs like "tweeta"), radio_name, podcast_name ("alex och
 * sigges" are people) and news_topic ("trump") often hold real organisation or
 * person names. Tagging those O teaches the model that org names are
 * non-entities; the first v11 run did exactly that and klintan ORG recall
 * collapsed (72% -> 61% cased, 36% lowercase). Utterances containing these
 * slots are excluded wholesale instead.
 *
 * Utterances with no kept entity are hard negatives in the target register
 * (chat commands that must NOT be tagged), but they outnumber entity rows
 * ~4:1, so only a deterministic MASSIVE_EMPTY_SHARE sample is kept.
 *
 * Source dumps (made from the HF parquet files, see training/README.md):
 *   .benchmark/massive_sv.train.jsonl / .benchmark/massive_sv.validation.jsonl
 * Each line: { id, utt, annot_utt } where annot_utt marks slots inline as
 * "lägg till [person : niklas larsson] i listan". The test split is never
 * read; it stays a potential held-out benchmark.
 *
 * Usage: node convert_massive.mjs [srcTrain] [srcDev] [trainJsonl] [valJsonl]
 */
import { appendFileSync, readFileSync } from "node:fs"

const SRC_TRAIN = process.argv[2] ?? ".benchmark/massive_sv.train.jsonl"
const SRC_DEV = process.argv[3] ?? ".benchmark/massive_sv.validation.jsonl"
const TRAIN_DEST = process.argv[4] ?? "data/train.jsonl"
const VAL_DEST = process.argv[5] ?? "data/val.jsonl"

// Share of no-entity utterances kept as target-register hard negatives.
const EMPTY_SHARE = Number(process.env.MASSIVE_EMPTY_SHARE ?? 0.3)
// Share of the MASSIVE validation split added to maskera's dev set.
const DEV_SHARE = Number(process.env.MASSIVE_DEV_SHARE ?? 0.15)

for (const [name, value] of [
  ["MASSIVE_EMPTY_SHARE", EMPTY_SHARE],
  ["MASSIVE_DEV_SHARE", DEV_SHARE],
]) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number in [0, 1]; got ${value}`)
  }
}

const LABEL_MAP = new Map([
  ["person", "PER"],
  ["artist_name", "PER"],
  ["place_name", "LOC"],
  ["business_name", "ORG"],
  ["transport_agency", "ORG"],
  ["app_name", "ORG"],
])

// Slots whose values often hold real org/person names but not reliably enough
// to remap: tagging them O poisons ORG recall, so drop the whole utterance.
const POISON_SLOTS = new Set(["media_type", "radio_name", "podcast_name", "news_topic"])

const hash01 = (value) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 2 ** 32
}

// Parse "text [slot : value] text" into whitespace tokens + BIO tags.
// Returns null when the utterance contains a poison slot.
const parseAnnotated = (annotUtt, where) => {
  const tokens = []
  const tags = []
  const pattern = /\[([a-z_]+) : ([^\]]+)\]|([^\s[\]]+)/g
  for (const match of annotUtt.matchAll(pattern)) {
    if (match[3] !== undefined) {
      tokens.push(match[3])
      tags.push("O")
      continue
    }
    if (POISON_SLOTS.has(match[1])) return null
    const label = LABEL_MAP.get(match[1])
    const words = match[2].trim().split(/\s+/)
    if (!words.length || !words[0]) throw new Error(`${where}: empty slot value`)
    for (const [index, word] of words.entries()) {
      tokens.push(word)
      tags.push(label ? `${index === 0 ? "B" : "I"}-${label}` : "O")
    }
  }
  if (!tokens.length) throw new Error(`${where}: empty utterance`)
  return { tokens, tags }
}

const readRows = (path) =>
  readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      const row = JSON.parse(line)
      if (!row.id || typeof row.annot_utt !== "string") {
        throw new Error(`${path}:${index + 1}: expected { id, utt, annot_utt }`)
      }
      return row
    })

const countEntities = (rows) =>
  rows.reduce(
    (total, row) => total + JSON.parse(row).tags.filter((tag) => tag.startsWith("B-")).length,
    0,
  )

const trainOut = []
let dropped = 0
for (const row of readRows(SRC_TRAIN)) {
  const parsed = parseAnnotated(row.annot_utt, `${SRC_TRAIN} id ${row.id}`)
  if (!parsed) {
    dropped++
    continue
  }
  const { tokens, tags } = parsed
  const hasEntity = tags.some((tag) => tag !== "O")
  if (!hasEntity && hash01(`massive-empty${row.id}`) >= EMPTY_SHARE) continue
  trainOut.push(JSON.stringify({ tokens, tags }))
}

const valOut = []
for (const row of readRows(SRC_DEV)) {
  if (hash01(`massive-dev${row.id}`) >= DEV_SHARE) continue
  const parsed = parseAnnotated(row.annot_utt, `${SRC_DEV} id ${row.id}`)
  if (!parsed) continue
  valOut.push(JSON.stringify(parsed))
}

if (trainOut.length) appendFileSync(TRAIN_DEST, `${trainOut.join("\n")}\n`)
if (valOut.length) appendFileSync(VAL_DEST, `${valOut.join("\n")}\n`)

console.log(
  `Appended ${trainOut.length} MASSIVE sv-SE utterances (empty-share ${EMPTY_SHARE}, ${countEntities(trainOut)} entities, ${dropped} poison-slot rows dropped) -> ${TRAIN_DEST}`,
)
console.log(
  `Appended ${valOut.length} MASSIVE held-out dev utterances (${countEntities(valOut)} entities) -> ${VAL_DEST}`,
)
