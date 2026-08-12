#!/usr/bin/env node
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  contractPath,
  evaluationEnvironmentSha256,
  firstDifference,
  readJson,
  sha256FileSet,
} from "./benchmark-contract.mjs"

const pct1 = (value) => (value * 100).toFixed(1)
const pct2 = (value) => (value * 100).toFixed(2)

export function expectedSnapshot(contract) {
  const { metrics } = contract
  return {
    curated: metrics.curated,
    syntheticAdr: metrics.syntheticAdr,
    linkedinStyle: {
      documents: metrics.linkedinStyle.documents,
      entities: metrics.linkedinStyle.entities,
      precisionPct: metrics.linkedinStyle.precisionPct,
      recallPct: metrics.linkedinStyle.recallPct,
      spanF1Pct: metrics.linkedinStyle.spanF1Pct,
      labeledF1Pct: metrics.linkedinStyle.labeledF1Pct,
      leaks: metrics.linkedinStyle.leaks,
    },
    syntheticGold: {
      typeF1Pct: metrics.syntheticGold.typeF1Pct,
      typeRecallPct: metrics.syntheticGold.typeRecallPct,
      maskedRecallPct: metrics.syntheticGold.maskedRecallPct,
    },
    rareSurnames: metrics.rareSurnames,
    structuredRegression: metrics.structuredRegression,
    clinicalCareSubset: metrics.clinicalCareSubset,
  }
}

function nerSnapshot(result, extras = {}) {
  return {
    documents: result.documents,
    entities: result.metrics.support,
    ...extras,
    precisionPct: pct1(result.metrics.spanPrecision),
    recallPct: pct1(result.metrics.spanRecall),
    spanF1Pct: pct1(result.metrics.spanF1),
    labeledF1Pct: pct1(result.metrics.labeledF1),
    leaks: result.metrics.leakCount,
  }
}

function sumCategories(result, names) {
  const totals = { entities: 0, hits: 0, classifiedJunk: 0 }
  for (const name of names) {
    const category = result.categories[name]
    if (!category) throw new Error(`domain result is missing category ${name}`)
    totals.entities += category.annotations
    totals.hits += category.hits
    totals.classifiedJunk += category.candidates
  }
  return totals
}

export function observedSnapshot(results) {
  const careCategories = ["sjukhus", "vard-psyk", "vard-remiss"]
  const generalCare = sumCategories(results.domainGeneral, careCategories)
  const clinicalCare = sumCategories(results.domainClinical, careCategories)
  const general = results.domainGeneral.totals

  return {
    curated: nerSnapshot(results.curated),
    syntheticAdr: nerSnapshot(results.syntheticAdr, {
      addresses: results.syntheticAdr.goldLabels.ADDRESS ?? 0,
      addressPredictions: results.syntheticAdr.predictionLabels.ADDRESS ?? 0,
    }),
    linkedinStyle: nerSnapshot(results.linkedinStyle),
    syntheticGold: {
      typeF1Pct: pct2(results.syntheticGold.metrics.typed.f1),
      typeRecallPct: pct2(results.syntheticGold.metrics.typed.recall),
      maskedRecallPct: pct2(results.syntheticGold.metrics.covered.recall),
    },
    rareSurnames: {
      entities: results.rareSurnames.entities,
      masked: results.rareSurnames.masked,
      maskedRecallPct: pct2(results.rareSurnames.maskedRecall),
      personTypedRecallPct: pct2(results.rareSurnames.personTypedRecall),
      leaks: results.rareSurnames.leaks,
    },
    structuredRegression: {
      documents: general.texts,
      entities: general.annotations,
      fullHits: general.hits,
      partialLeaks: general.partials,
      misses: general.misses,
      hitRatePct: pct1(general.hitRate),
      redactions: general.redactions,
      classifiedJunk: general.candidates,
    },
    clinicalCareSubset: {
      entities: generalCare.entities,
      generalHits: generalCare.hits,
      clinicalHits: clinicalCare.hits,
      generalClassifiedJunk: generalCare.classifiedJunk,
      clinicalClassifiedJunk: clinicalCare.classifiedJunk,
    },
  }
}

async function loadResults(directory, contract) {
  const names = {
    curated: "curated.json",
    syntheticAdr: "synthetic-adr.json",
    linkedinStyle: "linkedin-style.json",
    syntheticGold: "synthetic-gold.json",
    rareSurnames: "rare-surnames.json",
    domainGeneral: "domain-general.json",
    domainClinical: "domain-clinical.json",
  }
  const results = { contract }
  for (const [name, file] of Object.entries(names)) {
    results[name] = await readJson(resolve(directory, file))
  }
  return results
}

export async function verifyPublishedEval(directory, suppliedContract) {
  const contract = suppliedContract ?? (await readJson(contractPath))
  const actualSuiteHash = await sha256FileSet(contract.evaluation.files)
  if (actualSuiteHash !== contract.evaluation.suiteSha256) {
    return {
      path: "$.evaluation.suiteSha256",
      expected: contract.evaluation.suiteSha256,
      actual: actualSuiteHash,
    }
  }
  const actualEnvironmentHash = await evaluationEnvironmentSha256(contract.evaluation.environment)
  if (actualEnvironmentHash !== contract.evaluation.environment.sha256) {
    return {
      path: "$.evaluation.environment.sha256",
      expected: contract.evaluation.environment.sha256,
      actual: actualEnvironmentHash,
    }
  }
  const actual = observedSnapshot(await loadResults(directory, contract))
  return firstDifference(expectedSnapshot(contract), actual)
}

async function main() {
  const directory = resolve(process.cwd(), process.argv[2] ?? "tmp/release-benchmark-results")
  const difference = await verifyPublishedEval(directory)
  if (difference) {
    console.error("PUBLISHED BENCHMARK REPRODUCTION DRIFT")
    console.error(`path:     ${difference.path}`)
    console.error(`expected: ${JSON.stringify(difference.expected)}`)
    console.error(`actual:   ${JSON.stringify(difference.actual)}`)
    process.exit(1)
  }
  const contract = await readJson(contractPath)
  console.log(
    `published benchmark reproduction: ${contract.release} metrics exactly reproduced from suite ${contract.evaluation.suiteSha256.slice(0, 12)} in environment ${contract.evaluation.environment.sha256.slice(0, 12)}`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
