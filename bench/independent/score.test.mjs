import assert from "node:assert/strict"
import test from "node:test"
import { mergeAdjacent, scoreCorpus, summarize, typeOf } from "./score.mjs"

const row = (id, text, gold, clean = gold.length === 0) => ({ id, text, gold, clean })

test("typed matching is one-to-one and counts unmatched detections against precision", () => {
  const rows = [
    row("a", "Anna, Eva och Bo", [
      { start: 0, end: 4, type: "PER" },
      { start: 14, end: 16, type: "PER" },
    ]),
  ]
  // Eva is a real name but not in the gold: it counts against precision.
  const preds = new Map([
    [
      "a",
      [
        { start: 0, end: 4, label: "NAMN" },
        { start: 6, end: 9, label: "NAMN" },
      ],
    ],
  ])
  const per = scoreCorpus("maskera", rows, preds).byType.PER
  assert.deepEqual([per.tp, per.fp, per.fn], [1, 1, 1])
})

test("masked recall counts any label, typed recall only the right one", () => {
  const rows = [row("a", "Ring Anna", [{ start: 5, end: 9, type: "PER" }])]
  const preds = new Map([["a", [{ start: 5, end: 9, label: "PLATS" }]]])
  const per = scoreCorpus("maskera", rows, preds).byType.PER
  assert.equal(per.tp, 0)
  assert.equal(per.maskedRecallPct, 100)
})

test("swedish-pii first and last names merge into one detection", () => {
  const merged = mergeAdjacent("swedish-pii", "Anna Andersson bor", [
    { start: 0, end: 4, label: "PER_FIRST" },
    { start: 5, end: 14, label: "PER_LAST" },
  ])
  assert.deepEqual(merged, [{ start: 0, end: 14, label: "PER_FIRST" }])
})

test("only sentences marked clean count toward over-masking", () => {
  const rows = [row("clean", "Det regnar.", []), row("other", "Boken Röda rummet.", [], false)]
  const preds = new Map([
    ["clean", [{ start: 4, end: 10, label: "NAMN" }]],
    ["other", [{ start: 6, end: 17, label: "NAMN" }]],
  ])
  const clean = scoreCorpus("maskera", rows, preds).clean
  assert.deepEqual(clean, { sentences: 1, withDetection: 1, withDetectionPct: 100, spans: 1 })
})

test("types marked * score like the plain type", () => {
  const rows = [row("a", "Ring 070-174 06 05", [{ start: 5, end: 18, type: "PHONE*" }])]
  const preds = new Map([["a", [{ start: 5, end: 18, label: "TELEFON" }]]])
  assert.equal(scoreCorpus("maskera", rows, preds).byType["PHONE*"].tp, 1)
})

test("system labels map to shared types", () => {
  assert.equal(typeOf("presidio", "PERSON"), "PER")
  assert.equal(typeOf("openai-privacy-filter", "private_address"), "ADDRESS")
  assert.equal(typeOf("swedish-pii", "SE_PERSONAL_IDENTITY_NUMBER_MALE"), "PERSONNUMMER")
  assert.equal(typeOf("maskera", "OKÄND"), null)
})

test("summary pools distinct texts and skips systems missing a corpus", () => {
  const cell = (masked, entities, clean = null) => ({
    byType: { PER: { masked, entities } },
    clean,
  })
  const results = {
    "suc3-test-cased": {
      a: cell(9, 10, { sentences: 100, withDetection: 20, withDetectionPct: 20 }),
      b: cell(1, 10, { sentences: 100, withDetection: 5, withDetectionPct: 5 }),
    },
    "multiconer-sv": { a: cell(5, 10), b: cell(1, 10) },
    "ai4privacy-sv": { a: cell(6, 10) },
    "sic2-sv": {
      a: cell(4, 10, { sentences: 50, withDetection: 10, withDetectionPct: 20 }),
      b: cell(2, 10, { sentences: 50, withDetection: 1, withDetectionPct: 2 }),
    },
  }
  const summary = summarize(results)
  assert.deepEqual(summary.a.names, { masked: 24, total: 40, maskedPct: 60 })
  assert.deepEqual(summary.a.overMasking, { sentences: 150, withDetection: 30, pct: 20 })
  assert.equal(summary.b.names, null)
})
