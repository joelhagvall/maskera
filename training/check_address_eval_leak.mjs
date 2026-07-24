#!/usr/bin/env node
/**
 * Fail when an exact held-out ADDRESS surface occurs as an ADR span in the
 * generated train/validation data. Category-level patterns may be learned;
 * benchmark addresses may not be copied into training.
 *
 * Usage from training/:
 *   node check_address_eval_leak.mjs ../bench/corpora/osm-addresses.json
 */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

export function normalizeAddressSurface(value) {
  return value.replace(/[^\p{L}\p{N}]+/gu, "").toLocaleLowerCase("sv-SE")
}

export function extractAddressSurfaces(row) {
  if (
    !Array.isArray(row.tokens) ||
    !Array.isArray(row.tags) ||
    row.tokens.length !== row.tags.length
  ) {
    throw new Error("training row must have equally sized tokens and tags arrays")
  }
  const surfaces = []
  let index = 0
  while (index < row.tags.length) {
    const tag = row.tags[index]
    if (tag !== "B-ADR" && tag !== "I-ADR") {
      index += 1
      continue
    }
    const tokens = [row.tokens[index]]
    index += 1
    while (index < row.tags.length && row.tags[index] === "I-ADR") {
      tokens.push(row.tokens[index])
      index += 1
    }
    const normalized = normalizeAddressSurface(tokens.join(""))
    if (normalized) surfaces.push(normalized)
  }
  return surfaces
}

export function findAddressEvalLeaks(corpus, jsonlInputs) {
  const heldOut = new Set(
    corpus.flatMap((document) =>
      (document.gold ?? [])
        .filter((span) => span.label === "ADDRESS")
        .map((span) =>
          normalizeAddressSurface(span.value ?? document.text.slice(span.start, span.end)),
        ),
    ),
  )
  const leaks = []
  for (const input of jsonlInputs) {
    for (const [index, line] of input.text.split("\n").entries()) {
      if (!line.trim()) continue
      const row = JSON.parse(line)
      for (const surface of extractAddressSurfaces(row)) {
        if (heldOut.has(surface)) leaks.push({ file: input.file, line: index + 1, surface })
      }
    }
  }
  return leaks
}

function runCli() {
  const corpusPath = process.argv[2]
  const dataPaths = process.argv.slice(3)
  if (!corpusPath) {
    console.error("usage: node check_address_eval_leak.mjs <corpus.json> [train.jsonl val.jsonl]")
    process.exit(1)
  }
  const paths = dataPaths.length > 0 ? dataPaths : ["data/train.jsonl", "data/val.jsonl"]
  const corpus = JSON.parse(readFileSync(corpusPath, "utf8"))
  const inputs = paths.map((file) => ({ file, text: readFileSync(file, "utf8") }))
  const leaks = findAddressEvalLeaks(corpus, inputs)
  if (leaks.length > 0) {
    console.error(`ADDRESS eval leakage: ${leaks.length} exact training matches`)
    for (const leak of leaks.slice(0, 20)) {
      console.error(`  ${leak.file}:${leak.line} ${leak.surface}`)
    }
    process.exit(1)
  }
  console.log(`ADDRESS eval leakage check passed (${paths.join(", ")})`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli()
