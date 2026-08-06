import assert from "node:assert/strict"
import test from "node:test"
import { classifyAddressCoverage, summarizeAddressCoverage } from "./analyze-address-coverage.mjs"

const street = "Maskeragatan"
const address = street + " 12-14"
const partialAddress = street + " 12"
const sensitiveLength = address.replace(/[^\p{L}\p{N}]/gu, "").length
const text = "skicka till " + address + " idag"
const start = text.indexOf(street)
const gold = { start, end: start + address.length, label: "ADDRESS" }

test("classifies exact, split, partial and missing address coverage", () => {
  assert.deepEqual(classifyAddressCoverage(text, gold, [{ ...gold }]), {
    exact: true,
    exactAddress: true,
    fullCoverage: true,
    partialCoverage: false,
    fullLeak: false,
    coveredCharacters: sensitiveLength,
    sensitiveCharacters: sensitiveLength,
  })

  const split = [
    { start, end: start + street.length, label: "LOCATION" },
    { start: start + street.length + 1, end: gold.end, label: "ADDRESS" },
  ]
  assert.equal(classifyAddressCoverage(text, gold, split).fullCoverage, true)
  assert.equal(classifyAddressCoverage(text, gold, split).exact, false)

  const partial = [{ start, end: start + partialAddress.length, label: "ADDRESS" }]
  assert.equal(classifyAddressCoverage(text, gold, partial).partialCoverage, true)
  assert.equal(classifyAddressCoverage(text, gold, partial).fullLeak, false)

  assert.equal(classifyAddressCoverage(text, gold, []).fullLeak, true)
})

test("summarizes material misses and validates text alignment", () => {
  const corpus = [
    {
      text,
      gold: [{ ...gold, value: address }],
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
