import { describe, expect, it } from "vitest"
import { corpus } from "../eval/corpus.mjs"
import { aggregate, evaluate, resolveSpans, scoreDocument } from "../eval/score.mjs"

/**
 * These tests do NOT load the model — they run in CI with no dependencies.
 * They guarantee two things:
 *   1. the gold corpus is internally consistent (every annotated span resolves),
 *   2. the scoring logic is correct (so the F1 numbers it reports can be trusted).
 *
 * The actual model grading lives in ../eval/run-eval.mjs and is opt-in until the
 * Swedish model is published — see that file's header.
 */

describe("eval corpus integrity", () => {
  it("every annotated entity resolves to a real span in its sentence", () => {
    for (const doc of corpus) {
      const spans = resolveSpans(doc.text, doc.entities)
      for (const s of spans) {
        expect(doc.text.slice(s.start, s.end)).toBe(s.value)
      }
    }
  })

  it("uses only the known free-text labels", () => {
    const allowed = new Set(["PERSON", "LOCATION", "ORGANIZATION"])
    for (const doc of corpus) {
      for (const e of doc.entities) {
        expect(allowed.has(e.label), `unexpected label ${e.label}`).toBe(true)
      }
    }
  })

  it("contains hard negatives (sentences with no entities)", () => {
    const negatives = corpus.filter((d) => d.entities.length === 0)
    expect(negatives.length).toBeGreaterThanOrEqual(3)
  })
})

describe("scoreDocument", () => {
  const gold = [
    { start: 0, end: 4, label: "PERSON" },
    { start: 10, end: 18, label: "LOCATION" },
  ]

  it("counts a perfect prediction as all true positives, no leaks", () => {
    const r = scoreDocument(gold, gold)
    expect(r.spanTp).toBe(2)
    expect(r.labeledTp).toBe(2)
    expect(r.spanFp).toBe(0)
    expect(r.spanFn).toBe(0)
    expect(r.leaks).toHaveLength(0)
  })

  it("flags a missed gold entity as a leak", () => {
    const pred = [{ start: 0, end: 4, label: "PERSON" }] // misses the LOCATION
    const r = scoreDocument(gold, pred)
    expect(r.spanTp).toBe(1)
    expect(r.spanFn).toBe(1)
    expect(r.leaks).toHaveLength(1)
    expect(r.leaks[0]?.label).toBe("LOCATION")
  })

  it("counts a spurious prediction as a false positive", () => {
    const pred = [...gold, { start: 30, end: 35, label: "PERSON" }]
    const r = scoreDocument(gold, pred)
    expect(r.spanTp).toBe(2)
    expect(r.spanFp).toBe(1)
  })

  it("a right span with the wrong label is a span TP but not a labeled TP", () => {
    const pred = [
      { start: 0, end: 4, label: "LOCATION" }, // correct span, wrong type
      { start: 10, end: 18, label: "LOCATION" },
    ]
    const r = scoreDocument(gold, pred)
    expect(r.spanTp).toBe(2)
    expect(r.labeledTp).toBe(1)
  })

  it("a partial overlap is not a leak (some of the PII is still masked)", () => {
    const pred = [{ start: 12, end: 18, label: "LOCATION" }] // overlaps the 10-18 gold
    const r = scoreDocument(gold, pred)
    expect(r.leaks.some((l) => l.start === 10)).toBe(false)
  })
})

describe("aggregate", () => {
  it("computes precision, recall and f1 over multiple documents", () => {
    // doc A: 2 gold, predicts both right. doc B: 2 gold, predicts 1 right + 1 wrong.
    const a = scoreDocument(
      [
        { start: 0, end: 4, label: "PERSON" },
        { start: 5, end: 9, label: "PERSON" },
      ],
      [
        { start: 0, end: 4, label: "PERSON" },
        { start: 5, end: 9, label: "PERSON" },
      ],
    )
    const b = scoreDocument(
      [
        { start: 0, end: 4, label: "PERSON" },
        { start: 5, end: 9, label: "PERSON" },
      ],
      [
        { start: 0, end: 4, label: "PERSON" },
        { start: 20, end: 24, label: "PERSON" }, // wrong
      ],
    )
    const m = aggregate([a, b])
    expect(m.support).toBe(4)
    expect(m.predicted).toBe(4)
    expect(m.spanTp ?? m.spanRecall).toBeDefined()
    expect(m.spanRecall).toBeCloseTo(0.75) // 3 of 4 found
    expect(m.spanPrecision).toBeCloseTo(0.75) // 3 of 4 predictions right
    expect(m.spanF1).toBeCloseTo(0.75)
    expect(m.leakCount).toBe(1) // doc B missed one entity entirely
  })

  it("treats an empty corpus / empty doc as precision 1 (nothing wrong)", () => {
    const r = scoreDocument([], [])
    const m = aggregate([r])
    expect(m.spanPrecision).toBe(1)
    expect(m.spanRecall).toBe(1)
    expect(m.leakCount).toBe(0)
  })
})

describe("evaluate (end-to-end with a stub recognizer)", () => {
  it("a perfect recognizer scores F1 = 1 and zero leaks on the real corpus", () => {
    // Stub that 'knows' the gold answers — proves the harness wiring is correct.
    const perfect = (text: string) => {
      const doc = corpus.find((d) => d.text === text)
      return doc ? resolveSpans(doc.text, doc.entities) : []
    }
    const { metrics } = evaluate(corpus, perfect)
    expect(metrics.spanF1).toBe(1)
    expect(metrics.labeledF1).toBe(1)
    expect(metrics.leakCount).toBe(0)
  })

  it("a do-nothing recognizer leaks every entity (recall 0)", () => {
    const { metrics } = evaluate(corpus, () => [])
    expect(metrics.spanRecall).toBe(0)
    expect(metrics.leakCount).toBe(metrics.support)
  })
})
