#!/usr/bin/env node
/**
 * Export Maskera's redacted text for the same ordered corpus sent through
 * LogosGuard. The comparison scorer then evaluates both products with one
 * character-survival definition.
 *
 * Build packages/core and packages/ner first, then run from the repo root:
 *   node bench/run-maskera-domain.mjs
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createNerRecognizer, redactWithNer } from "../packages/ner/dist/index.js"

const repoRoot = fileURLToPath(new URL("../", import.meta.url))
const corpusDirectory = new URL("../packages/ner/eval/domain-regression/corpus/", import.meta.url)
const outputFlag = process.argv.indexOf("--out")
const outputPath = resolve(
  repoRoot,
  outputFlag >= 0 ? process.argv[outputFlag + 1] : "tmp/maskera-domain.redacted.jsonl",
)
const model = process.env.MASKERA_MODEL ?? "maskera-sv-ner-v19"
const modelPath = resolve(repoRoot, process.env.MASKERA_MODEL_PATH ?? "apps/demo/public/models")
const dtype = process.env.MASKERA_DTYPE ?? "q4"
const profile = process.env.MASKERA_PROFILE ?? "general"

if (!existsSync(resolve(modelPath, model, "config.json"))) {
  throw new Error(`Model ${model} is absent below ${modelPath}`)
}

const corpus = []
for (const file of readdirSync(corpusDirectory)
  .filter((name) => name.endsWith(".mjs"))
  .sort()) {
  const module = await import(new URL(file, corpusDirectory))
  corpus.push(...module.default)
}

const recognizer = createNerRecognizer({
  model,
  localModelPath: modelPath,
  allowLocalModels: true,
  allowRemoteModels: false,
  device: "cpu",
  dtype,
})
await recognizer.ready

const records = []
const startedAt = performance.now()
for (const [index, test] of corpus.entries()) {
  const { text, redactions } = await redactWithNer(test.text, { recognizer, profile })
  records.push({ id: test.id, category: test.kategori, text, redactions: redactions.length })
  if ((index + 1) % 25 === 0 || index + 1 === corpus.length) {
    console.log(`[${index + 1}/${corpus.length}] complete`)
  }
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8")

console.log(
  `Maskera ${model} (${dtype}, CPU): ${corpus.length} texts in ${((performance.now() - startedAt) / 1000).toFixed(1)} s`,
)
console.log(`result: ${relative(repoRoot, outputPath)}`)
