#!/usr/bin/env node
/**
 * Rare-surname publish-gate eval: rare surnames in the chat/support register.
 *
 * Why it exists: the v12 publish hold. v12 leaks rare DECOMPOSED surnames in
 * the target register ("hej jag heter tjulander..." unmasked) where v11 masks
 * them; that robustness was luck-of-the-mix, never designed or measured. This
 * eval makes it a designed, gated property (see docs/ROADMAP.md v13/v14).
 *
 * FRAME ROTATION (v14): v13 take 4 trained on frames near the ORIGINAL
 * templates, partially burning them as a gate. Per docs/ROADMAP.md the 18
 * fresh frames from the v13 fresh-frame check are now the PRIMARY gate
 * (eval/rare-surnames.txt); the original v13 frames are kept as a SECONDARY
 * set (--legacy -> eval/rare-surnames-legacy.txt). The held-out property is
 * the 98 SURNAMES (identical across both sets and across the rotation, so
 * numbers remain comparable); v14 candidates must not train on frames near
 * the NEW primary either, or the rotation repeats next round.
 *
 * What it generates: a few hundred chat-register sentences, each with ONE bare
 * rare surname, written in the same [PER:...] gold format as eval/gold.txt.
 * Surname candidates are filtered so that every kept name:
 *   1. DECOMPOSES under the trimmed inference vocab (>= 2 wordpieces, no
 *      [UNK]) in BOTH cased and lowercase form. The trimmed vocab is what the
 *      shipped artifact tokenizes with, so this is the failure surface.
 *      Default vocab: the shipped v13 artifact's 20k vocab.txt (verified to
 *      keep the same 98 surnames as the v13-round v12-trim vocab), env
 *      TRIM_VOCAB overrides.
 *   2. Does NOT appear (case-insensitive) in the training data
 *      (data/train.jsonl, data/val.jsonl), the data generator's gazetteers
 *      (generate_data.mjs), or the existing gold sets. These names must never
 *      be trained on, or the eval stops measuring generalisation.
 *
 * Deterministic: no RNG at all, template assignment is index-based. Re-run
 * after any data change:   node gen_rare_surname_eval.mjs
 * Collision check only (for run scripts, exits 1 on any hit):
 *                          node gen_rare_surname_eval.mjs --check
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const TRIM_VOCAB =
  process.env.TRIM_VOCAB ?? resolve(HERE, "../apps/demo/public/models/maskera-sv-ner-v13/vocab.txt")
const CHECK_ONLY = process.argv.includes("--check")
// --legacy: same held-out surnames, the pre-rotation v13 template set (see
// FRAME ROTATION above). Secondary signal only; the gate runs on the primary.
const LEGACY = process.argv.includes("--legacy")
const OUT = resolve(HERE, LEGACY ? "eval/rare-surnames-legacy.txt" : "eval/rare-surnames.txt")

// Real, rare Swedish surnames (soldier names, nature compounds, noble names,
// -ander/-elius latinisations). Over-inclusive on purpose: the decomposition
// and collision filters below decide what is actually usable. Famous bearers
// are fine (the property under test is subword robustness, not novelty), but
// anything that shows up in training data is dropped by filter 2.
const CANDIDATES = [
  "Tjulander",
  "Tjernström",
  "Tibblin",
  "Tegmark",
  "Tingsten",
  "Torekull",
  "Troedsson",
  "Themptander",
  "Thorvaldsson",
  "Trolle",
  "Uddenberg",
  "Uggla",
  "Ulvskog",
  "Unckel",
  "Uvnäs",
  "Vennberg",
  "Vinterhed",
  "Wachtmeister",
  "Wallquist",
  "Wetterstrand",
  "Wigforss",
  "Wijkman",
  "Wirsén",
  "Wästberg",
  "Zennström",
  "Åkerhielm",
  "Ängquist",
  "Öhrström",
  "Örtendahl",
  "Almroth",
  "Alsterlund",
  "Ankarberg",
  "Backelin",
  "Bexelius",
  "Billström",
  "Bjurström",
  "Blidberg",
  "Brandell",
  "Brogren",
  "Brynolf",
  "Bäckdahl",
  "Cavallin",
  "Cederlöf",
  "Cedervall",
  "Delblanc",
  "Duvander",
  "Edfeldt",
  "Ekedahl",
  "Ekelöf",
  "Elfstrand",
  "Elmlund",
  "Enocksson",
  "Fagerlind",
  "Fahlgren",
  "Fjellman",
  "Flodberg",
  "Fogelklou",
  "Forslid",
  "Frostenson",
  "Fägerquist",
  "Gadelius",
  "Granlycke",
  "Grönblad",
  "Gyllenhammar",
  "Gyllensten",
  "Hagströmer",
  "Hallonsten",
  "Hasselrot",
  "Hedenblad",
  "Hellspong",
  "Hildingsson",
  "Hjertén",
  "Holmertz",
  "Hultkrantz",
  "Husmark",
  "Hyltenstam",
  "Häggroth",
  "Högfeldt",
  "Idermark",
  "Ingelman",
  "Jerneck",
  "Jonzon",
  "Kindblom",
  "Kjellander",
  "Klingspor",
  "Kolmodin",
  "Kullenberg",
  "Kyhlberg",
  "Lagercrantz",
  "Leijonborg",
  "Lidbeck",
  "Liljencrantz",
  "Lindeblad",
  "Munkhammar",
  "Myrdal",
  "Månberg",
  "Nauclér",
  "Nyrén",
  "Ohlander",
  "Orrenius",
  "Palmcrantz",
  "Quennerstedt",
  "Ramel",
  "Reenstierna",
  "Rehnberg",
  "Reuterswärd",
  "Ribbing",
  "Rosenblad",
  "Rudbeck",
  "Runefelt",
  "Rådström",
  "Rönnlund",
  "Sahlgren",
  "Sandelin",
  "Segerfeldt",
  "Silfverberg",
  "Sommarström",
  "Sparrman",
  "Stagnelius",
  "Stenudd",
  "Stiernstedt",
  "Stolpe",
  "Strandhäll",
  "Sundelius",
  "Säfström",
  "Tegnér",
  "Kallifatides",
  "Mannerheim",
  "Melldahl",
  "Millgård",
  "Mogensen",
  "Hammarlind",
  "Ehrnrooth",
]

// Chat/support-register templates, one {s}=lowercase / {S}=cased / {U}=CAPS
// slot each. Mostly lowercase: that is the target register and the leak class.
// LEGACY_TEMPLATES was the v13 primary; v13 take 4 trained eval-near frames
// against it, so it is secondary from v14 on (see FRAME ROTATION above).
const LEGACY_TEMPLATES = [
  { t: "hej jag heter {s} och min beställning har inte kommit fram", c: "lower" },
  { t: "hej det är {s} igen, jag ringde igår om min faktura", c: "lower" },
  { t: "be {s} återkomma imorgon förmiddag", c: "lower" },
  { t: "kan ni be {s} ringa upp mig i eftermiddag?", c: "lower" },
  { t: "mvh {s}", c: "lower" },
  { t: "hälsningar {s}", c: "lower" },
  { t: "jag pratade med {s} på supporten i förra veckan", c: "lower" },
  { t: "min handläggare heter {s} men hon svarar inte", c: "lower" },
  { t: "ärendet gäller {s} och fakturan från mars", c: "lower" },
  { t: "har ni fått mejlet från {s}?", c: "lower" },
  { t: "beställningen står på efternamnet {s}", c: "lower" },
  { t: "återbetalningen till {s} har inte kommit", c: "lower" },
  { t: "hej! det är {s} här, jag undrar om min retur", c: "lower" },
  { t: "vi väntar fortfarande på svar från {s}", c: "lower" },
  { t: "Hej, jag heter {S} och vill ändra min leveransadress.", c: "cased" },
  { t: "Kunden {S} vill säga upp sitt avtal.", c: "cased" },
  { t: "{S} har fortfarande inte fått något svar på sitt ärende.", c: "cased" },
  { t: "RING {U} OMGÅENDE", c: "caps" },
]
// The v14 PRIMARY gate frames (the v13 round's "fresh" set: observed in the
// v13 fresh-frame check but never trained on). Disjoint from LEGACY_TEMPLATES
// and from the training templates. Do NOT add training frames near these.
const TEMPLATES = [
  { t: "ok, jag skickar vidare ärendet till {s} på en gång", c: "lower" },
  { t: "fakturan är märkt med {s} som referens", c: "lower" },
  { t: "vem är {s}? vi har fått deras post till vår adress", c: "lower" },
  { t: "har lämnat två meddelanden till {s} utan att få svar", c: "lower" },
  { t: "boka om torsdagens möte med {s} till nästa vecka", c: "lower" },
  { t: "leveransen kvitterades av {s} igår kväll", c: "lower" },
  { t: "{s} ringde in vid niotiden och var ganska upprörd", c: "lower" },
  { t: "svara {s} innan ni stänger ärendet, tack", c: "lower" },
  { t: "på fakturan står namnet {s} men adressen är gammal", c: "lower" },
  { t: "garantin är registrerad på {s} sedan i våras", c: "lower" },
  { t: "enligt anteckningarna talade ni med {s} i onsdags", c: "lower" },
  { t: "avtalet förnyades av {s} via mejl", c: "lower" },
  { t: "ni stavade fel, efternamnet ska vara {s}", c: "lower" },
  { t: "returen godkändes av {s} på lagret", c: "lower" },
  { t: "Ärendet är överlämnat till {S} för vidare hantering.", c: "cased" },
  { t: "Enligt {S} är paketet redan utlämnat.", c: "cased" },
  { t: "Signerat: {S}, den 3 juni.", c: "cased" },
  { t: "VIKTIGT MEDDELANDE TILL {U} OM DIN FAKTURA", c: "caps" },
]
const PER_NAME = 3 // templates per surname

// --- WordPiece (greedy longest-match-first, BERT cased: no lowercasing) ----
function wordpiece(word, vocab) {
  const pieces = []
  let start = 0
  while (start < word.length) {
    let end = word.length
    let cur = null
    while (start < end) {
      let sub = word.slice(start, end)
      if (start > 0) sub = `##${sub}`
      if (vocab.has(sub)) {
        cur = sub
        break
      }
      end--
    }
    if (cur === null) return null // [UNK]
    pieces.push(cur)
    start = end
  }
  return pieces
}

const vocab = new Set(
  readFileSync(TRIM_VOCAB, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean),
)
console.log(`trim vocab: ${TRIM_VOCAB} (${vocab.size} pieces)`)

// --- filter 1: must decompose under the trimmed vocab, both casings --------
const decomposing = []
for (const name of CANDIDATES) {
  const cased = wordpiece(name, vocab)
  const lower = wordpiece(name.toLowerCase(), vocab)
  if (cased && cased.length >= 2 && lower && lower.length >= 2) decomposing.push(name)
}
console.log(`decomposition filter: ${decomposing.length}/${CANDIDATES.length} kept`)

// --- filter 2: must not exist anywhere the model trains on -----------------
const SOURCES = [
  "data/train.jsonl",
  "data/val.jsonl",
  "generate_data.mjs",
  "eval/gold.txt",
  "eval/gold-real.txt",
].map((p) => resolve(HERE, p))
const haystacks = SOURCES.filter((p) => existsSync(p)).map((p) => ({
  p,
  text: readFileSync(p, "utf8").toLowerCase(),
}))
const collisions = []
const kept = decomposing.filter((name) => {
  const hit = haystacks.find((h) => h.text.includes(name.toLowerCase()))
  if (hit) collisions.push(`${name} (in ${hit.p})`)
  return !hit
})
console.log(`collision filter: ${kept.length}/${decomposing.length} kept`)
if (collisions.length) for (const c of collisions) console.log(`  dropped: ${c}`)

if (CHECK_ONLY) {
  // Guard for run scripts: verify no surname in the CURRENT eval file leaked
  // into the (re)built training data.
  const inEval = new Set()
  for (const m of readFileSync(OUT, "utf8").matchAll(/\[PER:([^\]]+)\]/g)) {
    const n = m[1]
    inEval.add(n[0].toUpperCase() + n.slice(1).toLowerCase())
  }
  const bad = [...inEval].filter((n) => haystacks.some((h) => h.text.includes(n.toLowerCase())))
  if (bad.length) {
    console.error(`CHECK FAIL: eval surnames found in training sources: ${bad.join(", ")}`)
    process.exit(1)
  }
  console.log(`CHECK PASS: ${inEval.size} eval surnames absent from all training sources`)
  process.exit(0)
}

// --- generate ---------------------------------------------------------------
const ACTIVE = LEGACY ? LEGACY_TEMPLATES : TEMPLATES
const lines = [
  `# rare-surname chat-register eval${LEGACY ? " (LEGACY v13 frames, secondary)" : " (publish gate, v14-rotated frames)"}. GENERATED FILE, do`,
  `# not hand-edit: node training/gen_rare_surname_eval.mjs${LEGACY ? " --legacy" : ""} regenerates it.`,
  "# NEVER add these surnames to any training data or gazetteer; the",
  "# generator drops any name that appears there, and run_v13.sh re-checks.",
  `# ${kept.length} surnames x ${PER_NAME} templates = ${kept.length * PER_NAME} sentences.`,
  "",
]
for (let i = 0; i < kept.length; i++) {
  const name = kept[i]
  for (let k = 0; k < PER_NAME; k++) {
    const tpl = ACTIVE[(i + k * 6) % ACTIVE.length]
    const form =
      tpl.c === "lower" ? name.toLowerCase() : tpl.c === "caps" ? name.toUpperCase() : name
    lines.push(tpl.t.replace(/\{[sSU]\}/, `[PER:${form}]`))
  }
}
writeFileSync(OUT, `${lines.join("\n")}\n`)
console.log(`wrote ${OUT}: ${kept.length * PER_NAME} sentences, ${kept.length} surnames`)
