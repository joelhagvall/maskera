import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const result = JSON.parse(
  await readFile(new URL("../docs/benchmark-logosguard-2.4.4.json", import.meta.url), "utf8"),
)

test("the published product comparison has internally consistent totals", () => {
  assert.equal(result.corpus.texts, 258)
  assert.equal(result.corpus.annotations, 952)

  for (const system of Object.values(result.systems)) {
    assert.equal(system.documents.length, result.corpus.texts)
    assert.equal(
      system.totals.hits + system.totals.partials + system.totals.misses,
      result.corpus.annotations,
    )
    assert.equal(
      system.documents.reduce((sum, document) => sum + document.hits, 0),
      system.totals.hits,
    )
    assert.equal(
      system.documents.reduce((sum, document) => sum + document.partials, 0),
      system.totals.partials,
    )
    assert.equal(
      system.documents.reduce((sum, document) => sum + document.misses, 0),
      system.totals.misses,
    )
  }
})

test("the frozen comparison matches the measured v19 and LogosGuard totals", () => {
  assert.deepEqual(result.systems.maskera.totals, {
    texts: 258,
    annotations: 952,
    hits: 933,
    partials: 8,
    misses: 11,
    redactions: 1522,
    fullHitRatePct: "98.0",
    leakRatePct: "2.0",
  })
  assert.deepEqual(result.systems.logosguard.totals, {
    texts: 258,
    annotations: 952,
    hits: 606,
    partials: 49,
    misses: 297,
    redactions: 735,
    fullHitRatePct: "63.7",
    leakRatePct: "36.3",
  })
})

test("partial character survival is not promoted to a full hit", () => {
  const document = result.systems.logosguard.documents.find(({ id }) => id === "bank-forsakring-01")
  assert.deepEqual(document.annotations[2], {
    materialCharacters: 10,
    retainedCharacters: 7,
    outcome: "partial",
  })
})

test("the public result contains hashes and outcomes, not missed clear text", () => {
  for (const system of Object.values(result.systems)) {
    for (const document of system.documents) {
      assert.match(document.maskedSha256, /^[a-f0-9]{64}$/)
      assert.equal("masked" in document, false)
      assert.equal(
        document.annotations.some((annotation) => "value" in annotation),
        false,
      )
    }
  }
  assert.equal(
    result.method.encoding,
    "LogosGuard 2.4.4 returned UTF-8 input as reversible Windows-1252 mojibake; output text was restored to Unicode before scoring.",
  )
})
