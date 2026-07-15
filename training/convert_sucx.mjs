/**
 * Convert KBLab's SUCX 3.0 NER dataset (simple_cased config) to maskera BIO
 * JSONL and append a WEIGHTED sample of it to the training set.
 *
 * Why this corpus: KBLab's lowermix models (trained on this exact data with a
 * ~50/50 cased/uncased mix) beat maskera on lowercased text, the register gap
 * the v10 error analysis quantified (leak rate 8.4% -> 24.8% without casing
 * cues). SUCX is gold-annotated, balanced-genre (news + fiction, SUC 3.0),
 * CC BY 4.0 (Språkbanken; scrambled-sentence variant, commercial use OK).
 *
 * Why sampled, not appended wholesale: the v10a lesson. Mixing the full
 * Swe-NERC corpus regressed the independent gold gate because a large real
 * corpus's register/annotation policy dominates the mix. SUCX train is 43k
 * sentences vs ~32k current rows, so by default only a deterministic
 * SUCX_SHARE sample goes in. Sweep the share against BOTH benchmarks before
 * shipping anything.
 *
 * Mapping: PRS -> PER, LOC -> LOC, ORG -> ORG. TME/MSR/WRK/EVN/OBJ -> O (out
 * of scope; TME/MSR only exist in the automatic tag set anyway). Note PRS in
 * simple_tags includes a handful of animal/mythological names.
 *
 * Source dumps (made from the HF parquet files, see training/README.md):
 *   .benchmark/sucx3_simple_cased.train.jsonl
 *   .benchmark/sucx3_simple_cased.validation.jsonl
 * Each line: { id, tokens: [...], ner_tags: ["B-PRS", "O", ...] }
 *
 * The SUCX test split is never read here; it stays a potential held-out
 * benchmark.
 *
 * Usage: node convert_sucx.mjs [srcTrain] [srcDev] [trainJsonl] [valJsonl]
 */
import { appendFileSync, readFileSync } from "node:fs"

const SRC_TRAIN = process.argv[2] ?? ".benchmark/sucx3_simple_cased.train.jsonl"
const SRC_DEV = process.argv[3] ?? ".benchmark/sucx3_simple_cased.validation.jsonl"
const TRAIN_DEST = process.argv[4] ?? "data/train.jsonl"
const VAL_DEST = process.argv[5] ?? "data/val.jsonl"

// Share of the 43k SUCX train sentences to include. 0.25 lands the SUCX rows
// (with lowercase duplicates) near the klintan corpus's weight in the mix,
// so no single real corpus dominates. Sweep against both benchmarks.
const SHARE = Number(process.env.SUCX_SHARE ?? 0.25)
// Lowercased-duplicate share, aligned with LC_AUG / KLINTAN_LC_AUG (0.35).
// KBLab's own winning recipe replaced ~50% outright; duplicates are gentler
// on cased precision.
const LC_AUG = Number(process.env.SUCX_LC_AUG ?? 0.35)
// Share of the SUCX validation split to add to maskera's dev set (paired
// cased + lowercased, like convert_klintan). Kept small so checkpoint
// selection is not dominated by SUCX's register.
const DEV_SHARE = Number(process.env.SUCX_DEV_SHARE ?? 0.1)

for (const [name, value] of [
  ["SUCX_SHARE", SHARE],
  ["SUCX_LC_AUG", LC_AUG],
  ["SUCX_DEV_SHARE", DEV_SHARE],
]) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be a number in [0, 1]; got ${value}`)
  }
}

const LABEL_MAP = new Map([
  ["PRS", "PER"],
  ["LOC", "LOC"],
  ["ORG", "ORG"],
])

const hash01 = (value) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 2 ** 32
}

// Seeded like convert_klintan so the lowercase-duplicate choice is
// reproducible run to run.
let seed = 1337
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let value = seed
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32
}

const remap = (tags) =>
  tags.map((tag) => {
    if (tag === "O") return "O"
    const [prefix, label] = tag.split("-")
    if ((prefix !== "B" && prefix !== "I") || !label) {
      throw new Error(`unexpected tag ${JSON.stringify(tag)}`)
    }
    const mapped = LABEL_MAP.get(label)
    return mapped ? `${prefix}-${mapped}` : "O"
  })

// Dropping TME/MSR etc. can orphan an I- tag only if the source mixed labels
// inside one entity, which BIO forbids; still, normalise any I- after O/other
// label to B- for safety.
const normalizeBio = (tags) => {
  let previous = "O"
  return tags.map((tag) => {
    let out = tag
    if (tag.startsWith("I-") && previous !== tag && previous !== `B-${tag.slice(2)}`) {
      out = `B-${tag.slice(2)}`
    }
    previous = out
    return out
  })
}

// SUCX contains a few real editorial/contact addresses in otherwise public
// prose. They are irrelevant to NER supervision (tagged O), so replace every
// email surface before it enters generated train/dev files.
const sanitizeContactTokens = (tokens) =>
  tokens.map((token) =>
    token.replace(/[A-ZÅÄÖ0-9._%+-]+@[A-ZÅÄÖ0-9.-]+\.[A-Z]{2,}/gi, "kontakt@example.com"),
  )

const readRows = (path) =>
  readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      const row = JSON.parse(line)
      if (!Array.isArray(row.tokens) || !Array.isArray(row.ner_tags) || !row.id) {
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
for (const row of readRows(SRC_TRAIN)) {
  // Deterministic sample keyed on the stable SUCX sentence id, so the same
  // sentences are selected at a given share regardless of file order.
  if (hash01(`sucx${row.id}`) >= SHARE) continue
  const tags = normalizeBio(remap(row.ner_tags))
  const tokens = sanitizeContactTokens(row.tokens)
  trainOut.push(JSON.stringify({ tokens, tags }))
  if (rand() < LC_AUG) {
    const lower = tokens.map((token) => token.toLowerCase())
    if (lower.some((token, i) => token !== tokens[i])) {
      trainOut.push(JSON.stringify({ tokens: lower, tags }))
    }
  }
}

const valOut = []
for (const row of readRows(SRC_DEV)) {
  if (hash01(`sucx-dev${row.id}`) >= DEV_SHARE) continue
  const tags = normalizeBio(remap(row.ner_tags))
  const tokens = sanitizeContactTokens(row.tokens)
  valOut.push(JSON.stringify({ tokens, tags }))
  const lower = tokens.map((token) => token.toLowerCase())
  if (lower.some((token, i) => token !== tokens[i])) {
    valOut.push(JSON.stringify({ tokens: lower, tags }))
  }
}

if (trainOut.length) appendFileSync(TRAIN_DEST, `${trainOut.join("\n")}\n`)
if (valOut.length) appendFileSync(VAL_DEST, `${valOut.join("\n")}\n`)

console.log(
  `Appended ${trainOut.length} SUCX train rows (share ${SHARE}, lc-aug ${LC_AUG}, ${countEntities(trainOut)} entities) -> ${TRAIN_DEST}`,
)
console.log(
  `Appended ${valOut.length} SUCX paired dev rows (${countEntities(valOut)} entities) -> ${VAL_DEST}`,
)
