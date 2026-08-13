/**
 * Pinned sha256 digests for every model file of maskera-sv-ner at
 * MASKERA_SV_NER_REVISION (see src/index.ts). load() verifies the
 * Transformers.js file cache against this map before the bytes reach
 * onnxruntime, because the revision pin only controls WHAT is downloaded:
 * transformers.js's FileCache.match() trusts any file that merely EXISTS in
 * the cache directory, and its Node download path performs no hash check
 * either. A tampered cache (e.g. a world-writable one) would otherwise mean
 * silently suppressed detections, or hostile bytes straight into
 * onnxruntime's native parser.
 *
 * Sources, verified 2026-08-13 against revision
 * b1aa7e799fa4839f8668dda691e893706e971523:
 *
 * - config.json, tokenizer.json, tokenizer_config.json,
 *   special_tokens_map.json, vocab.txt and onnx/model_q4.onnx: re-downloaded
 *   from the Hub at the pinned revision and hashed locally. Identical to the
 *   map the demo build pins in apps/demo/scripts/fetch-model.mjs, which repo
 *   policy keeps in sync at every model publish.
 * - onnx/model.onnx and onnx/model_quantized.onnx (the other dtypes this
 *   package's `dtype` option can select): the Hub's LFS oid at the pinned
 *   revision, from
 *   https://huggingface.co/api/models/joelhagvall/maskera-sv-ner/tree/<sha>?recursive=true
 *   — for LFS files that oid IS the sha256 of the file content.
 *
 * When MASKERA_SV_NER_REVISION changes, refresh this map in the same commit
 * (and fetch-model.mjs, per the repo's model-publish checklist).
 */
export const MASKERA_SV_NER_SHA256: Readonly<Record<string, string>> = {
  "config.json": "9a4345c97bba5b637fbb07779d56d45b0bac707bc413b623c99caa51bde125cc",
  "tokenizer.json": "a600e32448f4ebb0bffcd4cfd69ead75b2f982058ea65b15d9e3e535c1e83ae1",
  "tokenizer_config.json": "3cf57fee187ab68479948ee43ecdb9054869fa9c232783f4f32d00a01669db4a",
  "special_tokens_map.json": "5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a",
  "vocab.txt": "8bf12559050ca14571d3108164a6a6a6100b1342bf39142d68079b21288202f2",
  "onnx/model.onnx": "11ee18a97af5f73ee0e95a74af292e91f5b8a305cc85cc321462bab0e3ddc1f0",
  "onnx/model_q4.onnx": "6f4bf061e9af6827e4ffe82bcfcb84709daa84c5f5ed7a05c2083a3e535fda66",
  "onnx/model_quantized.onnx": "08a9b82124721492b212a0832f3ffd731ff50ea26bdbb1152672f1f36717aaa7",
}
