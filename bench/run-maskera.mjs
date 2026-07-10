#!/usr/bin/env node
/**
 * maskera predictions for the bench: the shipped pipeline (model +
 * reconstruct()), same artifact and settings as docs/BENCHMARKS.md
 * (joelhagvall/maskera-sv-ner, dtype q4, cpu).
 *
 *   pnpm -C packages/ner build   # dist must exist
 *   node bench/run-maskera.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createNerRecognizer } from "../packages/ner/dist/index.js"

const HERE = dirname(fileURLToPath(import.meta.url))
const CORPORA = ["curated", "adr", "gold-real"]
mkdirSync(join(HERE, "out"), { recursive: true })

const recognizer = createNerRecognizer({
  model: "joelhagvall/maskera-sv-ner",
  dtype: process.env.MASKERA_DTYPE ?? "q4",
  device: "cpu",
  allowRemoteModels: true,
  // The bench corpora keep the CoNLL-style vocabulary (PERSON/LOCATION/...)
  // even though the product default is Swedish (NAMN/PLATS/...), so map
  // explicitly instead of relying on the default.
  labelMap: (g) =>
    ({ PER: "PERSON", LOC: "LOCATION", ORG: "ORGANIZATION", ADR: "ADDRESS" })[g] ?? g,
})
console.log("loading maskera-sv-ner (q4) from the HF Hub …")
await recognizer.ready

for (const name of CORPORA) {
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
  const out = join(HERE, "out", `${name}.maskera.json`)
  writeFileSync(out, JSON.stringify({ system: "maskera", corpus: name, docs }, null, 1))
  console.log(`${name}: ${docs.length} docs -> ${out}`)
}
