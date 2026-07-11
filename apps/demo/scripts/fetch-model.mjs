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
const DEST = resolve(dirname(fileURLToPath(import.meta.url)), "../public/models/maskera-sv-ner-v13")

// Pinned sha256 per file, so a compromised Hub account can't silently swap
// the weights into a build. When the model is intentionally updated, refresh
// these with: shasum -a 256 <file>
const FILES = {
  "config.json": "9a4345c97bba5b637fbb07779d56d45b0bac707bc413b623c99caa51bde125cc",
  "tokenizer.json": "74284592b0aec4bf2a29b52ae373262235e9fdf671a78e927529f03ab579e962",
  "tokenizer_config.json": "3cf57fee187ab68479948ee43ecdb9054869fa9c232783f4f32d00a01669db4a",
  "special_tokens_map.json": "5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a",
  "vocab.txt": "6d4377291b61a6caa6589f486db46ffa4112ae0105e83d0d57ec2eec092b62ef",
  "onnx/model_q4.onnx": "7505b72d18705cffa73e965b23d913e516dece57aa5afe618fb801f54cfd9ee1",
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
