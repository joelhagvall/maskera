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
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HUB = "https://huggingface.co/joelhagvall/maskera-sv-ner/resolve/main"
const DEST = resolve(dirname(fileURLToPath(import.meta.url)), "../public/models/maskera-sv-ner-v14")

// Pinned sha256 per file, so a compromised Hub account can't silently swap
// the weights into a build. When the model is intentionally updated, refresh
// these with: shasum -a 256 <file>
const FILES = {
  "config.json": "9a4345c97bba5b637fbb07779d56d45b0bac707bc413b623c99caa51bde125cc",
  "tokenizer.json": "3df1a0dc46adbbfbc97c76e79f9085d6aa86b6984dd50f1e9188fe4df356bd9e",
  "tokenizer_config.json": "3cf57fee187ab68479948ee43ecdb9054869fa9c232783f4f32d00a01669db4a",
  "special_tokens_map.json": "5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a",
  "vocab.txt": "16d817599cc42c30cd3b63afb5e2ffa87bde2d2ed3f40eaaef58ab5c29c0191a",
  "onnx/model_q4.onnx": "f4745c72f1ced657eb01d98966fcbefd70a3c4cb45b5cac35381cd3d0509c2a0",
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
// it instead of pulling it from jsDelivr (zero external requests). Since
// Transformers.js v4 the runtime lives only in onnxruntime-web (v3 bundled a
// copy in its own dist), so resolve that package through transformers to get
// the exact version the bundled code will load at runtime.
const tfEntry = fileURLToPath(import.meta.resolve("@huggingface/transformers"))
const ortSrc = dirname(createRequire(tfEntry).resolve("onnxruntime-web"))
const ortDest = resolve(dirname(fileURLToPath(import.meta.url)), "../public/ort")
mkdirSync(ortDest, { recursive: true })
// onnxruntime-web 1.26 split the runtime into variants (plain/asyncify/jsep/
// jspi) and picks one at load time, so ship them all.
for (const file of readdirSync(ortSrc).filter((f) => f.startsWith("ort-wasm-simd-threaded"))) {
  copyFileSync(join(ortSrc, file), join(ortDest, file))
}
console.log(`ort runtime ready in ${ortDest}`)
