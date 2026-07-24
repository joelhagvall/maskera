#!/usr/bin/env node
/**
 * Address-safety companion to grade.mjs.
 *
 * grade.mjs deliberately defines a leak as zero overlap with a gold entity.
 * For an address, a partial mask can still expose the house number or part of
 * a number range. This script additionally reports whether every letter and
 * digit in each gold address is covered by the union of predicted spans.
 *
 * Usage:
 *   node bench/analyze-address-coverage.mjs osm-addresses
 *   node bench/analyze-address-coverage.mjs osm-addresses --json
 */
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const SENSITIVE_CHARACTER = /[\p{L}\p{N}]/u

export function classifyAddressCoverage(text, gold, predictions) {
  const sensitiveOffsets = []
  for (let offset = gold.start; offset < gold.end; offset += 1) {
    if (SENSITIVE_CHARACTER.test(text[offset] ?? "")) sensitiveOffsets.push(offset)
  }
  if (sensitiveOffsets.length === 0) throw new Error("gold address has no letters or digits")

  const coveredCharacters = sensitiveOffsets.filter((offset) =>
    predictions.some((span) => span.start <= offset && span.end > offset),
  ).length
  const exact = predictions.some((span) => span.start === gold.start && span.end === gold.end)
  const exactAddress = predictions.some(
    (span) => span.label === "ADDRESS" && span.start === gold.start && span.end === gold.end,
  )

  return {
    exact,
    exactAddress,
    fullCoverage: coveredCharacters === sensitiveOffsets.length,
    partialCoverage: coveredCharacters > 0 && coveredCharacters < sensitiveOffsets.length,
    fullLeak: coveredCharacters === 0,
    coveredCharacters,
    sensitiveCharacters: sensitiveOffsets.length,
  }
}

export function summarizeAddressCoverage(goldDocs, predictedDocs) {
  if (goldDocs.length !== predictedDocs.length) {
    throw new Error(`prediction has ${predictedDocs.length} docs; corpus has ${goldDocs.length}`)
  }

  const rows = goldDocs.map((document, index) => {
    const prediction = predictedDocs[index]
    if (prediction?.text !== document.text) throw new Error(`doc ${index} text mismatch`)
    const addresses = document.gold.filter((span) => span.label === "ADDRESS")
    if (addresses.length !== 1) {
      throw new Error(`doc ${index} must contain exactly one ADDRESS gold span`)
    }
    const gold = addresses[0]
    return {
      index,
      value: gold.value ?? document.text.slice(gold.start, gold.end),
      casing: document.source?.casing ?? "unknown",
      region: document.source?.region ?? "unknown",
      ...classifyAddressCoverage(document.text, gold, prediction.spans),
    }
  })

  const aggregate = (items) => ({
    documents: items.length,
    exact: items.filter((row) => row.exact).length,
    exactAddress: items.filter((row) => row.exactAddress).length,
    fullCoverage: items.filter((row) => row.fullCoverage).length,
    partialCoverage: items.filter((row) => row.partialCoverage).length,
    fullLeaks: items.filter((row) => row.fullLeak).length,
  })
  const groupBy = (key) =>
    Object.fromEntries(
      [...new Set(rows.map((row) => row[key]))].map((value) => [
        value,
        aggregate(rows.filter((row) => row[key] === value)),
      ]),
    )

  return {
    overall: aggregate(rows),
    byCasing: groupBy("casing"),
    byRegion: groupBy("region"),
    materialMisses: rows
      .filter((row) => !row.fullCoverage)
      .map(({ index, value, casing, region, partialCoverage, fullLeak }) => ({
        index,
        value,
        casing,
        region,
        kind: fullLeak ? "full-leak" : partialCoverage ? "partial-leak" : "unknown",
      })),
  }
}

function pct(numerator, denominator) {
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}

function runCli() {
  const corpusName = process.argv[2]
  const asJson = process.argv.includes("--json")
  if (!corpusName || !/^[a-z0-9][a-z0-9-]*$/u.test(corpusName)) {
    console.error("usage: node bench/analyze-address-coverage.mjs <corpus-name> [--json]")
    process.exit(1)
  }

  const corpus = JSON.parse(readFileSync(join(HERE, "corpora", `${corpusName}.json`), "utf8"))
  const files = readdirSync(join(HERE, "out"))
    .filter((file) => file.startsWith(`${corpusName}.`) && file.endsWith(".json"))
    .sort()
  const results = files.map((file) => {
    const prediction = JSON.parse(readFileSync(join(HERE, "out", file), "utf8"))
    return {
      system: prediction.system,
      ...summarizeAddressCoverage(corpus, prediction.docs),
    }
  })

  if (asJson) {
    console.log(JSON.stringify({ corpus: corpusName, results }, null, 2))
    return
  }

  console.log(`\n=== ${corpusName}: material address coverage ===\n`)
  console.log("| system | exact span | fully covered | partial leaks | full leaks |")
  console.log("| --- | ---: | ---: | ---: | ---: |")
  for (const result of results) {
    const metric = result.overall
    console.log(
      `| ${result.system} | ${metric.exact}/${metric.documents} (${pct(metric.exact, metric.documents)}) | ${metric.fullCoverage}/${metric.documents} (${pct(metric.fullCoverage, metric.documents)}) | ${metric.partialCoverage} | ${metric.fullLeaks} |`,
    )
  }
  for (const result of results) {
    if (result.materialMisses.length === 0) continue
    console.log(`\n${result.system} material misses:`)
    for (const miss of result.materialMisses) {
      console.log(`  ${miss.kind}: "${miss.value}" (${miss.casing}, ${miss.region})`)
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli()
