#!/usr/bin/env node
/**
 * maskera predictions for the bench: the shipped pipeline (model +
 * reconstruct()), same artifact and settings as docs/BENCHMARKS.md
 * (joelhagvall/maskera-sv-ner, dtype q4, cpu).
 *
 *   pnpm -C packages/ner build   # dist must exist
 *   node bench/run-maskera.mjs [curated|adr|gold-real|osm-addresses|osm-addresses-holdout|all]
 *
 * A local candidate never overwrites the shipped baseline when MASKERA_SYSTEM
 * is unique:
 *   MASKERA_MODEL=student-v19-address-t1-onnx \
 *   MASKERA_MODEL_PATH="$PWD/training" \
 *   MASKERA_SYSTEM=maskera-v19-address-t1 \
 *   node bench/run-maskera.mjs osm-addresses
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createNerRecognizer } from "../packages/ner/dist/index.js"

const HERE = dirname(fileURLToPath(import.meta.url))
const ALL_CORPORA = ["curated", "adr", "gold-real", "osm-addresses"]
const SUPPORTED_CORPORA = [...ALL_CORPORA, "osm-addresses-holdout"]
const requestedCorpus = process.argv[2] ?? "all"
const corpora = requestedCorpus === "all" ? ALL_CORPORA : [requestedCorpus]
if (corpora.some((name) => !SUPPORTED_CORPORA.includes(name))) {
  console.error(
    "usage: node bench/run-maskera.mjs [curated|adr|gold-real|osm-addresses|osm-addresses-holdout|all]",
  )
  process.exit(1)
}
const model = process.env.MASKERA_MODEL ?? "joelhagvall/maskera-sv-ner"
const localModelPath = process.env.MASKERA_MODEL_PATH
  ? `${resolve(process.env.MASKERA_MODEL_PATH)}/`
  : undefined
const system = process.env.MASKERA_SYSTEM ?? "maskera"
if (!/^[a-z0-9][a-z0-9-]*$/u.test(system)) {
  console.error("MASKERA_SYSTEM must contain only lowercase letters, digits and hyphens")
  process.exit(1)
}
mkdirSync(join(HERE, "out"), { recursive: true })

const recognizer = createNerRecognizer({
  model,
  dtype: process.env.MASKERA_DTYPE ?? "q4",
  device: "cpu",
  localModelPath,
  allowLocalModels: localModelPath !== undefined,
  allowRemoteModels: localModelPath === undefined,
  // The bench corpora keep the CoNLL-style vocabulary (PERSON/LOCATION/...)
  // even though the product default is Swedish (NAMN/PLATS/...), so map
  // explicitly instead of relying on the default.
  labelMap: (g) =>
    ({ PER: "PERSON", LOC: "LOCATION", ORG: "ORGANIZATION", ADR: "ADDRESS" })[g] ?? g,
})
console.log(
  `loading ${model} (${process.env.MASKERA_DTYPE ?? "q4"}) from ${localModelPath ?? "the HF Hub"} …`,
)
await recognizer.ready

for (const name of corpora) {
  const gold = JSON.parse(readFileSync(join(HERE, "corpora", `${name}.json`), "utf8"))
  const docs = []
  for (const doc of gold) {
    const spans = (await recognizer.detect(doc.text)).map((s) => ({
      start: s.start,
      end: s.end,
      label: s.label,
    }))
    docs.push({ text: doc.text, spans })
  }
  const out = join(HERE, "out", `${name}.${system}.json`)
  writeFileSync(out, JSON.stringify({ system, corpus: name, model, docs }, null, 1))
  console.log(`${name}: ${docs.length} docs -> ${out}`)
}
