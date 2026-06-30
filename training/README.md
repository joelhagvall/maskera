# maskera — Swedish NER training

Fine-tunes a Swedish token-classification model for the free-text entities the
rule layer can't catch: **PER** (person), **LOC** (place), **ORG**
(organisation), **ADR** (street address). Structured PII (personnummer, org-nr,
phone, IBAN…) stays with `@maskera/core`'s deterministic detectors.

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
int8 model runs through `@maskera/ner` end-to-end — model entities (PER/LOC/ORG/
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

| Artifact                            | Size    | Swedish quality |
| ----------------------------------- | ------- | --------------- |
| KB-BERT fp32 (teacher)              | ~440 MB | best            |
| teacher int8 ONNX                   | 125 MB  | ✅              |
| distilled student int8 ONNX         | 82 MB   | ✅ (≈ teacher)  |
| **vocab-trimmed student int8 ONNX** | **56 MB** | ✅ (−0.04 F1) — **shipped** |
| Rampart (for comparison)            | 15 MB   | ❌ on Swedish   |

**What didn't work:** q4 quantization (`quantize_q4.py`) made the model *bigger*
(183 MB) — ONNX 4-bit only quantizes MatMul weights and leaves the embedding
table fp32, and that table is ~half the model.

**What did work:** **vocabulary trimming** (`trim_vocab.py`). KB-BERT's 50k vocab
is ~half the params; Swedish PII text only uses a fraction. Trimming to the 16k
most-used wordpieces (keeping all special + single-char pieces so any word still
decomposes) cut 82 MB → 56 MB for −0.04 F1. This is the shipped model. Going
further to ~15 MB needs a smaller architecture too, where quality starts to cost.

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
  q4), and/or **distil into a small 6-layer student** so it fits `@maskera/ner`.
- **Subword spans.** The HF pipeline can split an entity across subword tokens;
  `@maskera/ner`'s `reconstruct()` merges them back into one span.

## Benchmark (real eval set)

`evaluate.py` scores models on `eval/gold.txt` — 121 hand-authored Swedish
sentences (236 entities) deliberately outside the training templates: novel
names/places/orgs, lowercase, abbreviations, hyphenated/foreign names, and
distractors (personnummer, dates, money) that must not be tagged. Span-level,
type-aware P/R/F1.

**Overall F1:**

| Model                       | Size   | Overlap F1 | Exact F1 |
| --------------------------- | ------ | ---------- | -------- |
| teacher (KB-BERT)           | 440 MB | **0.899**  | 0.851    |
| student (distilled)         | 82 MB  | 0.874      | 0.798    |
| **student (vocab-trimmed)** | 56 MB  | **0.838**  | 0.749    |
| Rampart                     | 15 MB  | 0.621      | 0.494    |

**Per-type F1 (overlap):**

| Type | teacher | student | Rampart |
| ---- | ------- | ------- | ------- |
| PER  | 0.93    | 0.91    | 0.84    |
| LOC  | 0.89    | 0.90    | 0.52    |
| ORG  | 0.88    | 0.81    | **0.00** |
| ADR  | 0.88    | 0.85    | 0.79    |

The distilled student beats Rampart by **+0.25 F1** on Swedish. Rampart's
failures are concentrated: **ORG F1 = 0.00** (it tags no Swedish organisations —
0/67) and **LOC recall = 0.39** (misses/mislabels Swedish places). Doubling the
eval set (60→121 sentences) barely moved the scores, so the gap is stable. Run
`python evaluate.py` to reproduce.

> **Honest caveats.** The eval set is modest (121 sentences, single annotator)
> and shares an author with the data generator — treat it as a strong
> directional signal, not a definitive number. Some labels are genuinely
> ambiguous (a hospital as ORG vs LOC). The Rampart gap is large and consistent
> enough to trust the direction.

### Independent benchmark (third-party data)

`evaluate_public.py` runs the same comparison on **WikiANN (Swedish)** — a
public NER dataset labeled by others, with no shared author. Restricted to
PER/LOC/ORG (public sets don't annotate addresses). 500 test sentences.

| Model                   | WikiANN F1 | our-set F1 |
| ----------------------- | ---------- | ---------- |
| teacher (KB-BERT)       | 0.668      | 0.899      |
| **student (distilled)** | **0.696**  | 0.874      |
| Rampart                 | 0.392      | 0.621      |

1. **The gap to Rampart holds and widens** — student 0.70 vs Rampart 0.39.
   Rampart is effectively broken on Swedish here: **ORG F1 = 0.00**, **LOC
   recall = 0.09**.
2. **Our absolute scores drop on out-of-domain text** (0.87 → 0.70) — the honest
   domain-shift effect. WikiANN is encyclopedic Wikipedia text, unlike the
   support/healthcare/legal style our model targets.

WikiANN is **silver-standard** (auto-derived from wiki links, noisy), so
absolute numbers are depressed for *all* models equally — the comparison is
valid, the exact values are not gospel. Run `python evaluate_public.py` to
reproduce.

## Publish to Hugging Face (single hosted source)

Hosting the model once means the demo and every future `@maskera` package point at
the same place — `createNerRecognizer({ model: MASKERA_SV_NER_MODEL, dtype: "q8" })`.

```bash
uv pip install huggingface_hub
huggingface-cli login                 # or export HF_TOKEN=...
uv run python push_to_hub.py joelhagvall/maskera-sv-ner   # use your HF username
```

`push_to_hub.py` uploads `student-onnx/` (int8 ONNX + tokenizer + config) with
`MODEL_CARD.md` as the repo README, skipping the large fp32 weights. After it's
up, switch the demo from the local copy to the hosted id (drop `localModelPath`
and `allowRemoteModels: false`).

## Base model & license

Base: [`KBLab/bert-base-swedish-cased`](https://huggingface.co/KBLab/bert-base-swedish-cased)
(National Library of Sweden), released **CC0-1.0** (public domain) — commercial
use, redistribution and relicensing of derived weights are all permitted with no
obligation. We license the derived model **MIT** to match the SDK; a courtesy
citation to KBLab's paper (arXiv:2007.01658) is in `MODEL_CARD.md`. Training data
here is fully synthetic (no real personal data).
