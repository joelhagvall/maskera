/**
 * Sample the pseudo-labeled informal corpus into the training mix
 * (docs/ROADMAP.md v14, "the main bet").
 *
 * Input: .benchmark/pseudo-labeled.jsonl from pseudo_label.py: Flashback /
 * Familjeliv sentences (Språkbanken, CC BY 4.0) carrying BOTH voters' views:
 * the v13-recipe teacher's tags + per-word confidences (t_tags/t_conf, our
 * four-class scheme) and the sbx PI-detection model's mapped tags (s_tags).
 * The full pool stays on disk in .benchmark/ ("build it once, use it twice":
 * it is also the prerequisite for any future ~15 MB student); this converter
 * only appends a bounded, register-targeted sample.
 *
 * Agreement policy (measured on a 5k probe, not assumed): the sbx scheme
 * under-fires badly in this register (it confirmed 25/205 of the teacher's
 * PER spans and 0/179 ORG spans), so any policy that treats it as a VETO
 * guts exactly the register signal we are after (an exact-agreement draft
 * kept 0.2% entity rows). What it CAN do is lower the confidence bar where
 * it does agree, and flag teacher misses. Per teacher span:
 *   - conf >= PSEUDO_SOLO_CONF stands on its own (probe eyeball at 0.97:
 *     80/81 real names or forum handles, 1 junk all-caps common word);
 *   - sbx overlap with the same label lowers the bar to PSEUDO_MIN_CONF;
 *   - ADR: row dropped (no second voter can confirm addresses).
 * A row is kept only if EVERY teacher span passes, and every sbx PER/LOC/ORG
 * span overlaps SOME teacher span (an sbx-only entity suggests a teacher
 * miss: those tokens would be trained as O, the v11a slot-poison shape).
 * Empty rows need both voters empty.
 *
 * Sampling is stratified toward the known register gaps, in priority order:
 *   1. rows with a LOWERCASE PER span (lowercase name frames, nickname chat),
 *   2. rows with any PER span,
 *   3. rows with ORG/LOC spans (informal-register org signal),
 *   4. entity-free rows as hard negatives, capped at PSEUDO_EMPTY_SHARE.
 * Within each stratum rows are hash-shuffled (deterministic, not
 * confidence-ranked, so the sample keeps hard examples) and round-robined
 * across source forums.
 *
 * Safety filter: rows containing any surname from the rare-surname gate eval
 * are DROPPED (substring, case-insensitive: the same rule that
 * gen_rare_surname_eval.mjs --check enforces on the built data).
 *
 * Usage: node convert_pseudo.mjs [srcJsonl] [trainJsonl] [valJsonl]
 * Knobs: PSEUDO_TOTAL (default 20000), PSEUDO_EMPTY_SHARE (0.3),
 *        PSEUDO_MIN_CONF (0.85), PSEUDO_SOLO_CONF (0.97),
 *        PSEUDO_DEV_SHARE (0.1)
 */
import { appendFileSync, readFileSync } from "node:fs"

const SRC = process.argv[2] ?? ".benchmark/pseudo-labeled.jsonl"
const TRAIN_DEST = process.argv[3] ?? "data/train.jsonl"
const VAL_DEST = process.argv[4] ?? "data/val.jsonl"
const TOTAL = Number(process.env.PSEUDO_TOTAL ?? 20000)
const EMPTY_SHARE = Number(process.env.PSEUDO_EMPTY_SHARE ?? 0.3)
const MIN_CONF = Number(process.env.PSEUDO_MIN_CONF ?? 0.85)
const SOLO_CONF = Number(process.env.PSEUDO_SOLO_CONF ?? 0.97)
const DEV_SHARE = Number(process.env.PSEUDO_DEV_SHARE ?? 0.1)

for (const [name, value, lo, hi] of [
  ["PSEUDO_TOTAL", TOTAL, 1, 1e6],
  ["PSEUDO_EMPTY_SHARE", EMPTY_SHARE, 0, 1],
  ["PSEUDO_MIN_CONF", MIN_CONF, 0, 1],
  ["PSEUDO_SOLO_CONF", SOLO_CONF, 0, 1],
  ["PSEUDO_DEV_SHARE", DEV_SHARE, 0, 1],
]) {
  if (!Number.isFinite(value) || value < lo || value > hi) {
    throw new Error(`${name} must be in [${lo}, ${hi}]; got ${value}`)
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

// Word-level BIO tags -> [{start, end, label}]. Tolerates bare I- starts.
const spansFromBio = (tags) => {
  const spans = []
  let start = null
  let label = null
  for (let i = 0; i <= tags.length; i++) {
    const tag = tags[i] ?? "O"
    const cur = tag.includes("-") ? tag.split("-", 2)[1] : null
    if (start !== null && (tag.startsWith("B-") || cur !== label)) {
      spans.push({ start, end: i, label })
      start = null
    }
    if (cur !== null && start === null) {
      start = i
      label = cur
    }
  }
  return spans
}
const overlaps = (a, b) => a.start < b.end && b.start < a.end

// The gate eval's surnames: never train on them (see gen_rare_surname_eval.mjs).
const EVAL_SURNAMES = [
  ...new Set(
    [...readFileSync("eval/rare-surnames.txt", "utf-8").matchAll(/\[PER:([^\]]+)\]/g)].map((m) =>
      m[1].toLowerCase(),
    ),
  ),
]

const rows = []
const seen = new Set()
const stats = { pool: 0, adr: 0, unconfirmed: 0, sbxOnly: 0, surname: 0, dup: 0 }
for (const line of readFileSync(SRC, "utf-8").split("\n")) {
  if (!line.trim()) continue
  const r = JSON.parse(line)
  stats.pool++
  const tSpans = spansFromBio(r.t_tags)
  if (tSpans.some((s) => s.label === "ADR")) {
    stats.adr++
    continue
  }
  const sSpans = spansFromBio(r.s_tags)
  const spanConf = (s) => Math.min(...r.t_conf.slice(s.start, s.end))
  const passes = (s) => {
    const confirmed = sSpans.some((x) => x.label === s.label && overlaps(x, s))
    return spanConf(s) >= (confirmed ? MIN_CONF : SOLO_CONF)
  }
  if (!tSpans.every(passes)) {
    stats.unconfirmed++
    continue
  }
  if (!sSpans.every((x) => tSpans.some((s) => overlaps(x, s)))) {
    stats.sbxOnly++
    continue
  }
  const joined = r.tokens.join(" ").toLowerCase()
  if (EVAL_SURNAMES.some((s) => joined.includes(s))) {
    stats.surname++
    continue
  }
  const key = r.tokens.join(" ")
  if (seen.has(key)) {
    stats.dup++
    continue
  }
  seen.add(key)
  // Strict-BIO repair: the teacher's word-level argmax can emit an orphan
  // I-X (no preceding B-/I-X of the same type); rewrite it to B-X, the same
  // reading spansFromBio used above. audit_data.mjs enforces strict BIO.
  const tags = r.t_tags.map((tag, i) => {
    if (!tag.startsWith("I-")) return tag
    const prev = i > 0 ? r.t_tags[i - 1] : "O"
    const type = tag.slice(2)
    return prev === `B-${type}` || prev === `I-${type}` ? tag : `B-${type}`
  })
  rows.push({ tokens: r.tokens, tags, src: r.src, nEnt: tSpans.length })
}

const hasLowerPer = (r) =>
  r.tags.some((t, i) => t.endsWith("PER") && r.tokens[i] === r.tokens[i].toLowerCase())
const hasPer = (r) => r.tags.some((t) => t.endsWith("PER"))

const strata = { lowerPer: [], per: [], orgLoc: [], empty: [] }
for (const r of rows) {
  if (r.nEnt === 0) strata.empty.push(r)
  else if (hasLowerPer(r)) strata.lowerPer.push(r)
  else if (hasPer(r)) strata.per.push(r)
  else strata.orgLoc.push(r)
}

// Deterministic shuffle + round-robin over sources so no forum dominates.
const bySource = (list) => {
  const groups = new Map()
  for (const r of list.sort((a, b) => hash01(a.tokens.join(" ")) - hash01(b.tokens.join(" ")))) {
    if (!groups.has(r.src)) groups.set(r.src, [])
    groups.get(r.src).push(r)
  }
  const queues = [...groups.values()]
  const out = []
  for (let i = 0; queues.some((q) => i < q.length); i++) {
    for (const q of queues) if (i < q.length) out.push(q[i])
  }
  return out
}

const emptyBudget = Math.round(TOTAL * EMPTY_SHARE)
const entityBudget = TOTAL - emptyBudget
const picked = []
for (const name of ["lowerPer", "per", "orgLoc"]) {
  picked.push(...bySource(strata[name]).slice(0, entityBudget - picked.length))
}
const pickedEmpty = bySource(strata.empty).slice(0, emptyBudget)

const trainOut = []
const valOut = []
for (const r of [...picked, ...pickedEmpty]) {
  const serialized = JSON.stringify({ tokens: r.tokens, tags: r.tags })
  if (hash01(r.tokens.join("")) < DEV_SHARE) valOut.push(serialized)
  else trainOut.push(serialized)
}
appendFileSync(TRAIN_DEST, `${trainOut.join("\n")}\n`)
appendFileSync(VAL_DEST, `${valOut.join("\n")}\n`)

console.log(
  `pseudo pool: ${stats.pool} rows (dropped: ${stats.adr} adr, ${stats.unconfirmed} unconfirmed, ${stats.sbxOnly} sbx-only-entity, ${stats.surname} eval-surname, ${stats.dup} dup)`,
)
console.log(
  `strata: lowerPer ${strata.lowerPer.length}, per ${strata.per.length}, orgLoc ${strata.orgLoc.length}, empty ${strata.empty.length}`,
)
console.log(
  `appended ${trainOut.length} train + ${valOut.length} val (entity ${picked.length}, empty ${pickedEmpty.length})`,
)
