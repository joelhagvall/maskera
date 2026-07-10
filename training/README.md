# maskera: Swedish NER training

Fine-tunes a Swedish token-classification model for the free-text entities the
rule layer can't catch: **PER** (person), **LOC** (place), **ORG**
(organisation), **ADR** (street address). Structured PII (personnummer, org-nr,
phone, IBAN…) stays with `@maskera/core`'s deterministic detectors.

> **Numbers note.** This file is the training *journal*: the tables below are
> round-by-round history (v1 → v6), measured with the Python harness
> (overlap matching), kept for the lessons they carry. The canonical, dated
> numbers for the **published** artifact live in
> [`docs/BENCHMARKS.md`](../docs/BENCHMARKS.md), measured with the stricter
> exact-span JS harness CI gates on. When the two disagree, BENCHMARKS.md wins.
> Naming: the published Hub artifact (byte-identical to the demo's
> `maskera-sv-ner-v5` folder) is the **v6** training round.

## Why a Swedish model

We measured off-the-shelf multilingual PII models on Swedish and they
underperform: one missed `Lars Nordström` and mislabeled `Kungsholmen` as a
street. They are trained on English-adjacent Latin-script text, and Swedish
recall is weak. This pipeline trains a Swedish-first model instead.

## Pipeline

```bash
# 1. Generate synthetic, BIO-tagged Swedish data (no real PII, GDPR-safe),
#    then append the real Swedish NER Corpus train split (see the v6 journal
#    entry below). Skipping the append step collapses precision on real text.
node generate_data.mjs            # -> data/train.jsonl, data/val.jsonl
node convert_klintan.mjs          # appends real news train + held-out dev data
node convert_sucx.mjs             # v11: SUCX 3.0 gold sample (lowercase lever)
node convert_sic2.mjs             # v11: informal blog gold (target register)
node convert_massive.mjs          # v11: chat-register gold (target register)
# Experimental only: a full Swe-NERC mix regressed the independent safety gate.
# If revisited, sample/weight it and require every q4 gate to pass.
# node convert_swenerc.mjs
# Optional, once separately annotated target-domain data exists:
node convert_domain_jsonl.mjs domain-data/annotated.jsonl
node audit_data.mjs               # schema/BIO/duplicates/train-val leakage gate

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
int8 model runs through `maskera` end-to-end: model entities (PER/LOC/ORG/
ADR) plus the rule layer's structured PII, merged by the stable-placeholder
engine.

## Distillation (toward browser size)

`distill.py` shrinks the teacher into a smaller student. The key lesson:

| Student                        | Params | Synthetic val F1 | Generalisation |
| ------------------------------ | ------ | ---------------- | -------------- |
| from-scratch (hidden 312, 4L)  | 20M    | **1.00**         | ❌ garbage: tagged `jobbar`/`innan` as entities |
| **teacher-init (hidden 768, 6L)** | 82M | 1.00             | ✅ matches teacher (`Thorbjörn Fägerquist`→PER, `Northvolt`→ORG) |

**A from-scratch small student memorises the synthetic templates (F1 1.00) but
learns nothing transferable**: it lacks the Swedish pretraining that makes the
teacher generalise. Initialising the student from the teacher's embeddings +
every-other layer (DistilBERT-style) recovers the quality.

### The size ladder (honest)

| Artifact                              | Size    | Swedish quality |
| ------------------------------------- | ------- | --------------- |
| KB-BERT fp32 (teacher)                | ~440 MB | best            |
| teacher int8 ONNX                     | 125 MB  | ✅              |
| distilled student int8 ONNX           | 82 MB   | ✅ (≈ teacher)  |
| vocab-trimmed student int8 ONNX       | 56 MB   | ✅ (−0.04 F1)   |
| **vocab-trim + q4-matmul/int8-embed** | **40 MB** | ✅ (−0.06 F1), **shipped** |

**What didn't work:** plain q4 (`quantize_q4.py`) made the model *bigger*
(183 MB): ONNX 4-bit only quantizes MatMul weights and leaves the embedding
table fp32, which is ~half the model.

**What did work, two levers in order:**

1. **Vocabulary trimming** (`trim_vocab.py`): KB-BERT's 50k vocab is ~half the
   params; Swedish PII text uses a fraction. Trimming to the 16k most-used
   wordpieces (keeping all special + single-char pieces so any word still
   decomposes) cut **82 → 56 MB** for −0.04 F1.
2. **Combined quant** (`quantize_combo.py`): once the vocab is small the ~42M
   MatMul params dominate, so q4 on those *plus* int8 on the (now small)
   embedding table cut **56 → 40 MB** for another ~0.015 F1. (This mixed model
   runs in Transformers.js but not in optimum's Python path; fine, the browser
   is the target.)

Net: **82 → 40 MB at 0.946 overlap F1** (v4 dataset + retrained teacher + precision guard).
Going to ~15 MB needs a smaller architecture, where quality starts to cost.

On an M4 Pro (MPS) step 3 takes ~8–9 minutes for 3 epochs over 9k examples.

## Results (first run)

- **Synthetic val F1 = 1.00**, but this is *in-distribution* (val shares the
  generator's templates + gazetteers), so it is **not** evidence of real-world
  quality. Treat it as a sanity check only.
- **Generalisation is the real signal.** On entities deliberately absent from
  the training data the model still tags correctly, e.g. `Thorbjörn
  Fägerquist`→PER, `Northvolt`→ORG, `Skellefteå`→LOC, `Aigerim Bekova`→PER,
  `Hjärnarp`→LOC. It learned the *context pattern*, not just the vocabulary,
  including the Swedish cases the multilingual baselines failed on.

### Honest caveats / next steps

- **Data diversity is limited.** ~30 templates. Real text (typos, lowercase,
  odd formatting, long documents) is not yet represented; add more templates
  and ideally a small *real* Swedish eval set before trusting precision/recall.
- **Size.** The base is KB-BERT (~110M params, ~440 MB fp32), great for quality
  but far from the ~15 MB browser target. Next: export to ONNX, quantize (int8 /
  q4), and/or **distil into a small 6-layer student** so it fits `maskera`.
- **Subword spans.** The HF pipeline can split an entity across subword tokens;
  `maskera`'s `reconstruct()` merges them back into one span.

## Benchmark (real eval set)

`evaluate.py` scores models on `eval/gold.txt`: 121 hand-authored Swedish
sentences (236 entities) deliberately outside the training templates: novel
names/places/orgs, lowercase, abbreviations, hyphenated/foreign names, and
distractors (personnummer, dates, money) that must not be tagged. Span-level,
type-aware P/R/F1.

**Overall F1:**

| Model                              | Size   | Overlap F1 |
| ---------------------------------- | ------ | ---------- |
| teacher (KB-BERT)                  | 440 MB | 0.899      |
| **student (trim + q4), shipped**  | 40 MB  | **0.946**  |

The shipped 40 MB model nearly matches the 440 MB teacher, and reaches **0.91
redaction recall** (was the PII masked at all, any label, the privacy-relevant
metric; recall 0.99). Gold-set numbers measured via Transformers.js.

**Data quality, error-driven rounds, the cheapest lever:**

| Dataset round                                              | shipped 40 MB F1 |
| --------------------------------------------------------- | ---------------- |
| v1: ≈30 templates, small gazetteers                      | 0.817            |
| v2: ≈90 templates, large gazetteers, augmentation        | 0.843            |
| v3: institutions as ORG, number distractors, foreign cities | 0.895         |
| v4: common non-PII acronyms (EKG, IBAN, moms…) as `O`     | **0.946**        |

Each round was guided by **error analysis on the gold set**: v3 fixed companies
like *Einride* being tagged as people and bare digits as addresses; v4 fixed
common acronyms (EKG, IBAN) being tagged as organisations, while real orgs (SEB,
ICA, Spotify) are still caught. Independent gold rose in step too (0.65 → 0.85).
Each round also retrained the teacher on the new data. Synthetic data is the
ceiling; a real labelled Swedish set is the next real gain, but error-driven
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

### v6: real training data breaks the ceiling

v5.1 proved synthetic data could not raise precision and recall together. v6
tests the fix: add real labelled Swedish text. `convert_klintan.mjs` converts the
**Swedish NER Corpus** train split (6885 sentences, 3803 real entities) from
CoNLL to BIO JSONL and appends it to the synthetic set, so training is now ~24k
synthetic + ~6.9k real.

The genuinely independent number (gold-real, hand-labelled Wikipedia prose, which
is held out from both the synthetic generator and the news corpus) confirms it:

| Model (independent gold-real) | type-aware F1 | precision | recall |
| ----------------------------- | ------------- | --------- | ------ |
| v4 (balanced synthetic)       | 0.846         | -         | -      |
| v5.1 (recall-tuned synthetic) | 0.782         | 0.69      | 0.90   |
| **v6 (+ real data)**          | **0.891**     | **0.87**  | **0.91** |

Real data lifted precision **and** recall at once (0.87 / 0.91), exactly the
trade synthetic rounds could not make. The curated set also rose (0.954 to 0.981
F1, precision 0.93 to 0.98).

**Caveat that comes with it:** training on the Swedish NER Corpus makes its test
split in-distribution, so it is no longer an independent benchmark. gold-real
(Wikipedia) is the honest independent measure now, and it is small; a larger
independent gold set is the next measurement need.

**Per-type F1 (overlap):**

| Type | teacher | student |
| ---- | ------- | ------- |
| PER  | 0.93    | 0.91    |
| LOC  | 0.89    | 0.90    |
| ORG  | 0.88    | 0.81    |
| ADR  | 0.88    | 0.85    |

Doubling the eval set (60→121 sentences) barely moved the scores, so the
numbers are stable. Run `python evaluate.py` to reproduce.

> **Honest caveats.** The eval set is modest (121 sentences, single annotator)
> and shares an author with the data generator; treat it as a strong
> directional signal, not a definitive number. Some labels are genuinely
> ambiguous (a hospital as ORG vs LOC).

### Base-model check (2026-07-04): would a different backbone beat KB-BERT?

Candidates people suggest: RecordedFuture/Swedish-NER (KB-BERT finetuned on
internet/forum data, adds Religion/Title classes), KB/bert-base-swedish-cased-ner
(the SUC classic), KBLab's reallysimple-ner and lowermix variants (SUCX 3.0),
nbailab scandi-ner, the sbx PI-detection pair, and AI Sweden's
roberta-large-1160k (strong on ScandEval, but a base LM, not a NER model).

Measured all of them with `benchmark_competitors.py` on the same gold sets,
including a lowercased chat-style pass. Full tables live in
[docs/BENCHMARKS.md](../docs/BENCHMARKS.md) (single source of truth).
Conclusion: the shipped student beats every full-size alternative on
independent cased text (typed F1 0.96 vs 0.88-0.94) at under a tenth of their
size, because it is trained for exactly maskera's four types (including ADR,
which none of them have), with casing augmentation and domain hard negatives.
Only KBLab's lowermix wins on lowercase text (0.90 vs 0.86): its mixed-case
SUCX recipe is the pointer for a future data round. Swapping backbone buys
nothing today. The only theoretically stronger base is AI Sweden's RoBERTa as
a teacher, but it is 335M params, uses a BPE tokenizer (breaks the wordpiece
`##` assumptions in maskera's reconstruct and in `trim_vocab.py`), and
would need its own distillation recipe: real engineering cost for a
speculative ceiling gain.

### Fast-path check (2026-07-04): continue-training the student loses recall

Tried `finetune_student.py` (continue-train student-v5 on a data round that
added role/contact/payment hard negatives, skipping teacher + distillation).
Both attempts (2 epochs lr 1e-5, and 1 epoch lr 5e-6) fixed the targeted
false positives but traded recall for precision on independent text: gold-real
recall fell 0.95 to 0.86, and the JS gold corpus went from 2 to 4-5 leaks
("Astrid Lund", "Hallsberg" went unmasked). Plain CE on mostly-O data nudges
the student toward O; it is the distillation soft labels that hold recall up.
Lesson: the fast path is fine for experiments, but shipping requires the full
teacher + distill pipeline. For a redaction tool, recall is the safety metric;
do not trade it for precision that a runtime denylist can buy instead.

### Full-pipeline retry (2026-07-04): best curated score, but ORG collapsed after quantization

Ran the full pipeline on the corrected data (synthetic incl. the new hard
negatives + klintan). Best curated-corpus result so far (exact-span F1 0.970,
3 leaks) and the targeted false positives fixed at the weight level, but
gold-real recall fell to 0.74: 13 of 15 misses were ORG (Socialdemokraterna,
Tencent, STIM, IFPI, Universal Music Group...). Bisecting the pipeline showed
the teacher AND the full-vocab student catch all of them; the losses appear
after vocab-trim + q4, while v5's q4 artifact catches the same sentences with
a near-identical trimmed vocab (497/16000 tokens differ). So the run produced
a student whose ORG decisions sit close to the boundary and fall over under
quantization noise. Training is unseeded, so runs vary; v5 was a better draw.
Decision: not shipped, v5 remains the published artifact.

Fixes worth making before the next attempt: seed train.py/distill.py, stop
silencing the trim/quant steps in run scripts, and gate a run on the QUANTIZED
artifact's gold-real recall (the fp32 student's score is not the thing that
ships).

### v7 casing/chat round (2026-07-04): two targets hit, gate said no, and the real genitive fix was in the pipeline

Ran the seeded pipeline on the v9 data round (more sentence-initial full-name
genitives, greeting hard negatives, bare-name chat turns, lowercase
augmentation 0.16 / caps 0.05). Outcome: the two chat leaks were fixed at the
weight level ("RING LARS NORDSTRÖM" all-caps and bare lowercase "fatima" are
now caught, greetings no longer tag as PER), but the gate failed at 0.90
gold-real recall (floor 0.90, v5 measures 0.95) and the curated corpus showed
6 leaks vs v5's. Not shipped; v5 stays.

The stubborn one, capitalized full-name genitive, turned out not to be a
model problem at all. Bisection: the teacher AND the full student catch "Anna
Karlssons", but the VOCAB-TRIMMED student stops one character short ("Anna
Karlsson"), and reconstruct()'s whole-word guard then rejected the span
wholesale, leaking the entire name. Fixed in @maskera/ner reconstruct: if
exactly one possessive s remains to the word boundary, widen over it (the
mirror of the existing start-widening for "dr Svensson"). With that fix the
ALREADY PUBLISHED v5 artifact measures its best numbers yet on the curated
corpus: span F1 96.6, precision 95.2, recall 98.0, leaks 1 of 197 (Klarna).

Lesson: bisect teacher -> student -> trimmed -> quantized before blaming the
model; two of this project's three "model" bugs so far lived in the pipeline.
The all-caps and bare-name cases are now graded in the gold corpus, so the
round that does ship them will show up in CI.

`eval/gold-real.txt` is 22 verbatim sentences from public Swedish Wikipedia
(Stefan Löfven, Spotify): **real prose written by others**, hand-labelled
(gold). It removes WikiANN's silver/noisy-label caveat. PER/LOC/ORG only.

| Model on gold-real (real text)        | type-aware F1 | redaction recall |
| ------------------------------------- | ------------- | ---------------- |
| **maskera (shipped 40 MB pipeline)**  | **0.846**     | 0.84 (**recall 1.00**) |

Two honest reads:

- **type-aware 0.739 is the independent floor on gold labels**: real prose, not a
  silver-noise artefact. The 0.927 on our own set is home-turf inflation; the
  target-domain truth sits between.
- **redaction recall caught every entity (1.00)**: on this set nothing leaked.
  For the privacy use case (was the PII masked at all?), that's the number that
  matters, and it's strong.

> **Post-processing precision guard.** `maskera`'s `reconstruct()` keeps only
> word-boundary-aligned spans with at least one letter, dropping the model's
> mid-word fragments (e.g. "par" inside "Motpart") and bare digit groups (numbers
> are the rule layer's job). This lifted the shipped pipeline **0.927 → 0.946** on
> our set and **0.739 → 0.846** independent, raising precision with no recall loss.

Still encyclopedic domain (public figures), not the support/healthcare text
maskera targets; the true target-domain number needs real user data. But it's an
honest, independent, gold-labelled floor: **~0.85 type-aware, ~1.0 recall.**

### Independent benchmark (WikiANN, silver)

`evaluate_public.py` runs the same comparison on **WikiANN (Swedish)**, a
public NER dataset labeled by others, with no shared author. Restricted to
PER/LOC/ORG (public sets don't annotate addresses). 500 test sentences.

| Model (v3)              | WikiANN F1 | our-set F1 |
| ----------------------- | ---------- | ---------- |
| teacher (KB-BERT)       | 0.711      | 0.899      |
| **student (shipped)**   | **0.846**  | 0.946      |

The honest reality this surfaced:

1. **The v3 data rounds lifted our own eval far more than the independent one**
   (0.82 → 0.90 on ours; ~flat/slightly down on WikiANN). That's the synthetic
   ceiling showing: more synthetic diversity increasingly *chases our own
   distribution*, not general Swedish.
2. **WikiANN under-rates us for this use case**: it's encyclopedic (rarer vocab,
   which our PII-tuned vocab-trim drops) and silver-standard (noisy). The truth
   for the target domain (support/healthcare/legal) sits between 0.65 and 0.90.

**Conclusion: stop optimising synthetic data; the real next gain is a real
labelled Swedish eval set**, needed even just to measure honestly. Run
`python evaluate_public.py` to reproduce.

**Update: v6 acted on this and it worked.** Adding real labelled Swedish text (the
Swedish NER Corpus train split) raised the independent number from 0.782 (v5.1) to
0.891 and lifted precision and recall together, the exact trade synthetic rounds
could not make (see the v6 section above). So the shipped model is v6, not v5.1.

**The lever that remains: real *target-domain* data.** The news corpus is not the
support/healthcare/legal text maskera targets, so the next real gain is annotated
text from those domains (public court rulings and municipal records are a legal,
GDPR-safe start; see the repo README's data section). A larger independent gold
set is also still needed just to measure the target domain honestly.

### v10 casing/ORG round (2026-07-05): error analysis picked the target, not intuition

Before touching data, graded the shipped model on the full 2453-sentence klintan
test split and ran an error analysis (tables in
[docs/BENCHMARKS.md](../docs/BENCHMARKS.md) "Error analysis"). Two findings, one
of which killed a comfortable assumption:

1. **ORG misses are mostly real company names, not acronyms.** Of 80 exact-span
   ORG misses, only 6 (7.5%) are acronyms; 52 (65%) are single-word org names,
   heavily **international brands** (Apple, Google, Samsung, Opel) plus genitive
   forms (Opels, Apples), and 22 (27.5%) are multiword institutions (courts,
   media). The "just acronyms" story we could have told is false.
2. **Lowercase is a bigger leak than the 22-sentence set showed.** Forcing the
   whole test split lowercase drops span F1 −12.5pp and **triples the leak rate
   (8.4% → 24.8%)**; LOC and ORG recall roughly halve. Since the target register
   (chat/support) is lowercase, this is the biggest open lever, ahead of ORG.

Data changes made and evaluated locally (no new weights were shipped):

- **Lowercase augmentation raised and made tunable.** `generate_data.mjs`
  `LC_AUG` env, default 0.16 → **0.35**; `convert_klintan.mjs` real-text
  lowercase-duplicate share 0.10 → **0.35** (`KLINTAN_LC_AUG`), and its RNG is
  now seeded 1337 like the rest of the pipeline (it used `Math.random`).
- **Synthetic RNG fixed.** The old JavaScript LCG yielded only 1,656 unique
  rows among 24,000 generated examples because its large integer multiply lost
  precision. The generator now uses deterministic Mulberry32 (`DATA_SEED`), and
  data QA must confirm high uniqueness before a run starts.
- **International brands** added to the ORG gazetteer (Apple, Google, Samsung,
  Opel, Toyota…); they feed `orgGenitive()` too, so "Apples"/"Googles" are
  taught. Brands that are common Swedish words (Visa, Meta, Sprint) were
  deliberately excluded to avoid the v5.1 precision collapse, which higher
  lowercase augmentation makes riskier.
- **Courts / multiword institutions** added to `INSTITUTION()` (Högsta
  domstolen, hovrätt, tingsrätt…).

Success gate for the round: **lowercase leak drops from 24.8% toward <12% while
cased span-F1 holds ≥ ~85%.** If cased precision falls more than ~1pp, `LC_AUG`
was too high; sweep 0.25 / 0.30 / 0.35 against BOTH benchmarks. The lowercase
benchmark is now a flag, not a hand-edit: `LOWERCASE=1 node
packages/ner/eval/benchmark-swedish-ner.mjs`. Reminder from the v7/2026-07-04
retry: gate on the QUANTIZED artifact, not the fp32 student, and ship via the
full teacher → distill pipeline (the fast finetune path loses recall).

Two complete teacher → student → 16k-vocabulary → q4 candidates were trained on
2026-07-09. Both stayed at **39,633,680 bytes**, but neither cleared every
release gate:

- **v10a (full Swe-NERC mix): rejected.** It improved the authored regression
  set, but independent gold F1 fell to 84.5% with five leaks. Adding a large
  real corpus is not automatically useful when its register and annotation
  policy are weighted too heavily.
- **v10b (synthetic + klintan, no Swe-NERC): rejected for release.** It improved
  the large klintan test from 85.9% to **86.6%** span F1 and the lowercased test
  from 73.4% to **79.0%** (leaks 24.8% → **20.5%**), while the curated set rose
  from 96.4% to **97.6%**. However, the independent gold set fell from 91.5% to
  **87.9%** and leaks rose from one to three. The untrimmed student was also
  weaker on that set, so q4 itself was not the root cause.

Conclusion: keep the published v5 weights. The v10 data/RNG/audit improvements
remain useful infrastructure, but a future weight release needs genuinely
target-domain annotated examples and must beat v5 after vocabulary trimming and
q4 quantization. Never train on `eval/gold-real.txt` to make this gate pass.

`MASKERA_SEED` controls the teacher, distillation and fast-path trainer (default
1337). For a release candidate, compare a small fixed seed set only after q4
quantization and select by the held-out development sets. Do not select a seed
on the final gold corpora; those remain one-shot release gates.

#### Getting the real target-domain data without poisoning evaluation

The highest-value new data is not more news or more generated templates. It is
annotated text from the actual support, healthcare and legal registers. Keep two
strictly separate collections:

1. **Gold/eval:** independently written messages that are never passed to a
   training converter. This remains the honest measurement set described in
   `docs/GOLD_SET_PLAN.md`.
2. **Training/dev:** donated messages with invented PII, consented private data
   that stays private, or lawfully public domain text. Annotate exact character
   spans in the JSONL format shown by `domain-data.example.jsonl`, then run
   `convert_domain_jsonl.mjs`. The converter validates offsets, labels,
   duplicates and overlaps, and reserves a stable 20% development split. Set
   `group` to the conversation/ticket id when several messages belong together;
   the converter keeps each group wholly in train or development.

Start with roughly 300-500 diverse support/chat messages, including 25-40% hard
negatives with no PII. Do not select only easy or entity-dense messages: sample
from real scenarios, then prioritise uncertain/error-producing examples for the
next annotation batch. Keep source/register metadata outside the public text if
the corpus must remain private.

### v11 real-register round (2026-07-10): first candidate to pass every gate

The v10 conclusion said the next gain needed genuinely different real data, not
more news or synthetic. A verified source sweep found three gold corpora that
fill the register gap, all CC BY 4.0 (commercial OK with attribution):

- **SUCX 3.0 NER** (`KBLab/sucx3_ner`, simple_cased): 43k gold sentences,
  balanced 1990s genres. The data behind KBLab's lowermix model, the only
  competitor that beat us on lowercase. Sampled at `SUCX_SHARE` 0.25
  (`convert_sucx.mjs`), the v10a lesson applied: weight, never append wholesale.
- **MASSIVE sv-SE** (`AmazonScience/massive`): 11.5k professionally localized
  utterances in exactly the target register: lowercase, informal, first person.
  person/artist_name→PER, place_name→LOC, business_name/transport_agency/
  app_name→ORG (`convert_massive.mjs`).
- **SIC2** (Språkbanken): 892 manually annotated informal blog sentences
  (`convert_sic2.mjs`).

New mix: 24k synthetic + 8.5k klintan + 14.6k SUCX + 1.1k SIC2 + ~5k MASSIVE
= 53k rows, audit-clean (0.4% dup, 0.14% train/val overlap).

**Take 1 (v11a) failed the gate at 0.897 recall and taught the round's big
lesson: slot poison.** MASSIVE slots we mapped to O (media_type, app_name,
radio_name, podcast_name, news_topic) often hold real org/person names
(facebook, spotify, aftonbladet, uber, "alex och sigges", trump), so training
tagged thousands of org names as non-entities. Klintan ORG recall collapsed
72%→61%. Bisection (teacher → student → trimmed → q4) showed the damage was in
the TEACHER, i.e. the data, not the pipeline. Fix: clean org slots remapped to
ORG, mixed slots dropped wholesale (825 rows).

**Take 2 (v11b = shipped-candidate `student-v11-onnx`) passes every gate,**
q4 artifact 39.6 MB:

| Metric (q4 artifact)          | v5 (published) | v11b        |
| ----------------------------- | -------------- | ----------- |
| gold-real F1 / recall (GATE)  | 91.5 / 0.95    | **91.5** / 0.93 ✅ |
| curated set F1 / leaks        | **96.6** / 1   | 94.4 / 4    |
| klintan cased span F1 / leaks | 85.9 / **8.4%** | **86.6** / 11.3% |
| klintan lowercase F1 / leaks  | 73.4 / 24.8%   | **78.9** / **20.5%** |
| lowercase ORG / LOC recall    | 48.6 / 66.5    | **54.6** / **74.9** |
| chat spot checks (fatima, RING LARS NORDSTRÖM, john och lennart) | ❌ misses | **✅ all pass** |

The trade is explicit: the target register (lowercase chat/support) improves
across the board (+5.5 F1, leaks −4.3pp) and both tracked chat leaks are fixed
at the weight level, at the cost of cased-news recall (klintan leaks +2.9pp)
and 4 curated ORG leaks (Voi, Northmill, Inspektionen för vård och omsorg,
Försvarets materielverk) vs v5's 1 (Klarna). All remaining leaks are ORG:
startup brands and multiword authorities, a category-level gazetteer round
(NOT the eval entities themselves) is the obvious v12 lever.

Data levers for reproduction/sweeps: `SUCX_SHARE`, `SUCX_LC_AUG`,
`MASSIVE_EMPTY_SHARE`, `MASSIVE_DEV_SHARE`, `SIC2_LC_AUG` (see each
converter's header). Raw dumps land in `.benchmark/` via the parquet API
(see `run_v11.sh` provenance comments in the converters).

## Publish to Hugging Face (single hosted source)

Hosting the model once means the demo and every future `@maskera` package point at
the same place: `createNerRecognizer({ model: MASKERA_SV_NER_MODEL, dtype: "q8" })`.

```bash
uv pip install huggingface_hub
huggingface-cli login                 # or export HF_TOKEN=...
uv run python push_to_hub.py joelhagvall/maskera-sv-ner   # use your HF username
```

`push_to_hub.py` uploads `student-onnx/` (int8 ONNX + tokenizer + config) with
`maskera-sv-ner-card/README.md` as the repo README, skipping the large fp32
weights. After it's up, switch the demo from the local copy to the hosted id
(drop `localModelPath` and `allowRemoteModels: false`).

## Base model & license

Base: [`KBLab/bert-base-swedish-cased`](https://huggingface.co/KBLab/bert-base-swedish-cased)
(National Library of Sweden), released **CC0-1.0** (public domain): commercial
use, redistribution and relicensing of derived weights are all permitted with no
obligation. A courtesy acknowledgement to KBLab is in
`maskera-sv-ner-card/NOTICE`. The synthetic training data contains no real
personal data; from v6 the set also includes the public Swedish NER Corpus
(see [`docs/BENCHMARKS.md`](../docs/BENCHMARKS.md)).
