#!/usr/bin/env node
/**
 * Fetch the Swedish model into public/models/ before building the demo.
 *
 * The model files are gitignored (40 MB of weights don't belong in git), so a
 * fresh clone, like a Vercel/CI build machine, doesn't have them. This pulls
 * them from the Hugging Face Hub into the versioned local folder the demo
 * serves from. Skips files that already exist, so local dev costs nothing.
 */
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HUB = "https://huggingface.co/joelhagvall/maskera-sv-ner/resolve/main"
const DEST = resolve(dirname(fileURLToPath(import.meta.url)), "../public/models/maskera-sv-ner-v11")

// Pinned sha256 per file, so a compromised Hub account can't silently swap
// the weights into a build. When the model is intentionally updated, refresh
// these with: shasum -a 256 <file>
const FILES = {
  "config.json": "c176a013765583e76b47fd3d2235384585b7e5ef254d061bcd0e83960ec1c6d6",
  "tokenizer.json": "6cd175f5b36ab207de08576371f202aec775e726888f47a18886dcb695a288e2",
  "tokenizer_config.json": "3cf57fee187ab68479948ee43ecdb9054869fa9c232783f4f32d00a01669db4a",
  "special_tokens_map.json": "5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a",
  "vocab.txt": "98b136c596b75906ffc5126c68d637da67a4b24e862e0a94581e554100ac6a31",
  "onnx/model_q4.onnx": "2b8f034af5b5803d007bd226ebe675922a88e8ffb523ffc325d4ed120c2237cb",
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex")

for (const [file, expected] of Object.entries(FILES)) {
  const target = join(DEST, file)
  // A present-and-verified file costs one hash; a mismatch is re-fetched.
  if (existsSync(target) && sha256(readFileSync(target)) === expected) continue
  console.log(`fetching ${file} ...`)
  const res = await fetch(`${HUB}/${file}`)
  if (!res.ok) {
    console.error(`failed to fetch ${file}: ${res.status} ${res.statusText}`)
    process.exit(1)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const actual = sha256(buf)
  if (actual !== expected) {
    console.error(`checksum mismatch for ${file}: expected ${expected}, got ${actual}`)
    console.error("refusing to use the file. If the model was updated on purpose, update FILES.")
    process.exit(1)
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, buf)
}
console.log(`model verified in ${DEST}`)

// Also copy the ONNX WASM runtime into public/ort/, so the demo self-hosts
// it instead of pulling it from jsDelivr (zero external requests). Copied
// from node_modules at build time so it always matches the installed
// Transformers.js version.
const ortSrc = dirname(fileURLToPath(import.meta.resolve("@huggingface/transformers")))
const ortDest = resolve(dirname(fileURLToPath(import.meta.url)), "../public/ort")
mkdirSync(ortDest, { recursive: true })
for (const file of ["ort-wasm-simd-threaded.jsep.mjs", "ort-wasm-simd-threaded.jsep.wasm"]) {
  copyFileSync(join(ortSrc, file), join(ortDest, file))
}
console.log(`ort runtime ready in ${ortDest}`)
