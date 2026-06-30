# @maska/demo

Interactive live-redaction playground for [maska](../../README.md).

```bash
pnpm install
pnpm demo        # from repo root, opens http://localhost:5180
```

## How it works

- **Always on:** the `@maska/core` rule layer redacts structured PII
  (personnummer, org-nr, phone, email, IBAN…) — deterministic and instant.
- **Off-state names:** a small offline gazetteer tags common Swedish names so the
  demo redacts names with zero download.
- **"Svensk NER-modell" toggle:** loads **our distilled Swedish model**
  (~80 MB int8) in the browser via `@maska/ner` + Transformers.js, and replaces
  the gazetteer — the model handles arbitrary names / places / orgs / addresses
  while the rules keep handling structured IDs. This is the hybrid:
  **rules for structured PII, model for free text.**

## The model files (not committed)

The model under `public/models/maska-sv-ner/` is ~80 MB and is **gitignored**.
To populate it, train and export from [`../../training`](../../training):

```bash
cd ../../training
uv run python train.py          # fine-tune KB-BERT
uv run python distill.py        # distill the small student
uv run python export_onnx.py student-model student-onnx

# copy the browser-needed files into the demo
mkdir -p ../apps/demo/public/models/maska-sv-ner/onnx
cp student-onnx/{config.json,tokenizer.json,tokenizer_config.json,special_tokens_map.json,vocab.txt} \
   ../apps/demo/public/models/maska-sv-ner/
cp student-onnx/onnx/model_quantized.onnx ../apps/demo/public/models/maska-sv-ner/onnx/
```

Without these files the demo still runs — the NER toggle just reports a load
error, and the gazetteer fallback keeps working.
