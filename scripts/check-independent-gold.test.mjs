import assert from "node:assert/strict"
import test from "node:test"
import { validateIndependentGold } from "./check-independent-gold.mjs"

const provenance = {
  independentlyAuthored: true,
  fictional: true,
  annotatedBeforeModelRun: true,
  excludedFromTraining: true,
  writersSawModelOutput: false,
  frozenAt: "2026-08-09",
}

function row(index, overrides = {}) {
  const writer = `W${(index % 3) + 1}`
  const register = ["support", "healthcare", "authority", "everyday"][index % 4]
  const value = `Provnamn${index}`
  return {
    text: `hej ${value} bor på Maskeragatan ${index + 1}`,
    entities: [
      { value, label: "PERSON" },
      { value: `Maskeragatan ${index + 1}`, label: "ADDRESS" },
    ],
    writer,
    register,
    collected: "2026-08-09",
    secondReviewed: index < 40,
    ...overrides,
  }
}

test("accepts a complete frozen corpus contract", () => {
  const corpus = Array.from({ length: 200 }, (_, index) => row(index))
  assert.deepEqual(validateIndependentGold({ corpus, provenance, freeze: true }), [])
})

test("rejects provenance, annotation and independence gaps without echoing values", () => {
  const sensitiveValue = "should-not-appear-in-diagnostics"
  const corpus = [
    row(0, {
      text: "duplicate",
      writer: "real writer name",
      register: "news",
      collected: "09/08/2026",
      secondReviewed: undefined,
      entities: [{ value: sensitiveValue, label: "ADDRESS" }],
    }),
    row(1, { text: "duplicate" }),
  ]
  const issues = validateIndependentGold({
    corpus,
    provenance: { independentlyAuthored: false },
    freeze: true,
  })
  assert.ok(issues.length > 0)
  assert.equal(issues.join("\n").includes(sensitiveValue), false)
  assert.ok(issues.some((issue) => issue.includes("duplicates another row")))
  assert.ok(issues.some((issue) => issue.includes("at least 200 rows")))
})
