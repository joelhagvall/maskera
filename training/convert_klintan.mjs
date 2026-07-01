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
 * Usage: node convert_klintan.mjs [srcConll] [destJsonl]
 */
import { appendFileSync, readFileSync } from "node:fs"

const SRC = process.argv[2] ?? ".benchmark/train_corpus.txt"
const DEST = process.argv[3] ?? "data/train.jsonl"
const KEEP = new Set(["PER", "LOC", "ORG"])

const lines = readFileSync(SRC, "utf8").split(/\r?\n/)
const out = []
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
  out.push(JSON.stringify({ tokens, tags }))
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

appendFileSync(DEST, `${out.join("\n")}\n`)
const ents = out.reduce(
  (n, l) => n + JSON.parse(l).tags.filter((t) => t.startsWith("B-")).length,
  0,
)
console.log(`Appended ${out.length} real sentences (${ents} entities) from ${SRC} -> ${DEST}`)
