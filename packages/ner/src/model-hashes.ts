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
 * Sources, verified 2026-11-25 against revision
 * bb35467e9310095a81bf4e3d5779586ea842507a:
 *
 * - config.json, tokenizer.json, tokenizer_config.json,
 *   special_tokens_map.json, vocab.txt and onnx/model_q4.onnx: hashed from
 *   the published v20 export and verified against the Hub at the pinned
 *   revision. Identical to the map the demo build pins in
 *   apps/demo/scripts/fetch-model.mjs, which repo policy keeps in sync at
 *   every model publish.
 * - onnx/model.onnx and onnx/model_quantized.onnx (the other dtypes this
 *   package's `dtype` option can select): hashed from the published v20 export
 *   and verified against the Hub LFS oids at the pinned revision.
 *
 * When MASKERA_SV_NER_REVISION changes, refresh this map in the same commit
 * (and fetch-model.mjs, per the repo's model-publish checklist).
 */
export const MASKERA_SV_NER_SHA256: Readonly<Record<string, string>> = {
  "config.json": "9a4345c97bba5b637fbb07779d56d45b0bac707bc413b623c99caa51bde125cc",
  "tokenizer.json": "ad3fd31044f9ab6aca0ff752b22a90acb9a520f0dfe2395165726fa7542a1a0d",
  "tokenizer_config.json": "3cf57fee187ab68479948ee43ecdb9054869fa9c232783f4f32d00a01669db4a",
  "special_tokens_map.json": "5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a",
  "vocab.txt": "9c360f3292ce07fae4315fbd708ea15f942e6bd1ce22b870812b370051ee583c",
  "onnx/model.onnx": "8f86a6f655c8309ff4dd0e6b83a915867412e0b0cc5cf6ee6f19128c47724c63",
  "onnx/model_q4.onnx": "0a4ad3c3d87b0c53c67556177a668acfb8a91726a2af78e16a857403f6bed7fa",
  "onnx/model_quantized.onnx": "b417fda59146b8e5e8bb7892c539b7b0471ab4b6293b0d1125c3bef6df2a8ba4",
}
