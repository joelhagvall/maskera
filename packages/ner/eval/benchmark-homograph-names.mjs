#!/usr/bin/env node
/**
 * Homograph-name lowercase benchmark: DIAGNOSTIC, not a publish gate.
 *
 * Grades a model on training/eval/homograph-names.txt (see
 * training/gen_homograph_name_eval.mjs for how that set is built and why).
 * Two things are measured, and they pull in opposite directions:
 *
 *   [PER:x] name-use lines  -> leaks (a gold name covered by NO detection),
 *                              broken out by cell so the contrast is visible:
 *                              homograph vs plain name, brand vs neutral word
 *                              before the name, short vs long tail after it.
 *   [WORD:x] word-use lines -> false positives (an ordinary word flagged as
 *                              anything). This is the number that says why a
 *                              lowercase first-name gazetteer is the wrong
 *                              fix: it would push leaks down by pushing this
 *                              straight up.
 *
 * DO NOT TURN THIS INTO A GATE. It is six generated sentence frames; a
 * threshold on it trains the next round against the frame, the failure the
 * v14 rare-surname frame rotation already had to undo. Read it before and
 * after a round as a contrast, not as a bar.
 *
 *   MASKERA_REMOTE=1 node packages/ner/eval/benchmark-homograph-names.mjs
 * or with a local model copy:
 *   MASKERA_MODEL_PATH="$PWD/training" MASKERA_MODEL=student-v19-onnx \
 *   node packages/ner/eval/benchmark-homograph-names.mjs
 *
 * Env: same as benchmark-rare-surnames.mjs (BENCHMARK_FILE, MASKERA_REMOTE,
 * MASKERA_MODEL_PATH, MASKERA_MODEL, MASKERA_DTYPE).
 */
import fs from "node:fs"

const FILE = process.env.BENCHMARK_FILE ?? "training/eval/homograph-names.txt"
const REMOTE = process.env.MASKERA_REMOTE === "1"
const MODEL =
  process.env.MASKERA_MODEL ?? (REMOTE ? "joelhagvall/maskera-sv-ner" : "maskera-sv-ner")
const MODEL_PATH = process.env.MASKERA_MODEL_PATH
const DTYPE = process.env.MASKERA_DTYPE ?? "q4"

function skip(reason) {
  console.log(`\nbenchmark skipped: ${reason}`)
  process.exit(0)
}

if (!fs.existsSync(FILE)) skip(`no data at ${FILE} (node training/gen_homograph_name_eval.mjs)`)
if (!MODEL_PATH && !REMOTE)
  skip("set MASKERA_MODEL_PATH to the directory containing the model folder, or MASKERA_REMOTE=1")

// --- parse "<meta> text with [PER:x] / [WORD:x]" ---------------------------
const TAG = /\[(PER|WORD):([^\]]+)\]/g
const docs = []
for (const line of fs.readFileSync(FILE, "utf8").split("\n")) {
  if (!line.trim() || line.trimStart().startsWith("#")) continue
  const metaMatch = /^<([^>]*)>\s*/.exec(line)
  if (!metaMatch) throw new Error(`line without a <meta> prefix: ${line}`)
  const meta = Object.fromEntries(metaMatch[1].split(/\s+/).map((kv) => kv.split("=")))
  const body = line.slice(metaMatch[0].length)

  let text = ""
  let pos = 0
  const gold = []
  const forbidden = []
  TAG.lastIndex = 0
  let m = TAG.exec(body)
  while (m) {
    text += body.slice(pos, m.index)
    const span = { start: text.length, end: text.length + m[2].length, value: m[2] }
    text += m[2]
    ;(m[1] === "PER" ? gold : forbidden).push(span)
    pos = m.index + m[0].length
    m = TAG.exec(body)
  }
  text += body.slice(pos)
  docs.push({ text, gold, forbidden, meta })
}

let createNerRecognizer
try {
  ;({ createNerRecognizer } = await import("maskera"))
} catch {
  skip('could not import "maskera"; run `pnpm -C packages/ner build` first')
}

console.log(`\nHomograph-name benchmark (diagnostic): ${docs.length} sentences from ${FILE}`)
console.log(
  `Loading model "${MODEL}" (dtype=${DTYPE}) from ${REMOTE ? "the HF Hub" : MODEL_PATH} ...`,
)
const recognizer = createNerRecognizer({
  model: MODEL,
  dtype: DTYPE,
  device: "cpu",
  ...(REMOTE
    ? { allowRemoteModels: true }
    : { localModelPath: MODEL_PATH, allowLocalModels: true, allowRemoteModels: false }),
  labelMap: (g) => g,
})
try {
  await recognizer.ready
} catch (err) {
  skip(`model failed to load: ${String(err).split("\n")[0]}`)
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end
const results = []
for (const doc of docs) {
  const pred = await recognizer.detect(doc.text)
  results.push({
    doc,
    goldHits: doc.gold.map((g) => pred.some((p) => overlaps(p, g))),
    falsePositives: doc.forbidden.filter((f) => pred.some((p) => overlaps(p, f))),
  })
}

// --- name-use: leaks per cell ---------------------------------------------
const nameUse = results.filter((r) => r.doc.meta.use === "name")
const cell = (pred) => {
  const rows = nameUse.filter((r) => pred(r.doc.meta))
  const total = rows.reduce((n, r) => n + r.goldHits.length, 0)
  const leaks = rows.reduce((n, r) => n + r.goldHits.filter((h) => !h).length, 0)
  return { total, leaks, rate: total ? leaks / total : 0 }
}
const show = (label, c) =>
  console.log(
    `${label.padEnd(30)} n=${String(c.total).padStart(3)}  leaks=${String(c.leaks).padStart(3)}  ${(100 * c.rate).toFixed(1).padStart(5)}%`,
  )

console.log("\n=== name-use: leak rate (lower is better) ===")
show(
  "all",
  cell(() => true),
)
for (const type of ["homograph", "plain"])
  show(
    type,
    cell((m) => m.type === type),
  )
console.log("")
for (const type of ["homograph", "plain"])
  for (const arm of ["brand", "neutral"])
    show(
      `${type} / ${arm} word before`,
      cell((m) => m.type === type && m.arm === arm),
    )
console.log("")
for (const type of ["homograph", "plain"])
  for (const tail of ["short", "long"])
    show(
      `${type} / ${tail} tail`,
      cell((m) => m.type === type && m.tail === tail),
    )

console.log("\n--- leaked names (name-use) ---")
const perName = new Map()
for (const r of nameUse) {
  for (let i = 0; i < r.doc.gold.length; i++) {
    const key = r.doc.gold[i].value
    const rec = perName.get(key) ?? { total: 0, leaks: 0, type: r.doc.meta.type }
    rec.total++
    if (!r.goldHits[i]) rec.leaks++
    perName.set(key, rec)
  }
}
const leaked = [...perName].filter(([, v]) => v.leaks).sort((a, b) => b[1].leaks - a[1].leaks)
if (!leaked.length) console.log("  none")
for (const [name, v] of leaked)
  console.log(`  ${name.padEnd(12)} ${v.leaks}/${v.total}  (${v.type})`)

// --- word-use: false positives --------------------------------------------
const wordUse = results.filter((r) => r.doc.meta.use === "word")
const wordTotal = wordUse.reduce((n, r) => n + r.doc.forbidden.length, 0)
const wordFp = wordUse.reduce((n, r) => n + r.falsePositives.length, 0)
console.log("\n=== word-use: false positives on the same words (lower is better) ===")
console.log(`ordinary-word occurrences: ${wordTotal}`)
console.log(`flagged as an entity:      ${wordFp}  (${((100 * wordFp) / wordTotal).toFixed(1)}%)`)
for (const r of wordUse.filter((r) => r.falsePositives.length))
  console.log(`  flagged "${r.falsePositives.map((f) => f.value).join(", ")}": ${r.doc.text}`)

const all = cell(() => true)
console.log(
  `\nRESULT leak_rate=${all.rate.toFixed(4)} leaks=${all.leaks}/${all.total} homograph_leak_rate=${cell((m) => m.type === "homograph").rate.toFixed(4)} plain_leak_rate=${cell((m) => m.type === "plain").rate.toFixed(4)} word_fp=${wordFp}/${wordTotal}`,
)
