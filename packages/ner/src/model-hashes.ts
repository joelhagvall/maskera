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
 * Sources, verified 2026-11-27 against revision
 * 5bd47f3031fea64eb1ae98f77ebfc67882f792fa:
 *
 * - config.json, tokenizer.json, tokenizer_config.json,
 *   special_tokens_map.json, vocab.txt and onnx/model_q4.onnx: hashed from
 *   the published v21 export and verified against the Hub at the pinned
 *   revision. Identical to the map the demo build pins in
 *   apps/demo/scripts/fetch-model.mjs, which repo policy keeps in sync at
 *   every model publish.
 * - onnx/model.onnx and onnx/model_quantized.onnx (the other dtypes this
 *   package's `dtype` option can select): hashed from the published v21 export
 *   and verified against the Hub LFS oids at the pinned revision.
 *
 * When MASKERA_SV_NER_REVISION changes, refresh this map in the same commit
 * (and fetch-model.mjs, per the repo's model-publish checklist).
 */
export const MASKERA_SV_NER_SHA256: Readonly<Record<string, string>> = {
  "config.json": "9a4345c97bba5b637fbb07779d56d45b0bac707bc413b623c99caa51bde125cc",
  "tokenizer.json": "2def9a79067838fc8aa7b4ddf3b510bb7b61064607b946c8037732fb289b60c6",
  "tokenizer_config.json": "3cf57fee187ab68479948ee43ecdb9054869fa9c232783f4f32d00a01669db4a",
  "special_tokens_map.json": "5d5b662e421ea9fac075174bb0688ee0d9431699900b90662acd44b2a350503a",
  "vocab.txt": "88fe7b3889700997805216126810ad695595093824c6777673c2cb7403f68bcc",
  "onnx/model.onnx": "32364a1abf92df7be585242e2afba2692d91cc5c2c654001d654aac72a6349b3",
  "onnx/model_q4.onnx": "d9436cd6f8b710a0a38b9c8c162d6176d6c3612b75f896074061526918494e2b",
  "onnx/model_quantized.onnx": "cc71022fb02f1ae0769297804de982648ed8c721b0e47af3fbde1a5a6c4a5a78",
}
