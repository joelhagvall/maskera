---
"maskera": minor
---

Harden model loading and span reconstruction. The pinned default model's cached files are now sha256-verified against digests baked into the package before they reach onnxruntime (new `verifyModelIntegrity` option, on by default for the pinned model only); `revision` is validated against path traversal; `ready` no longer starts the load at construction, so an unused recognizer can no longer crash the process with an unhandled rejection; entity spans now use exact token offsets replayed from the tokenizer (with a fail-closed adjacency guard on the legacy surface search), so an identically spelled earlier word can no longer be masked in place of the tagged one; word-boundary checks are astral-character safe; and the `@huggingface/transformers` peer range is narrowed to `^4.0.0` (v3 is not supported).
