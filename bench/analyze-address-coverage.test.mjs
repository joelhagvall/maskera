import assert from "node:assert/strict"
import test from "node:test"
import { classifyAddressCoverage, summarizeAddressCoverage } from "./analyze-address-coverage.mjs"

const text = "skicka till Storgatan 12-14 idag"
const start = text.indexOf("Storgatan")
const gold = { start, end: start + "Storgatan 12-14".length, label: "ADDRESS" }

test("classifies exact, split, partial and missing address coverage", () => {
  assert.deepEqual(classifyAddressCoverage(text, gold, [{ ...gold }]), {
    exact: true,
    exactAddress: true,
    fullCoverage: true,
    partialCoverage: false,
    fullLeak: false,
    coveredCharacters: 13,
    sensitiveCharacters: 13,
  })

  const split = [
    { start, end: start + 9, label: "LOCATION" },
    { start: start + 10, end: gold.end, label: "ADDRESS" },
  ]
  assert.equal(classifyAddressCoverage(text, gold, split).fullCoverage, true)
  assert.equal(classifyAddressCoverage(text, gold, split).exact, false)

  const partial = [{ start, end: start + "Storgatan 12".length, label: "ADDRESS" }]
  assert.equal(classifyAddressCoverage(text, gold, partial).partialCoverage, true)
  assert.equal(classifyAddressCoverage(text, gold, partial).fullLeak, false)

  assert.equal(classifyAddressCoverage(text, gold, []).fullLeak, true)
})

test("summarizes material misses and validates text alignment", () => {
  const corpus = [
    {
      text,
      gold: [{ ...gold, value: "Storgatan 12-14" }],
      source: { casing: "original", region: "Test" },
    },
  ]
  const summary = summarizeAddressCoverage(corpus, [{ text, spans: [] }])
  assert.equal(summary.overall.fullLeaks, 1)
  assert.equal(summary.materialMisses[0].kind, "full-leak")
  assert.throws(
    () => summarizeAddressCoverage(corpus, [{ text: "fel text", spans: [] }]),
    /text mismatch/,
  )
})
