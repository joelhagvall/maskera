# @maskera/demo

Interactive live-redaction playground for [maskera](../../README.md).

```bash
pnpm install
pnpm demo        # from repo root, opens http://localhost:5180
```

## How it works

- **Rule layer (instant, always on):** `@maskera/core` redacts structured PII
  (personnummer, org-nr, phone, email, IBAN…), deterministic and instant.
- **Swedish NER model (always on, auto-loaded):** on page load the demo
  immediately starts loading **our distilled Swedish model** (~40 MB) in the
  browser via `maskera` + Transformers.js. There is **no toggle**; the model
  is part of the product, not an opt-in. While it loads (a few seconds, cached
  afterwards), the rule layer plus a small offline name gazetteer keep redacting,
  so the demo is usable immediately; once the model is ready it takes over name /
  place / org / address detection seamlessly. If the model fails to load, the
  gazetteer fallback keeps working.

This is the hybrid maskera is built on: **rules for structured PII, model for free
text**: both run, neither is a single source of truth, and rules win on overlap.

## The model files (not committed)

The model under `public/models/maskera-sv-ner-v5/` is ~40 MB and is **gitignored**.
To populate it, train and export from [`../../training`](../../training):

```bash
cd ../../training
uv run python train.py                                      # fine-tune KB-BERT
uv run python distill.py                                    # distill a smaller student
uv run python trim_vocab.py                                 # 50k -> 16k vocab
uv run python export_onnx.py student-trimmed student-trimmed-onnx
uv run python quantize_combo.py                             # -> onnx/model_q4.onnx (~40 MB)

# copy the browser-needed files into the demo
D=../apps/demo/public/models/maskera-sv-ner-v5
mkdir -p "$D/onnx"
cp student-trimmed-onnx/{config.json,tokenizer.json,tokenizer_config.json,special_tokens_map.json,vocab.txt} "$D/"
cp student-trimmed-onnx/onnx/model_q4.onnx "$D/onnx/"
```

Without these files the demo still runs; the model load reports an error and the
gazetteer fallback keeps working.

### Or use the hosted model (single source)

Once the model is published to the Hugging Face Hub (see
[`../../training`](../../training) → "Publish to Hugging Face"), point the demo at
the hosted id instead of the local copy, and then no large file lives in the repo:

```ts
import { MASKERA_SV_NER_MODEL } from "maskera"

createNerRecognizer({ model: MASKERA_SV_NER_MODEL, dtype: "q4" })
// drop localModelPath / allowRemoteModels:false, it fetches from the Hub (browser-cached)
```

`MASKERA_SV_NER_MODEL` is the one canonical id the demo and any future
React/Node packages share.
