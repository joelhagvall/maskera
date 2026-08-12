import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"
import { expectedSnapshot, observedSnapshot } from "./verify-published-eval.mjs"

const root = resolve(import.meta.dirname, "..")

function nerResult(documents, entities, metrics, goldLabels = {}, predictionLabels = {}) {
  return {
    documents,
    goldLabels,
    predictionLabels,
    metrics: {
      support: entities,
      spanPrecision: metrics.precision,
      spanRecall: metrics.recall,
      spanF1: metrics.f1,
      labeledF1: metrics.labeledF1,
      leakCount: metrics.leaks,
    },
  }
}

test("published eval output is normalized with the contract's documented rounding", () => {
  const category = (annotations, hits, candidates) => ({ annotations, hits, candidates })
  const results = {
    contract: { lastMeasuredAt: "2026-08-10" },
    curated: nerResult(149, 205, {
      precision: 0.953,
      recall: 0.985,
      f1: 0.969,
      labeledF1: 0.959,
      leaks: 1,
    }),
    syntheticAdr: nerResult(
      41,
      57,
      { precision: 1, recall: 1, f1: 1, labeledF1: 0.965, leaks: 0 },
      { ADDRESS: 35 },
      { ADDRESS: 36 },
    ),
    linkedinStyle: nerResult(32, 53, {
      precision: 0.758,
      recall: 0.887,
      f1: 0.817,
      labeledF1: 0.783,
      leaks: 0,
    }),
    syntheticGold: {
      metrics: { typed: { f1: 0.9308, recall: 0.9407 }, covered: { recall: 0.9831 } },
    },
    rareSurnames: {
      entities: 294,
      masked: 285,
      maskedRecall: 285 / 294,
      personTypedRecall: 243 / 294,
      leaks: 9,
    },
    domainGeneral: {
      totals: {
        texts: 258,
        annotations: 952,
        hits: 940,
        partials: 1,
        misses: 11,
        hitRate: 940 / 952,
        redactions: 1522,
        candidates: 276,
      },
      categories: {
        sjukhus: category(45, 45, 31),
        "vard-psyk": category(60, 60, 40),
        "vard-remiss": category(60, 60, 41),
      },
    },
    domainClinical: {
      categories: {
        sjukhus: category(45, 45, 25),
        "vard-psyk": category(60, 60, 32),
        "vard-remiss": category(60, 60, 35),
      },
    },
  }

  const observed = observedSnapshot(results)
  assert.equal(observed.linkedinStyle.measuredAt, undefined)
  assert.equal(observed.syntheticGold.typeF1Pct, "93.08")
  assert.equal(observed.rareSurnames.maskedRecallPct, "96.94")
  assert.equal(observed.rareSurnames.personTypedRecallPct, "82.65")
  assert.equal(observed.syntheticAdr.addressPredictions, 36)
  assert.deepEqual(observed.clinicalCareSubset, {
    entities: 165,
    generalHits: 165,
    clinicalHits: 165,
    generalClassifiedJunk: 112,
    clinicalClassifiedJunk: 92,
  })
})

test("release reproduction ignores measurement metadata from independently dated benchmarks", () => {
  const contract = JSON.parse(readFileSync(resolve(root, "docs/benchmark-release.json"), "utf8"))
  contract.lastMeasuredAt = "2026-08-11"
  contract.metrics.linkedinStyle.measuredAt = "2026-08-10"

  assert.deepEqual(expectedSnapshot(contract).linkedinStyle, {
    documents: 32,
    entities: 53,
    precisionPct: "75.8",
    recallPct: "88.7",
    spanF1Pct: "81.7",
    labeledF1Pct: "78.3",
    leaks: 0,
  })
})

test("deployment reproduction skips only outside production", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/run-release-benchmarks.mjs", "--if-production"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, VERCEL_ENV: "preview" },
    },
  )
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  assert.match(result.stdout, /skipped outside a production deployment/)
})
