import assert from "node:assert/strict"
import test from "node:test"
import { evaluateRatchet, lowerBaseline, staleOverrideFiles } from "./biome-ratchet.mjs"

test("evaluateRatchet passes on exact match", () => {
  const base = { "a.ts": { "lint/a11y/useSemanticElements": 2 } }
  assert.deepEqual(evaluateRatchet(base, { "a.ts": { "lint/a11y/useSemanticElements": 2 } }), {
    ok: true,
    growth: [],
    slack: [],
  })
})

test("evaluateRatchet fails on growth and on slack", () => {
  const base = { "a.ts": { "lint/a11y/useSemanticElements": 2 } }
  const grew = evaluateRatchet(base, { "a.ts": { "lint/a11y/useSemanticElements": 3 } })
  assert.equal(grew.ok, false)
  assert.equal(grew.growth.length, 1)

  const shrunk = evaluateRatchet(base, { "a.ts": { "lint/a11y/useSemanticElements": 1 } })
  assert.equal(shrunk.ok, false)
  assert.equal(shrunk.slack.length, 1)
})

test("lowerBaseline only lowers counts and drops zeroed entries", () => {
  const base = {
    "a.ts": { r1: 2, r2: 1 },
    "b.ts": { r1: 3 },
  }
  const actual = {
    "a.ts": { r1: 1 },
    "b.ts": { r1: 5 },
  }
  assert.deepEqual(lowerBaseline(base, actual), {
    "a.ts": { r1: 1 },
    "b.ts": { r1: 3 },
  })
})

test("staleOverrideFiles names single-file overrides that no longer exist, never globs", () => {
  const config = {
    overrides: [
      { includes: ["apps/demo/src/Gone.tsx", "apps/demo/src/Here.tsx", "**/public/*.svg"] },
      { includes: ["packages/mcp/src/files.ts"] },
    ],
  }
  const present = new Set(["apps/demo/src/Here.tsx", "packages/mcp/src/files.ts"])
  assert.deepEqual(
    staleOverrideFiles(config, (path) => present.has(path)),
    ["apps/demo/src/Gone.tsx"],
  )
})
