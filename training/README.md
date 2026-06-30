# maska — Swedish NER training

Fine-tunes a Swedish token-classification model for the free-text entities the
rule layer can't catch: **PER** (person), **LOC** (place), **ORG**
(organisation), **ADR** (street address). Structured PII (personnummer, org-nr,
phone, IBAN…) stays with `@maska/core`'s deterministic detectors.

## Why a Swedish model

We measured the default Rampart model on Swedish and it underperforms: it missed
`Lars Nordström` and mislabeled `Kungsholmen` as a street. Rampart is excellent
on English (Latin-script, English-trained) but Swedish recall is weak. This
pipeline trains a Swedish-first replacement.

## Pipeline

```bash
# 1. Generate synthetic, BIO-tagged Swedish data (no real PII, GDPR-safe)
node generate_data.mjs            # -> data/train.jsonl, data/val.jsonl

# 2. Set up env (uv + Python 3.11; torch supports MPS on Apple Silicon)
uv venv --python 3.11
uv pip install torch transformers "datasets>=3.2" seqeval accelerate

# 3. Fine-tune (auto-detects MPS / CUDA / CPU)
uv run python train.py            # -> model/

# 4. Generalisation check on out-of-gazetteer entities
uv run python infer.py

# 5. Export to ONNX + int8 quantization (Transformers.js-compatible layout)
uv pip install optimum-onnx onnx onnxruntime
uv run python export_onnx.py     # -> onnx-model/onnx/model_quantized.onnx
```

## ONNX export & size

`export_onnx.py` exports to ONNX and applies dynamic int8 quantization:

| Format     | Size    |
| ---------- | ------- |
| fp32 ONNX  | ~497 MB |
| int8 ONNX  | ~125 MB (4× smaller) |

Quality is preserved through quantization (verified on held-out sentences). The
int8 model runs through `@maska/ner` end-to-end — model entities (PER/LOC/ORG/
ADR) plus the rule layer's structured PII, merged by the stable-placeholder
engine. **125 MB is fine for server/Electron use but still ~8× the ~15 MB
browser target** — reaching that needs distillation into a smaller student
architecture (KB-BERT is 110M params; quantization alone can't close that gap).

On an M4 Pro (MPS) step 3 takes ~8–9 minutes for 3 epochs over 9k examples.

## Results (first run)

- **Synthetic val F1 = 1.00** — but this is *in-distribution* (val shares the
  generator's templates + gazetteers), so it is **not** evidence of real-world
  quality. Treat it as a sanity check only.
- **Generalisation is the real signal.** On entities deliberately absent from
  the training data the model still tags correctly — e.g. `Thorbjörn
  Fägerquist`→PER, `Northvolt`→ORG, `Skellefteå`→LOC, `Aigerim Bekova`→PER,
  `Hjärnarp`→LOC. It learned the *context pattern*, not just the vocabulary, and
  it beats Rampart on exactly the Swedish cases Rampart failed.

### Honest caveats / next steps

- **Data diversity is limited.** ~30 templates. Real text (typos, lowercase,
  odd formatting, long documents) is not yet represented — add more templates
  and ideally a small *real* Swedish eval set before trusting precision/recall.
- **Size.** The base is KB-BERT (~110M params, ~440 MB fp32) — great for quality
  but far from the ~15 MB browser target. Next: export to ONNX, quantize (int8 /
  q4), and/or **distil into a small 6-layer student** so it fits `@maska/ner`.
- **Subword spans.** The HF pipeline can split an entity across subword tokens;
  `@maska/ner`'s `reconstruct()` merges them back into one span.

## Base model & license

Base: [`KBLab/bert-base-swedish-cased`](https://huggingface.co/KBLab/bert-base-swedish-cased)
(National Library of Sweden). Verify its license terms before redistributing
derived weights. Training data here is fully synthetic.
