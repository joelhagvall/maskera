#!/usr/bin/env node
/**
 * Fetch the Swedish model into public/models/ before building the demo.
 *
 * The model files are gitignored (40 MB of weights don't belong in git), so a
 * fresh clone, like a Vercel/CI build machine, doesn't have them. This pulls
 * them from the Hugging Face Hub into the versioned local folder the demo
 * serves from. Skips files that already exist, so local dev costs nothing.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HUB = "https://huggingface.co/joelhagvall/maskera-sv-ner/resolve/main"
const DEST = resolve(dirname(fileURLToPath(import.meta.url)), "../public/models/maskera-sv-ner-v5")

const FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "vocab.txt",
  "onnx/model_q4.onnx",
]

for (const file of FILES) {
  const target = join(DEST, file)
  if (existsSync(target)) continue
  console.log(`fetching ${file} ...`)
  const res = await fetch(`${HUB}/${file}`)
  if (!res.ok) {
    console.error(`failed to fetch ${file}: ${res.status} ${res.statusText}`)
    process.exit(1)
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, Buffer.from(await res.arrayBuffer()))
}
console.log(`model ready in ${DEST}`)
