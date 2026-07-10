/**
 * Convert the Swedish NER Corpus (klintan / Webbnyheter) from its CoNLL-ish
 * format into the {tokens, tags} BIO JSONL that train.py consumes, and append
 * it to data/train.jsonl. This injects REAL labelled Swedish text (news) into
 * the otherwise-synthetic training set.
 *
 * Source format: "token  TAG" per line, blank line between sentences, tags
 * PER / LOC / ORG / MISC and "0" for outside. Non-BIO (consecutive same-tag
 * tokens form one entity), so we add the B-/I- prefixes here.
 *
 * Mapping: PER/LOC/ORG kept (the model's free-text types); MISC and anything
 * unexpected -> O (out of scope, the rule layer / not-an-entity).
 *
 * IMPORTANT: only the TRAIN split goes in here. The TEST split stays a held-out
 * benchmark. Note that training on this corpus makes its test split
 * IN-DISTRIBUTION, so measure honest generalisation on a different independent
 * set (gold-real Wikipedia, WikiANN), not on klintan test.
 *
 * A deterministic slice of the source train split is reserved for validation.
 * This keeps checkpoint selection from relying only on the synthetic validation
 * set (which saturates at F1 1.00 and does not measure generalisation).
 *
 * Usage: node convert_klintan.mjs [srcConll] [trainJsonl] [valJsonl]
 */
import { appendFileSync, readFileSync } from "node:fs"

const SRC = process.argv[2] ?? ".benchmark/train_corpus.txt"
const DEST = process.argv[3] ?? "data/train.jsonl"
const VAL_DEST = process.argv[4] ?? "data/val.jsonl"
const KEEP = new Set(["PER", "LOC", "ORG"])

// Seeded so the lowercase-augmentation choice is reproducible run to run (the
// rest of the pipeline is seeded 1337; this used Math.random and drifted).
let seed = 1337
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0
  let value = seed
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32
}
// v10: real-text lowercase-duplicate share, aligned with the synthetic set's
// LC_AUG (0.35) since lowercase is the biggest leak; was a hardcoded 0.10.
const LC_AUG = Number(process.env.KLINTAN_LC_AUG ?? 0.35)
// This is a development split carved only from klintan's TRAIN partition. The
// public test partition remains untouched. Hashing the sentence makes the split
// stable even if augmentation settings or input order change.
const DEV_SHARE = Number(process.env.KLINTAN_DEV_SHARE ?? 0.1)

for (const [name, value] of [
  ["KLINTAN_LC_AUG", LC_AUG],
  ["KLINTAN_DEV_SHARE", DEV_SHARE],
]) {
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error(`${name} must be a number in [0, 1); got ${value}`)
  }
}

const hash01 = (value) => {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 2 ** 32
}

const lines = readFileSync(SRC, "utf8").split(/\r?\n/)
const trainOut = []
const valOut = []
let toks = []

function flush() {
  if (!toks.length) return
  const tokens = []
  const tags = []
  let prev = "O"
  for (const { token, tag } of toks) {
    const t = KEEP.has(tag) ? tag : "O"
    tokens.push(token)
    if (t === "O") tags.push("O")
    else tags.push(`${t === prev ? "I" : "B"}-${t}`)
    prev = t
  }
  const serialized = JSON.stringify({ tokens, tags })
  const isValidation = hash01(tokens.join("\u001f")) < DEV_SHARE
  if (isValidation) {
    valOut.push(serialized)
    // Grade checkpoint selection on the same real sentence both with and
    // without casing cues. This is deliberately paired instead of sampled.
    const lower = tokens.map((t) => t.toLowerCase())
    if (lower.some((token, i) => token !== tokens[i])) {
      valOut.push(JSON.stringify({ tokens: lower, tags }))
    }
    toks = []
    return
  }

  trainOut.push(serialized)
  // v10: emit a lowercased duplicate for LC_AUG of sentences, so the model also
  // sees REAL text without capitalisation cues (chat style), not just the
  // synthetic lowercase variants. Share raised 0.10 -> 0.35 (env KLINTAN_LC_AUG)
  // to attack the lowercase leak the error analysis quantified.
  if (rand() < LC_AUG) {
    trainOut.push(JSON.stringify({ tokens: tokens.map((t) => t.toLowerCase()), tags }))
  }
  toks = []
}

for (const ln of lines) {
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

appendFileSync(DEST, `${trainOut.join("\n")}\n`)
appendFileSync(VAL_DEST, `${valOut.join("\n")}\n`)
const trainEnts = trainOut.reduce(
  (n, l) => n + JSON.parse(l).tags.filter((t) => t.startsWith("B-")).length,
  0,
)
const valEnts = valOut.reduce(
  (n, l) => n + JSON.parse(l).tags.filter((t) => t.startsWith("B-")).length,
  0,
)
console.log(`Appended ${trainOut.length} real train sentences (${trainEnts} entities) -> ${DEST}`)
console.log(
  `Appended ${valOut.length} paired real validation sentences (${valEnts} entities) -> ${VAL_DEST}`,
)
