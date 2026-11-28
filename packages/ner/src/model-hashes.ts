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
 * Sources, verified 2026-11-28 against revision
 * 908c11ee9837a21e254c73fcd33399e636367b4e:
 *
 * - config.json, tokenizer.json, tokenizer_config.json,
 *   special_tokens_map.json, vocab.txt and onnx/model_q4.onnx: hashed from
 *   the published v22 export and verified against the Hub at the pinned
 *   revision. Identical to the map the demo build pins in
 *   apps/demo/scripts/fetch-model.mjs, which repo policy keeps in sync at
 *   every model publish.
 * - onnx/model.onnx and onnx/model_quantized.onnx (the other dtypes this
 *   package's `dtype` option can select): hashed from the published v22 export
 *   and verified against the Hub LFS oids at the pinned revision.
 *
 * When MASKERA_SV_NER_REVISION changes, refresh this map in the same commit
 * (and fetch-model.mjs, per the repo's model-publish checklist).
 */
export const MASKERA_SV_NER_SHA256: Readonly<Record<string, string>> = {
  "config.json": "8b70aecfb3097dd793080156b244fc15556ade183d52474627e2afe042b74f31",
  "tokenizer.json": "7db274e95d9b613300a942f2b8c65c7f39a4cd9debd5c799b3a8486e84ba3543",
  "tokenizer_config.json": "3cf57fee187ab68479948ee43ecdb9054869fa9c232783f4f32d00a01669db4a",
  "special_tokens_map.json": "5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a",
  "vocab.txt": "0b2003090a0b1662bd70105058a0f062ea215902a1fab6bfe2811a216b71a2ad",
  "onnx/model.onnx": "2d50bc051fa08c53ad7fe397ecc60119a97e41868e75a85594cc886aceadafa6",
  "onnx/model_q4.onnx": "698b0ae43b8022b0df2bb2e158f272c7d8756dea64d4f0254145eee2b0a015ce",
  "onnx/model_quantized.onnx": "4df5956795ba7b097e091f45ee6d73966f20c49072d5b058f1045d497b9028c2",
}
