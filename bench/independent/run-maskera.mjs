#!/usr/bin/env node
/**
 * Run Maskera (rules + the published NER model, CPU) over independent corpora
 * in the shared format and write its detections for score.mjs.
 *
 * Input: one or more corpus files from build_corpora.py, JSONL with
 *   {"id": string, "text": string, "gold": [{start, end, type}]}
 * Output: <out-dir>/maskera/<corpus>.jsonl with
 *   {"id": string, "preds": [{start, end, label}]}
 *
 * Build packages/core and packages/ner first, then from the repo root:
 *   node bench/independent/run-maskera.mjs tmp/indep/corpora/*.jsonl
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { basename, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createNerRecognizer, redactWithNer } from "../../packages/ner/dist/index.js"

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const args = process.argv.slice(2)
const outFlag = args.indexOf("--out-dir")
const outDir = resolve(repoRoot, outFlag >= 0 ? args[outFlag + 1] : "tmp/indep/preds")
const files = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--out-dir")
if (files.length === 0) throw new Error("pass at least one corpus .jsonl file")

const model = process.env.MASKERA_MODEL ?? "maskera-sv-ner-v21"
const modelPath = resolve(repoRoot, process.env.MASKERA_MODEL_PATH ?? "apps/demo/public/models")
const dtype = process.env.MASKERA_DTYPE ?? "q4"
if (!existsSync(resolve(modelPath, model, "config.json"))) {
  throw new Error(`Model ${model} is absent below ${modelPath}`)
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

mkdirSync(resolve(outDir, "maskera"), { recursive: true })
for (const file of files) {
  const rows = readFileSync(resolve(repoRoot, file), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const startedAt = performance.now()
  const out = []
  for (const row of rows) {
    const { redactions } = await redactWithNer(row.text, { recognizer })
    out.push({
      id: row.id,
      preds: redactions.map((r) => ({ start: r.start, end: r.end, label: r.label })),
    })
  }
  const name = basename(file, ".jsonl")
  writeFileSync(
    resolve(outDir, "maskera", `${name}.jsonl`),
    `${out.map((r) => JSON.stringify(r)).join("\n")}\n`,
  )
  const seconds = (performance.now() - startedAt) / 1000
  console.log(`maskera ${name}: ${rows.length} texts in ${seconds.toFixed(1)} s`)
}
