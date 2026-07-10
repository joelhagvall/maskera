/**
 * Convert SIC2 (Stockholm Internet Corpus v2) to maskera BIO JSONL.
 *
 * SIC2 is 892 sentences / 13.6k tokens of Swedish BLOG text with MANUAL named
 * entity annotation: real informal register (the target register the v10
 * error analysis identified), which none of the other real corpora cover.
 * Source: Språkbanken Text, CC BY 4.0, https://doi.org/10.23695/se5f-d274
 * Download: https://spraakbanken.gu.se/resurser/meningsmangder/sic2.xml.bz2
 *
 * We read the manual `<name type="...">` layer (person/place/inst kept as
 * PER/LOC/ORG; animal/product/time/work -> O, out of scope) and ignore the
 * automatic `<ne>` layer.
 *
 * Usage: node convert_sic2.mjs [srcXml] [trainJsonl] [valJsonl]
 */
import { appendFileSync, readFileSync } from "node:fs"

const SRC = process.argv[2] ?? ".benchmark/sic2.xml"
const TRAIN_DEST = process.argv[3] ?? "data/train.jsonl"
const VAL_DEST = process.argv[4] ?? "data/val.jsonl"
const DEV_SHARE = Number(process.env.SIC2_DEV_SHARE ?? 0.1)
const LC_AUG = Number(process.env.SIC2_LC_AUG ?? 0.35)

for (const [name, value] of [
  ["SIC2_DEV_SHARE", DEV_SHARE],
  ["SIC2_LC_AUG", LC_AUG],
]) {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(`${name} must be a number in [0, 1); got ${value}`)
  }
}

const LABEL_MAP = new Map([
  ["person", "PER"],
  ["place", "LOC"],
  ["inst", "ORG"],
])

const hash01 = (value) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 2 ** 32
}

// Seeded like the other converters so lowercase augmentation is reproducible.
let seed = 1337
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let value = seed
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32
}

const decodeEntities = (value) =>
  value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")

const trainOut = []
const valOut = []
let tokens = []
let tags = []
let currentLabel = null
let startedEntity = false
let inSentence = false

const flush = () => {
  if (!tokens.length) return
  const serialized = JSON.stringify({ tokens, tags })
  if (hash01(tokens.join("")) < DEV_SHARE) {
    valOut.push(serialized)
  } else {
    trainOut.push(serialized)
    if (rand() < LC_AUG) {
      const lower = tokens.map((token) => token.toLowerCase())
      if (lower.some((token, i) => token !== tokens[i])) {
        trainOut.push(JSON.stringify({ tokens: lower, tags }))
      }
    }
  }
  tokens = []
  tags = []
}

for (const [lineIndex, line] of readFileSync(SRC, "utf8").split(/\r?\n/).entries()) {
  const trimmed = line.trim()
  if (trimmed.startsWith("<sentence")) {
    inSentence = true
    continue
  }
  if (trimmed.startsWith("</sentence")) {
    if (currentLabel !== null) {
      throw new Error(`${SRC}:${lineIndex + 1}: sentence ended inside a <name> annotation`)
    }
    flush()
    inSentence = false
    continue
  }
  if (!inSentence) continue

  const nameOpen = trimmed.match(/^<name type="([^"]+)">/)
  if (nameOpen) {
    currentLabel = LABEL_MAP.get(nameOpen[1]) ?? "O"
    startedEntity = false
    continue
  }
  if (trimmed.startsWith("</name>")) {
    currentLabel = null
    continue
  }

  const token = trimmed.match(/^<token [^>]*>(.*)<\/token>$/)
  if (!token) continue
  tokens.push(decodeEntities(token[1]))
  if (currentLabel && currentLabel !== "O") {
    tags.push(`${startedEntity ? "I" : "B"}-${currentLabel}`)
    startedEntity = true
  } else {
    tags.push("O")
  }
}

if (tokens.length) throw new Error(`${SRC}: unterminated final sentence`)

if (trainOut.length) appendFileSync(TRAIN_DEST, `${trainOut.join("\n")}\n`)
if (valOut.length) appendFileSync(VAL_DEST, `${valOut.join("\n")}\n`)

const countEntities = (rows) =>
  rows.reduce(
    (total, row) => total + JSON.parse(row).tags.filter((tag) => tag.startsWith("B-")).length,
    0,
  )

console.log(
  `Appended ${trainOut.length} SIC2 blog sentences (${countEntities(trainOut)} entities) -> ${TRAIN_DEST}`,
)
console.log(
  `Appended ${valOut.length} SIC2 held-out dev sentences (${countEntities(valOut)} entities) -> ${VAL_DEST}`,
)
