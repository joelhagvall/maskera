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
engine.

## Distillation (toward browser size)

`distill.py` shrinks the teacher into a smaller student. The key lesson:

| Student                        | Params | Synthetic val F1 | Generalisation |
| ------------------------------ | ------ | ---------------- | -------------- |
| from-scratch (hidden 312, 4L)  | 20M    | **1.00**         | ❌ garbage — tagged `jobbar`/`innan` as entities |
| **teacher-init (hidden 768, 6L)** | 82M | 1.00             | ✅ matches teacher (`Thorbjörn Fägerquist`→PER, `Northvolt`→ORG) |

**A from-scratch small student memorises the synthetic templates (F1 1.00) but
learns nothing transferable** — it lacks the Swedish pretraining that makes the
teacher generalise. Initialising the student from the teacher's embeddings +
every-other layer (DistilBERT-style) recovers the quality.

### The size ladder (honest)

| Artifact                         | Size    | Swedish quality |
| -------------------------------- | ------- | --------------- |
| KB-BERT fp32 (teacher)           | ~440 MB | best            |
| teacher int8 ONNX                | 125 MB  | ✅              |
| **distilled student int8 ONNX**  | **82 MB** | ✅ (≈ teacher) |
| Rampart (for comparison)         | 15 MB   | ❌ on Swedish   |

82 MB is browser-loadable (cached after first fetch) and **actually good on
Swedish**, unlike the 15 MB Rampart. Closing the gap to ~15-30 MB further needs
**vocabulary trimming** (KB-BERT's 50k-token vocab is ~47% of the student's
params) plus q4 quantization — at some cost to quality. That's the next lever,
not done here.

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

## Benchmark (real eval set)

`evaluate.py` scores models on `eval/gold.txt` — 60 hand-authored Swedish
sentences (109 entities) deliberately outside the training templates: novel
names/places/orgs, lowercase, abbreviations, and distractors (personnummer,
dates) that must not be tagged. Span-level, type-aware P/R/F1.

| Model                     | Size   | Overlap F1 | Exact F1 |
| ------------------------- | ------ | ---------- | -------- |
| teacher (KB-BERT)         | 440 MB | **0.906**  | 0.855    |
| **student (distilled)**   | 82 MB  | **0.884**  | 0.815    |
| Rampart                   | 15 MB  | 0.652      | 0.578    |

The distilled student beats Rampart by **+23 F1** on Swedish. Rampart's failures
are concentrated: **ORG F1 = 0.00** (it tags no Swedish organisations — 0/27)
and **LOC recall = 0.43** (misses/mislabels Swedish places). Run
`python evaluate.py` to reproduce.

> **Honest caveats.** The eval set is small (60 sentences, single annotator) and
> shares an author with the data generator — treat it as a strong directional
> signal, not a definitive number. Some labels are genuinely ambiguous (a
> hospital as ORG vs LOC). Next: grow the set, add a second annotator, and pull
> in real (non-authored) Swedish text. The Rampart gap is large and consistent
> enough to trust the direction.

## Base model & license

Base: [`KBLab/bert-base-swedish-cased`](https://huggingface.co/KBLab/bert-base-swedish-cased)
(National Library of Sweden). Verify its license terms before redistributing
derived weights. Training data here is fully synthetic.
