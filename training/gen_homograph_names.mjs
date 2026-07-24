#!/usr/bin/env node
/**
 * Homograph first-name list: Swedish given names whose LOWERCASE form is also
 * an ordinary Swedish word (bo, sten, björn, dag, liv, klara, linda, ...).
 *
 * Why it exists: the 2026-07-21 lowercase probe (see
 * packages/ner/eval/benchmark-homograph-names.mjs) isolated where the shipped
 * model actually leaks in the lowercase chat register. It is NOT the
 * product/brand-word context that started the investigation (that costs ~6pp
 * on ordinary names); it is names that collide with common words, which leak
 * an order of magnitude harder. This file makes that class a named, listed
 * property instead of an anecdote, so a training round can target it.
 *
 * The list is derived MECHANICALLY, not hand-picked, from three public
 * sources (downloaded to training/.cache/ on first run, gitignored):
 *
 *   1. SCB tilltalsnamn (the name a person actually goes by), via
 *      github.com/peterdalle/svensktext, population registered 2020-12-31.
 *      Gives the candidate names and their bearer counts.
 *   2. SALDO (Språkbanken, CC-BY 4.0), a Swedish morphological lexicon with
 *      part-of-speech tags. A name counts as a homograph only if its
 *      lowercase form is a SALDO lemma in a COMMON word class (nn/vb/av/ab/
 *      pp/pn/nl/kn/sn/in). Proper nouns (pm) are excluded, which is the whole
 *      point: it is what separates "bo" (verb) from "anna" (only ever a name).
 *   3. A Swedish word-frequency list (hermitdave/FrequencyWords, OpenSubtitles
 *      2018) purely to ORDER by how often the word sense actually shows up.
 *      Never used to decide membership: that corpus is full of spoken names,
 *      so frequency alone would flag anna/peter/david as "common words".
 *
 * Deterministic, no RNG. Re-run after changing a threshold:
 *   node training/gen_homograph_names.mjs
 *
 * Env:
 *   MIN_BEARERS  minimum SCB bearer count to keep a name (default 300)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE = resolve(HERE, ".cache")
const OUT = resolve(HERE, "lexicon/homograph-first-names.txt")
const MIN_BEARERS = Number(process.env.MIN_BEARERS ?? 300)

const SOURCES = {
  "tilltalsnamn-kvinnor.csv":
    "https://raw.githubusercontent.com/peterdalle/svensktext/master/namn/tilltalsnamn-kvinnor.csv",
  "tilltalsnamn-man.csv":
    "https://raw.githubusercontent.com/peterdalle/svensktext/master/namn/tilltalsnamn-man.csv",
  "saldo.xml": "https://svn.spraakdata.gu.se/sb-arkiv/pub/lmf/saldo/saldo.xml",
  "sv_50k.txt":
    "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/sv/sv_50k.txt",
}

mkdirSync(CACHE, { recursive: true })
mkdirSync(dirname(OUT), { recursive: true })

for (const [file, url] of Object.entries(SOURCES)) {
  const path = resolve(CACHE, file)
  if (existsSync(path)) continue
  process.stdout.write(`downloading ${file} ...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`\n${url} -> HTTP ${res.status}`)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  console.log(" ok")
}

const read = (f) => readFileSync(resolve(CACHE, f), "utf8")

// --- 1. candidate names: SCB tilltalsnamn, both lists summed ---------------
const bearers = new Map()
for (const file of ["tilltalsnamn-kvinnor.csv", "tilltalsnamn-man.csv"]) {
  for (const line of read(file).split("\n").slice(1)) {
    const [name, persons] = line.split(",")
    // Single-word alphabetic names only: hyphenated and initialised entries
    // ("A:Son", "Jan-Erik") are not what a bare lowercase token looks like.
    if (!name || !/^[A-Za-zÅÄÖÉÜåäöéü]{2,}$/.test(name)) continue
    const key = name.toLowerCase()
    bearers.set(key, (bearers.get(key) ?? 0) + Number(persons || 0))
  }
}

// --- 2. common-word lemmas: SALDO, proper nouns (pm*) excluded -------------
const COMMON_POS = new Set(["nn", "vb", "av", "ab", "pp", "pn", "nl", "kn", "sn", "in"])
const wordPos = new Map()
const saldo = read("saldo.xml")
const FORM =
  /<feat att="writtenForm" val="([^"]+)" \/>\s*<feat att="partOfSpeech" val="([^"]+)" \/>/g
let match = FORM.exec(saldo)
while (match) {
  const [, form, pos] = match
  // Lowercase written forms only: an uppercase form is the lexicon spelling a
  // proper noun or a sentence-initial variant, not evidence of a word sense.
  if (COMMON_POS.has(pos) && form === form.toLowerCase()) {
    if (!wordPos.has(form)) wordPos.set(form, new Set())
    wordPos.get(form).add(pos)
  }
  match = FORM.exec(saldo)
}

// --- 3. severity ordering: how often the word form shows up in running text -
const wordRank = new Map()
read("sv_50k.txt")
  .split("\n")
  .forEach((line, i) => {
    const word = line.split(" ")[0]
    if (word) wordRank.set(word, i + 1)
  })

const rows = []
for (const [name, count] of bearers) {
  if (count < MIN_BEARERS) continue
  const pos = wordPos.get(name)
  if (!pos) continue
  rows.push({ name, count, pos: [...pos].sort().join("/"), rank: wordRank.get(name) ?? 0 })
}
rows.sort((a, b) => b.count - a.count)

const header = `# Swedish given names whose lowercase form is also an ordinary word.
# GENERATED FILE, do not hand-edit: node training/gen_homograph_names.mjs
#
# Columns: name <TAB> SCB bearers <TAB> SALDO word classes <TAB> word-frequency
# rank in OpenSubtitles sv (0 = outside the top 50k). Sorted by bearers.
# Membership is decided by SALDO alone (a lemma in a common word class);
# the frequency rank only says how loud the word sense is in running text.
# Threshold: >= ${MIN_BEARERS} bearers. ${rows.length} names.
#
# Sources: SCB tilltalsnamn 2020-12-31 via peterdalle/svensktext; SALDO
# (Språkbanken, CC-BY 4.0); hermitdave/FrequencyWords (OpenSubtitles 2018).
`
writeFileSync(
  OUT,
  `${header}\n${rows.map((r) => `${r.name}\t${r.count}\t${r.pos}\t${r.rank}`).join("\n")}\n`,
)
console.log(`\n${rows.length} homograph names -> ${OUT}`)
console.log(
  rows
    .slice(0, 15)
    .map((r) => `  ${r.name} (${r.pos}, ${r.count} bearers)`)
    .join("\n"),
)
