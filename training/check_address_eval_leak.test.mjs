import assert from "node:assert/strict"
import test from "node:test"
import {
  extractAddressSurfaces,
  findAddressEvalLeaks,
  normalizeAddressSurface,
} from "./check_address_eval_leak.mjs"

test("normalizes punctuation and reconstructs BIO address surfaces", () => {
  assert.equal(normalizeAddressSurface("Södra Vägen 12-B"), "södravägen12b")
  assert.deepEqual(
    extractAddressSurfaces({
      tokens: ["Till", "Södra", "Vägen", "12", "-", "B", "."],
      tags: ["O", "B-ADR", "I-ADR", "I-ADR", "I-ADR", "I-ADR", "O"],
    }),
    ["södravägen12b"],
  )
})

test("finds exact held-out addresses but permits category-level relatives", () => {
  const text = "Södra Vägen 12-B"
  const corpus = [{ text, gold: [{ start: 0, end: text.length, label: "ADDRESS", value: text }] }]
  const matching = JSON.stringify({
    tokens: ["Södra", "Vägen", "12", "B"],
    tags: ["B-ADR", "I-ADR", "I-ADR", "I-ADR"],
  })
  const relative = JSON.stringify({
    tokens: ["Norra", "Vägen", "12", "B"],
    tags: ["B-ADR", "I-ADR", "I-ADR", "I-ADR"],
  })

  assert.equal(findAddressEvalLeaks(corpus, [{ file: "train", text: matching }]).length, 1)
  assert.equal(findAddressEvalLeaks(corpus, [{ file: "train", text: relative }]).length, 0)
})
