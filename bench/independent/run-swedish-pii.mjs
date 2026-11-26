#!/usr/bin/env node
/**
 * Run swedish-pii 1.2.0 (okasi/swedish-pii: regex + Swedish name lists, default
 * options) over the independent corpora and write its detections in the shared
 * format for score.mjs.
 *
 * Install once in bench/ (pinned in bench/package.json): npm install
 * Then from the repo root:
 *   node bench/independent/run-swedish-pii.mjs tmp/indep/corpora/*.jsonl
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { basename, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(new URL("../package.json", import.meta.url))
const { maskPII } = require("swedish-pii")

const repoRoot = fileURLToPath(new URL("../../", import.meta.url))
const args = process.argv.slice(2)
const outFlag = args.indexOf("--out-dir")
const outDir = resolve(repoRoot, outFlag >= 0 ? args[outFlag + 1] : "tmp/indep/preds")
const files = args.filter((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--out-dir")
if (files.length === 0) throw new Error("pass at least one corpus .jsonl file")

mkdirSync(resolve(outDir, "swedish-pii"), { recursive: true })
for (const file of files) {
  const rows = readFileSync(resolve(repoRoot, file), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
  const startedAt = performance.now()
  const out = rows.map((row) => ({
    id: row.id,
    preds: maskPII(row.text).entities.map((e) => ({ start: e.start, end: e.end, label: e.label })),
  }))
  const name = basename(file, ".jsonl")
  writeFileSync(
    resolve(outDir, "swedish-pii", `${name}.jsonl`),
    `${out.map((r) => JSON.stringify(r)).join("\n")}\n`,
  )
  console.log(
    `swedish-pii ${name}: ${rows.length} texts in ${((performance.now() - startedAt) / 1000).toFixed(1)} s`,
  )
}
