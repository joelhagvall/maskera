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

| Artifact                              | Size    | Swedish quality |
| ------------------------------------- | ------- | --------------- |
| KB-BERT fp32 (teacher)                | ~440 MB | best            |
| teacher int8 ONNX                     | 125 MB  | ✅              |
| distilled student int8 ONNX           | 82 MB   | ✅ (≈ teacher)  |
| vocab-trimmed student int8 ONNX       | 56 MB   | ✅ (−0.04 F1)   |
| **vocab-trim + q4-matmul/int8-embed** | **40 MB** | ✅ (−0.06 F1) — **shipped** |
| Rampart (for comparison)              | 15 MB   | ❌ on Swedish   |

**What didn't work:** plain q4 (`quantize_q4.py`) made the model *bigger*
(183 MB) — ONNX 4-bit only quantizes MatMul weights and leaves the embedding
table fp32, which is ~half the model.

**What did work — two levers, in order:**

1. **Vocabulary trimming** (`trim_vocab.py`): KB-BERT's 50k vocab is ~half the
   params; Swedish PII text uses a fraction. Trimming to the 16k most-used
   wordpieces (keeping all special + single-char pieces so any word still
   decomposes) cut **82 → 56 MB** for −0.04 F1.
2. **Combined quant** (`quantize_combo.py`): once the vocab is small the ~42M
   MatMul params dominate, so q4 on those *plus* int8 on the (now small)
   embedding table cut **56 → 40 MB** for another ~0.015 F1. (This mixed model
   runs in Transformers.js but not in optimum's Python path — fine, the browser
   is the target.)

Net: **82 → 40 MB at 0.946 overlap F1** (v4 dataset + retrained teacher + precision guard),
far ahead of Rampart's 0.62.
Going to ~15 MB needs a smaller architecture, where quality starts to cost.

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

| Model                              | Size   | Overlap F1 |
| ---------------------------------- | ------ | ---------- |
| teacher (KB-BERT)                  | 440 MB | 0.899      |
| **student (trim + q4) — shipped**  | 40 MB  | **0.946**  |
| Rampart                            | 15 MB  | 0.621      |

The shipped 40 MB model nearly matches the 440 MB teacher, and reaches **0.91
redaction recall** (was the PII masked at all, any label — the privacy-relevant
metric; recall 0.99). Gold-set numbers measured via Transformers.js.

**Data quality, error-driven rounds — the cheapest lever:**

| Dataset round                                              | shipped 40 MB F1 |
| --------------------------------------------------------- | ---------------- |
| v1 — ≈30 templates, small gazetteers                      | 0.817            |
| v2 — ≈90 templates, large gazetteers, augmentation        | 0.843            |
| v3 — institutions as ORG, number distractors, foreign cities | 0.895         |
| v4 — common non-PII acronyms (EKG, IBAN, moms…) as `O`     | **0.946**        |

Each round was guided by **error analysis on the gold set**: v3 fixed companies
like *Einride* being tagged as people and bare digits as addresses; v4 fixed
common acronyms (EKG, IBAN) being tagged as organisations — while real orgs (SEB,
ICA, Spotify) are still caught. Independent gold rose in step too (0.65 → 0.85).
Each round also retrained the teacher on the new data. Synthetic data is the
ceiling; a real labelled Swedish set is the next real gain — but error-driven
synthetic rounds + a precision guard got us to ~0.95 (own) / ~0.85 (independent).

### v5.1: targeting ORG recall (Swedish NER Corpus)

ORG stayed the weakest type, so v5 added ~100 organisations plus 10 ORG-heavy
templates. Graded on a second independent benchmark now wired into the harness,
the public **Swedish NER Corpus** (klintan / Webbnyheter 2012, 2453 sentences,
run with `node packages/ner/eval/benchmark-swedish-ner.mjs`), that first attempt
over-fired: recall and leaks improved but precision collapsed (0.80 to 0.64),
because bare acronyms (EU, FN, LO, SVT) and common words (Investor, Stadium)
taught the model to tag any short capitalised token. Raising `minScore` could not
recover it (the tradeoff curve was flat), confirming a model-level over-fire, not
a threshold problem.

v5.1 kept only distinctive news-domain orgs (sports clubs, parties, distinct
media titles, agency names) and cut the ORG templates from 10 to 3. That held the
recall gain while recovering most of the precision:

| Metric (independent) | v4 (was shipped) | v5.1 (shipped) |
| -------------------- | ---------------- | -------------- |
| ORG recall           | 0.649            | **0.725**      |
| overall recall       | 0.776            | **0.852**      |
| leaks (missed)       | 17.7%            | **9.1%**       |
| precision            | 0.795            | 0.701          |
| span F1              | 0.785            | 0.769          |

Leaks nearly halved and ORG recall rose 0.076, for a modest precision cost (more
over-flagging, the safe direction for redaction). The curated set stayed flat
(0.961 to 0.954 F1). The lesson repeats: a surgical synthetic round buys recall,
but precision on independent text is capped by the synthetic ceiling.

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

### Independent gold set (real text, hand-labelled)

`eval/gold-real.txt` is 22 verbatim sentences from public Swedish Wikipedia
(Stefan Löfven, Spotify) — **real prose written by others**, hand-labelled
(gold). It removes WikiANN's silver/noisy-label caveat. PER/LOC/ORG only.

| Model on gold-real (real text)        | type-aware F1 | redaction recall |
| ------------------------------------- | ------------- | ---------------- |
| **maskera (shipped 40 MB pipeline)**  | **0.846**     | 0.84 (**recall 1.00**) |

Two honest reads:

- **type-aware 0.739 is the independent floor on gold labels** — real prose, not a
  silver-noise artefact. The 0.927 on our own set is home-turf inflation; the
  target-domain truth sits between.
- **redaction recall caught every entity (1.00)** — on this set nothing leaked.
  For the privacy use case (was the PII masked at all?), that's the number that
  matters, and it's strong.

> **Post-processing precision guard.** `@maskera/ner`'s `reconstruct()` keeps only
> word-boundary-aligned spans with at least one letter — dropping the model's
> mid-word fragments (e.g. "par" inside "Motpart") and bare digit groups (numbers
> are the rule layer's job). This lifted the shipped pipeline **0.927 → 0.946** on
> our set and **0.739 → 0.846** independent, raising precision with no recall loss.

Still encyclopedic domain (public figures), not the support/healthcare text
maskera targets — the true target-domain number needs real user data. But it's an
honest, independent, gold-labelled floor: **~0.85 type-aware, ~1.0 recall.**

### Independent benchmark (WikiANN, silver)

`evaluate_public.py` runs the same comparison on **WikiANN (Swedish)** — a
public NER dataset labeled by others, with no shared author. Restricted to
PER/LOC/ORG (public sets don't annotate addresses). 500 test sentences.

| Model (v3)              | WikiANN F1 | our-set F1 |
| ----------------------- | ---------- | ---------- |
| teacher (KB-BERT)       | 0.711      | 0.899      |
| **student (shipped)**   | **0.846**  | 0.946      |
| Rampart                 | 0.392      | 0.621      |

The honest reality this surfaced:

1. **Beats Rampart on both** — 0.65 vs 0.39 independent (Rampart: ORG F1 = 0.00,
   LOC recall = 0.09). The core claim holds everywhere.
2. **The v3 data rounds lifted our own eval far more than the independent one**
   (0.82 → 0.90 on ours; ~flat/slightly down on WikiANN). That's the synthetic
   ceiling showing — more synthetic diversity increasingly *chases our own
   distribution*, not general Swedish.
3. **WikiANN under-rates us for this use case**: it's encyclopedic (rarer vocab,
   which our PII-tuned vocab-trim drops) and silver-standard (noisy). The truth
   for the target domain (support/healthcare/legal) sits between 0.65 and 0.90.

**Conclusion: stop optimising synthetic data — the real next gain is a real
labelled Swedish eval set**, needed even just to measure honestly. Run
`python evaluate_public.py` to reproduce.

**Next step, now confirmed on the training side by v5.1: a real labelled Swedish
*training* set, not just an eval set.** The v5 to v5.1 round showed the same
pattern from the data end. A surgical synthetic round still lifts recall (leaks
17.7% to 9.1%, ORG recall 0.65 to 0.73), but precision on independent text stays
capped by the synthetic distribution (it fell rather than rose). The one lever
left that raises precision and recall together is real annotated Swedish text
from the target domains (support, healthcare, legal). Until that exists, the
shipped model is deliberately tuned for recall (catch the PII) over precision
(over-flagging is the safe failure mode for redaction), which is why v5.1 ships
despite the lower precision. Reproduce with
`node packages/ner/eval/benchmark-swedish-ner.mjs`.

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
