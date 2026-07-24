#!/usr/bin/env node
/**
 * Homograph-name lowercase eval: DIAGNOSTIC, not a publish gate.
 *
 * Why it exists: a 2026-07-21 user report ("lowercase göran after 'iphone.'
 * is not masked") turned into a contrast measurement. The brand-word context
 * that prompted it costs ~9pp on homographs and ~3pp on ordinary names, i.e.
 * tail noise. The real hole is names whose lowercase form is also an ordinary
 * Swedish word (bo, sten, björn, klara, ...), which leak an order of
 * magnitude harder. This set makes that contrast reproducible.
 *
 * NOT A GATE, on purpose. It is six generated sentence frames; gating on it
 * would train the next round against the frame instead of against the
 * problem, the same way the rare-surname frames had to be rotated in v14 (see
 * gen_rare_surname_eval.mjs). Read it before and after a training round, do
 * not threshold on it.
 *
 * What it generates, in the same [PER:...] gold format as eval/gold.txt, all
 * lowercase, all chat register, each line tagged with the cell it belongs to:
 *
 *   name-use lines: one bare given name, crossed over
 *       arm  = brand   (a product/brand word right before the name) | neutral
 *       tail = short   (two words after the name) | long
 *       type = homograph (from lexicon/homograph-first-names.txt) | plain
 *   word-use lines: the same words used as ORDINARY WORDS, marked
 *       [WORD:...], where any detection is a false positive.
 *
 * The word-use half is the point of the whole set. It is the counterweight
 * that says why a lowercase first-name gazetteer is the wrong fix: the words
 * a gazetteer would flag are exactly these, in exactly this register.
 *
 * Deterministic: no RNG, template assignment is index-based.
 *   node training/gen_homograph_name_eval.mjs
 */
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const LEXICON = resolve(HERE, "lexicon/homograph-first-names.txt")
const OUT = resolve(HERE, "eval/homograph-names.txt")

// The name-use arm takes the LOUDEST collisions: names whose word sense is
// frequent in running text (low rank) and that enough people actually carry.
// Sorting by word rank rather than by bearers is deliberate; the property
// under test is the collision, not the popularity of the name.
const MAX_WORD_RANK = 6000
const MIN_BEARERS = 2000
const HOMOGRAPH_COUNT = 30

const lexicon = readFileSync(LEXICON, "utf8")
  .split("\n")
  .filter((l) => l.trim() && !l.startsWith("#"))
  .map((l) => {
    const [name, bearers, pos, rank] = l.split("\t")
    return { name, bearers: Number(bearers), pos, rank: Number(rank) }
  })
const lexiconSet = new Set(lexicon.map((r) => r.name))

const homographs = lexicon
  .filter((r) => r.rank > 0 && r.rank <= MAX_WORD_RANK && r.bearers >= MIN_BEARERS)
  .sort((a, b) => a.rank - b.rank)
  .slice(0, HOMOGRAPH_COUNT)

if (homographs.length < HOMOGRAPH_COUNT) {
  throw new Error(
    `lexicon yielded only ${homographs.length} homographs; run node training/gen_homograph_names.mjs first`,
  )
}

// Control arm: common given names with NO ordinary-word sense (verified absent
// from the lexicon by the assertion below). Mixed origin on purpose, so the
// control does not quietly become a "familiar Swedish name" arm.
const PLAIN = [
  "göran",
  "magda",
  "anna",
  "kalle",
  "lennart",
  "birgitta",
  "yusuf",
  "amina",
  "mehmet",
  "elvira",
  "sofia",
  "aleksandra",
]
for (const n of PLAIN) {
  if (lexiconSet.has(n)) throw new Error(`control name "${n}" is also a homograph, pick another`)
}

const BRAND = [
  "iphone",
  "samsung",
  "macbook",
  "spotify",
  "klarna",
  "zalando",
  "airpods",
  "playstation",
]
const NEUTRAL = [
  "telefon",
  "paket",
  "beställning",
  "faktura",
  "leverans",
  "mobil",
  "dator",
  "order",
]

// Paired frames: 0/3, 1/4 and 2/5 differ ONLY in the word before the name, so
// the brand-vs-neutral contrast is not confounded by the sentence around it.
const FRAMES = [
  {
    arm: "brand",
    tail: "short",
    f: (w, n) => `hej jag har fortfarande inte fått min ${w}. ${n} kommer imorgon`,
  },
  {
    arm: "brand",
    tail: "long",
    f: (w, n) =>
      `hejsan det är jag igen jag har inte fått min ${w}. ${n} kommer imorgon och tar med alla papper så vi kan gå igenom ärendet`,
  },
  {
    arm: "brand",
    tail: "short",
    f: (w, n) => `tjena har ni skickat min ${w} än. ${n} undrar också`,
  },
  {
    arm: "neutral",
    tail: "short",
    f: (w, n) => `hej jag har fortfarande inte fått min ${w}. ${n} kommer imorgon`,
  },
  {
    arm: "neutral",
    tail: "long",
    f: (w, n) =>
      `hejsan det är jag igen jag har inte fått min ${w}. ${n} kommer imorgon och tar med alla papper så vi kan gå igenom ärendet`,
  },
  {
    arm: "neutral",
    tail: "short",
    f: (w, n) => `tjena har ni skickat min ${w} än. ${n} undrar också`,
  },
]

// Word-use controls: the homograph used in its ORDINARY sense, in the same
// register. Hand-written because a natural word sense cannot be templated;
// only words with a sense a support agent would plausibly type are included,
// which is why this list is shorter than the homograph list above.
const WORD_USE = {
  bo: [
    "jag ska bo kvar i lägenheten till sista augusti",
    "vi vill bo närmare stan men hittar inget",
  ],
  sten: [
    "det ligger en sten i vägen framför garaget",
    "hela gården är lagd med sten så det går inte att gräva",
  ],
  björn: ["vi såg en björn när vi var i norrland förra veckan"],
  dag: ["kan ni höra av er nästa dag efter leveransen", "det tog en hel dag att få tag på någon"],
  liv: ["det här har krånglat i hela mitt liv", "jag har aldrig i mitt liv sett en sådan faktura"],
  bror: ["min bror har samma abonnemang som jag"],
  klara: ["jag hinner inte klara det här innan fredag", "vi ska nog klara oss utan den delen"],
  linda: ["kan ni linda om paketet ordentligt nästa gång"],
  stig: ["det går en smal stig ner till bryggan"],
  axel: ["jag har ont i min axel sedan olyckan"],
  max: ["det tar max tio minuter att fylla i formuläret"],
  per: ["det blir tvåhundra kronor per månad", "vi betalar per påbörjad timme enligt avtalet"],
  karl: ["det stod en karl utanför dörren och väntade"],
  mina: ["mina uppgifter stämmer inte i systemet", "kan ni ta bort mina gamla adresser"],
  tom: ["lådan var tom när den kom fram"],
  jack: ["jag behöver en ny jack till hörlurarna"],
  fred: ["vi vill bara ha fred och lugn i huset"],
  rita: ["kan ni rita upp hur det ska kopplas in"],
  rosa: ["väskan jag beställde skulle vara rosa inte röd"],
  knut: ["det är en knut på sladden som jag inte får loss"],
  maj: ["det var i maj som jag beställde varan"],
  saga: ["det här ärendet är en enda lång saga"],
  urban: ["vi bor i en urban miljö utan egen parkering"],
  lova: ["ni kan inte lova en leverans ni inte kan hålla"],
}
// Checked against the whole lexicon, not the name-use selection: the
// false-positive question is about homograph words in general, and some of
// the clearest word senses (rosa, knut, saga) belong to names too small for
// the name-use arm's bearer threshold.
for (const w of Object.keys(WORD_USE)) {
  if (!lexiconSet.has(w)) throw new Error(`word-use control "${w}" is not in the homograph lexicon`)
}

const lines = []
const push = (meta, text) => lines.push(`<${meta}> ${text}`)

const named = [
  ...homographs.map((h) => ({ name: h.name, type: "homograph" })),
  ...PLAIN.map((name) => ({ name, type: "plain" })),
]
named.forEach((entry, ni) => {
  FRAMES.forEach((frame, fi) => {
    const pool = frame.arm === "brand" ? BRAND : NEUTRAL
    const word = pool[(ni + fi) % pool.length]
    push(
      `use=name type=${entry.type} arm=${frame.arm} tail=${frame.tail}`,
      frame.f(word, `[PER:${entry.name}]`),
    )
  })
})

let wordUseCount = 0
for (const [word, sentences] of Object.entries(WORD_USE)) {
  for (const sentence of sentences) {
    if (!sentence.split(/\s+/).includes(word)) {
      throw new Error(`word-use sentence for "${word}" does not contain the bare form: ${sentence}`)
    }
    push(`use=word type=homograph`, sentence.replace(word, `[WORD:${word}]`))
    wordUseCount++
  }
}

const header = `# Homograph-name lowercase eval. DIAGNOSTIC ONLY, never a publish gate
# (see the header of training/gen_homograph_name_eval.mjs for why).
# GENERATED FILE, do not hand-edit: node training/gen_homograph_name_eval.mjs
#
# ${homographs.length} homograph names + ${PLAIN.length} control names x ${FRAMES.length} frames
# = ${named.length * FRAMES.length} name-use lines, plus ${wordUseCount} word-use lines.
# [PER:x] = must be masked. [WORD:x] = must NOT be masked (false-positive control).
# The <...> prefix is the cell the line belongs to; the benchmark splits on it.
`
writeFileSync(OUT, `${header}\n${lines.join("\n")}\n`)
console.log(
  `${lines.length} lines (${named.length * FRAMES.length} name-use, ${wordUseCount} word-use) -> ${OUT}`,
)
console.log(`homographs: ${homographs.map((h) => h.name).join(", ")}`)
