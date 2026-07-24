#!/usr/bin/env node
/**
 * Microsoft Azure AI Language predictions for the shared Swedish gold sets.
 * Runs both PII detection and general NER because Azure splits the four gold
 * labels across those features. The union reuses their responses and causes
 * no third API call.
 *
 * Credentials stay in environment variables and are never written or logged:
 *
 *   AZURE_LANGUAGE_ENDPOINT=https://... \
 *   AZURE_LANGUAGE_KEY=... \
 *   node bench/run-azure.mjs
 *
 * Optional final argument: curated, adr, gold-real, osm-addresses,
 * osm-addresses-holdout, or all (the default).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { AZURE_API_VERSION, analyzeFeature, mergeFeatureSpans } from "./azure-language.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ALL_CORPORA = ["gold-real", "adr", "curated", "osm-addresses"]
const SUPPORTED_CORPORA = [...ALL_CORPORA, "osm-addresses-holdout"]
const requestedCorpus = process.argv[2] ?? "all"
const corpora = requestedCorpus === "all" ? ALL_CORPORA : [requestedCorpus]

if (corpora.some((name) => !SUPPORTED_CORPORA.includes(name))) {
  console.error(
    "usage: node bench/run-azure.mjs [curated|adr|gold-real|osm-addresses|osm-addresses-holdout|all]",
  )
  process.exit(1)
}

const endpoint = process.env.AZURE_LANGUAGE_ENDPOINT ?? process.env.LANGUAGE_ENDPOINT
const key = process.env.AZURE_LANGUAGE_KEY ?? process.env.LANGUAGE_KEY
if (!endpoint || !key) {
  console.error(
    "AZURE_LANGUAGE_ENDPOINT and AZURE_LANGUAGE_KEY are required (LANGUAGE_ENDPOINT/KEY also work)",
  )
  process.exit(1)
}

const outDir = join(HERE, "out")
mkdirSync(outDir, { recursive: true })

function writePrediction(corpus, prediction) {
  const out = join(outDir, `${corpus}.${prediction.system}.json`)
  writeFileSync(
    out,
    JSON.stringify(
      {
        system: prediction.system,
        corpus,
        metadata: { measuredAt: new Date().toISOString(), ...prediction.metadata },
        docs: prediction.docs,
      },
      null,
      1,
    ),
  )
  console.log(`${corpus}: ${prediction.system} -> ${out}`)
}

for (const corpus of corpora) {
  const gold = JSON.parse(readFileSync(join(HERE, "corpora", `${corpus}.json`), "utf8"))
  console.log(`\n${corpus}: ${gold.length} Swedish documents`)

  const pii = await analyzeFeature({
    endpoint,
    key,
    feature: "pii",
    documents: gold,
    onBatch: ({ completed, total }) => process.stdout.write(`\r  Azure PII ${completed}/${total}`),
  })
  process.stdout.write("\n")
  writePrediction(corpus, pii)

  const ner = await analyzeFeature({
    endpoint,
    key,
    feature: "ner",
    documents: gold,
    onBatch: ({ completed, total }) => process.stdout.write(`\r  Azure NER ${completed}/${total}`),
  })
  process.stdout.write("\n")
  writePrediction(corpus, ner)

  const union = {
    system: "azure-pii-ner",
    docs: gold.map((document, index) => ({
      text: document.text,
      // PII is primary so an exact duplicate keeps its privacy-specific label
      // (notably ADDRESS) instead of the broader NER label.
      spans: mergeFeatureSpans(pii.docs[index].spans, ner.docs[index].spans),
    })),
    metadata: {
      provider: "Microsoft Azure AI Language",
      feature: "PiiEntityRecognition + EntityRecognition",
      apiVersion: AZURE_API_VERSION,
      modelVersions: {
        pii: pii.metadata.modelVersion,
        ner: ner.metadata.modelVersion,
      },
      requestedModelVersion: "latest",
      language: "sv",
      loggingOptOut: true,
      stringIndexType: "Utf16CodeUnit",
      requestCount: pii.metadata.requestCount + ner.metadata.requestCount,
      textRecords: pii.metadata.textRecords + ner.metadata.textRecords,
      durationMs: pii.metadata.durationMs + ner.metadata.durationMs,
      warningCount: pii.metadata.warningCount + ner.metadata.warningCount,
      sources: ["azure-pii", "azure-ner"],
    },
  }
  writePrediction(corpus, union)
}

console.log("\nGrade with:")
for (const corpus of corpora) console.log(`  node bench/grade.mjs ${corpus}`)
