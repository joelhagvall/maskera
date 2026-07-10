/**
 * Convert MultiCoNER v2 Swedish to maskera BIO JSONL.
 *
 * 16k gold ALL-LOWERCASE wiki-register sentences with fine-grained tags,
 * CC BY 4.0 (commercial OK). The whole corpus is lowercase, which is why it
 * is here: v11's remaining weakness is lowercase ORG recall, and this is the
 * only large gold source where every org mention is uncased.
 * https://huggingface.co/datasets/MultiCoNER/multiconer_v2
 *
 * Class mapping (audited 2026-07-10 on the sv train split, see README):
 *   PER: Artist, OtherPER, Politician, Athlete, Cleric, Scientist,
 *        SportsManager (clean person names)
 *   LOC: HumanSettlement (clean cities/countries)
 *   ORG: ORG, MusicalGRP, SportsGRP, PublicCorp, PrivateCorp,
 *        CarManufacturer, AerospaceManufacturer (clean org names)
 *   O:   the medical classes (Disease, Symptom, MedicalProcedure,
 *        Medication/Vaccine, AnatomicalStructure) and the clean product/work
 *        classes (VisualWork, MusicalWork, ArtWork, Food, Drink, Clothing,
 *        OtherPROD, Vehicle). Audit found 0 org-name pollution in these;
 *        medical terms are exactly maskera's hard-negative category (EKG,
 *        abort, psykoterapi must stay O).
 *
 * POISON CLASSES ARE DROPPED, NOT TAGGED O (the v11a MASSIVE lesson):
 *   Software (youtube/facebook/spotify: 78 of 420 spans are org names),
 *   WrittenWork (svenska dagbladet/dagens nyheter/aftonbladet as titles),
 *   OtherLOC + Facility + Station (mix generic nouns with institutions like
 *   "kungliga operan"/"statens historiska museum" that belong in ORG).
 *   Sentences containing any of these classes are excluded wholesale.
 *
 * GENERIC SPANS in kept classes ("kommun", "stad", "svensk", "militär":
 * annotation noise where the span is a common noun/adjective) are remapped
 * to O via a stoplist; unlike the poison classes, O is the CORRECT label
 * for these tokens, so the row is kept.
 *
 * Source dumps (made from the HF parquet files, config "Swedish (SV)"):
 *   .benchmark/multiconer_sv.train.jsonl / .benchmark/multiconer_sv.validation.jsonl
 * Each line: { id, tokens: [...], ner_tags: ["B-Artist", "O", ...] }
 * The test split is never read; it stays a potential held-out benchmark.
 *
 * Usage: node convert_multiconer.mjs [srcTrain] [srcDev] [trainJsonl] [valJsonl]
 */
import { appendFileSync, readFileSync } from "node:fs"

const SRC_TRAIN = process.argv[2] ?? ".benchmark/multiconer_sv.train.jsonl"
const SRC_DEV = process.argv[3] ?? ".benchmark/multiconer_sv.validation.jsonl"
const TRAIN_DEST = process.argv[4] ?? "data/train.jsonl"
const VAL_DEST = process.argv[5] ?? "data/val.jsonl"

// Deterministic sample of entity-bearing rows: the corpus is wiki register,
// not target register, so it is weighted into the mix, never appended whole.
const SHARE = Number(process.env.MULTICONER_SHARE ?? 0.5)
// Share of rows with no kept entity (medical/product hard negatives).
const EMPTY_SHARE = Number(process.env.MULTICONER_EMPTY_SHARE ?? 0.15)
// Share of the MultiCoNER validation split added to maskera's dev set.
const DEV_SHARE = Number(process.env.MULTICONER_DEV_SHARE ?? 0.15)

for (const [name, value] of [
  ["MULTICONER_SHARE", SHARE],
  ["MULTICONER_EMPTY_SHARE", EMPTY_SHARE],
  ["MULTICONER_DEV_SHARE", DEV_SHARE],
]) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number in [0, 1]; got ${value}`)
  }
}

const LABEL_MAP = new Map([
  ["Artist", "PER"],
  ["OtherPER", "PER"],
  ["Politician", "PER"],
  ["Athlete", "PER"],
  ["Cleric", "PER"],
  ["Scientist", "PER"],
  ["SportsManager", "PER"],
  ["HumanSettlement", "LOC"],
  ["ORG", "ORG"],
  ["MusicalGRP", "ORG"],
  ["SportsGRP", "ORG"],
  ["PublicCorp", "ORG"],
  ["PrivateCorp", "ORG"],
  ["CarManufacturer", "ORG"],
  ["AerospaceManufacturer", "ORG"],
])

// Classes whose spans often hold real org/institution names but not reliably
// enough to remap: tagging them O poisons ORG recall (the v11a lesson), so
// the whole sentence is dropped.
const POISON_CLASSES = new Set(["Software", "WrittenWork", "OtherLOC", "Facility", "Station"])

// Classes audited clean of org/person names; their spans are generic terms
// that must stay O in maskera's schema (medical hard negatives especially).
const O_CLASSES = new Set([
  "Disease",
  "Symptom",
  "MedicalProcedure",
  "Medication/Vaccine",
  "AnatomicalStructure",
  "VisualWork",
  "MusicalWork",
  "ArtWork",
  "Food",
  "Drink",
  "Clothing",
  "OtherPROD",
  "Vehicle",
])

// Annotation noise in KEPT classes: single-token spans that are common Swedish
// nouns/adjectives ("x kommun", "svensk kompositör"). O is the correct label.
const GENERIC_SPANS = new Set([
  "kommun",
  "stad",
  "ort",
  "land",
  "by",
  "företag",
  "militär",
  "grupp",
  "varv",
  "svensk",
  "svenska",
  "svenskt",
  "amerikansk",
  "amerikanska",
  "brittisk",
  "brittiska",
  "norsk",
  "norska",
  "dansk",
  "danska",
  "finsk",
  "finska",
  "tysk",
  "tyska",
  "fransk",
  "franska",
  "m",
  "h",
  "ger",
])

const hash01 = (value) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 2 ** 32
}

// Group a row's BIO tags into [start, end) spans with their source class.
const toSpans = (nerTags, where) => {
  const spans = []
  for (let i = 0; i < nerTags.length; i++) {
    const tag = nerTags[i]
    if (tag === "O") continue
    const [prefix, cls] = [tag.slice(0, 1), tag.slice(2)]
    if (prefix === "B" || !spans.length || spans[spans.length - 1].cls !== cls) {
      spans.push({ cls, start: i, end: i + 1 })
    } else {
      spans[spans.length - 1].end = i + 1
    }
    if (!LABEL_MAP.has(cls) && !POISON_CLASSES.has(cls) && !O_CLASSES.has(cls)) {
      throw new Error(`${where}: unmapped MultiCoNER class ${cls}`)
    }
  }
  return spans
}

// Returns { tokens, tags } or null when the row contains a poison class.
const convertRow = (row, where) => {
  const spans = toSpans(row.ner_tags, where)
  if (spans.some((span) => POISON_CLASSES.has(span.cls))) return null
  const tags = row.ner_tags.map(() => "O")
  for (const span of spans) {
    const label = LABEL_MAP.get(span.cls)
    if (!label) continue
    const text = row.tokens.slice(span.start, span.end).join(" ")
    if (GENERIC_SPANS.has(text)) continue
    for (let i = span.start; i < span.end; i++) {
      tags[i] = `${i === span.start ? "B" : "I"}-${label}`
    }
  }
  return { tokens: row.tokens, tags }
}

const readRows = (path) =>
  readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      const row = JSON.parse(line)
      if (row.id === undefined || !Array.isArray(row.tokens) || !Array.isArray(row.ner_tags)) {
        throw new Error(`${path}:${index + 1}: expected { id, tokens, ner_tags }`)
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
  const parsed = convertRow(row, `${SRC_TRAIN} id ${row.id}`)
  if (!parsed) {
    dropped++
    continue
  }
  const hasEntity = parsed.tags.some((tag) => tag !== "O")
  const share = hasEntity ? SHARE : EMPTY_SHARE
  if (hash01(`multiconer${row.id}`) >= share) continue
  trainOut.push(JSON.stringify(parsed))
}

const valOut = []
for (const row of readRows(SRC_DEV)) {
  if (hash01(`multiconer-dev${row.id}`) >= DEV_SHARE) continue
  const parsed = convertRow(row, `${SRC_DEV} id ${row.id}`)
  if (!parsed) continue
  valOut.push(JSON.stringify(parsed))
}

if (trainOut.length) appendFileSync(TRAIN_DEST, `${trainOut.join("\n")}\n`)
if (valOut.length) appendFileSync(VAL_DEST, `${valOut.join("\n")}\n`)

console.log(
  `Appended ${trainOut.length} MultiCoNER sv rows (share ${SHARE}, empty-share ${EMPTY_SHARE}, ${countEntities(trainOut)} entities, ${dropped} poison-class rows dropped) -> ${TRAIN_DEST}`,
)
console.log(
  `Appended ${valOut.length} MultiCoNER held-out dev rows (${countEntities(valOut)} entities) -> ${VAL_DEST}`,
)
