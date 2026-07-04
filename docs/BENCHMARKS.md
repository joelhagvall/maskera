# Benchmarks

**This file is the single source of truth for the published model's numbers.**
Every other document (README, Hugging Face model card, transparency page,
training notes) links here instead of copying tables. If a number elsewhere
disagrees with this file, this file wins and the other document has drifted.

- **Measured:** 2026-07-03
- **Artifact:** [`joelhagvall/maskera-sv-ner`](https://huggingface.co/joelhagvall/maskera-sv-ner),
  `onnx/model_q4.onnx` (`dtype: "q4"`, the default and what the demo ships),
  sha256 `f34aa2d9e2272aa8cadded3ff819827d858cb5ab07c9b40f2bc4d1d147dd5625`
- **Pipeline:** the shipped `maskera` path (model + `reconstruct()`
  post-processing), graded by [`packages/ner/eval/run-eval.mjs`](../packages/ner/eval/run-eval.mjs)
- **Matching:** exact character span. This is the strict harness CI gates on;
  see [method notes](#method-notes) for why older overlap-based numbers read higher.

## Curated corpus (upper bound, regression tracker)

139 hand-authored Swedish sentences, 197 free-text entities
(PERSON / LOCATION / ORGANIZATION), including 25 hard negatives and
all-lowercase / ALL CAPS / genitive hard cases. It shares an author with the
training-data generator, so read it as an **upper bound and regression
tracker**, not a universal score.

| metric     | score | meaning                                        |
| ---------- | ----- | ---------------------------------------------- |
| precision  | 95.0% | of predictions, how many were correct          |
| recall     | 97.5% | of real entities, how many were found          |
| span F1    | 96.2% | harmonic mean, label-agnostic                  |
| labeled F1 | 95.2% | same, but the label must also be right         |
| leaks      | 1.0%  | entities missed entirely, 2 of 197 (the safety number) |

Reproduce (downloads the published model from the Hub):

```bash
pnpm install && pnpm -C packages/ner build
MASKERA_REMOTE=1 node packages/ner/eval/run-eval.mjs
```

## Independent gold set (honest floor)

22 verbatim sentences of real Swedish Wikipedia prose, 58 entities, written by
others and held out from all training data. Small, and encyclopedic rather
than the support/healthcare/legal text maskera targets, so read it as a
**directional independent floor**.

| metric     | score | meaning                                        |
| ---------- | ----- | ---------------------------------------------- |
| precision  | 89.8% | of predictions, how many were correct          |
| recall     | 91.4% | of real entities, how many were found          |
| span F1    | 90.6% | harmonic mean, label-agnostic                  |
| labeled F1 | 90.6% | same, but the label must also be right         |
| leaks      | 3.4%  | entities missed entirely, 2 of 58              |

Reproduce:

```bash
pnpm install && pnpm -C packages/ner build
node packages/ner/eval/convert-gold-real.mjs        # prints the corpus path
CORPUS_FILE=<printed path> MASKERA_REMOTE=1 MASKERA_F1_FLOOR=0 MASKERA_LEAK_CEIL=1 \
  node packages/ner/eval/run-eval.mjs
```

## How maskera compares to other Swedish NER models

Measured 2026-07-04 with [`training/benchmark_competitors.py`](../training/benchmark_competitors.py):
every model on the same gold sets, overlap matching, labels mapped to
PER / LOC / ORG (the cross-model comparable types; ADR is excluded because no
other model has an address class). **Redaction recall** is the safety number:
was the entity flagged at all, under any label. Cross-model *precision* is
indicative rather than definitive, since label schemes differ. The maskera row
is the fp32 student; the shipped q4 artifact costs about 0.01 overlap F1 on
top (see [training/README.md](../training/README.md)).

**gold-real (22 independent Wikipedia sentences, 58 entities):**

| Model | Size | Redaction recall | Typed P | Typed R | Typed F1 |
| ----- | ---- | ---------------- | ------- | ------- | -------- |
| **maskera student** | **40 MB (q4, in-browser)** | 0.98 | **0.95** | 0.97 | **0.96** |
| KBLab lowermix reallysimple-ner | ~475 MB | 1.00 | 0.92 | 0.97 | 0.94 |
| nbailab scandi-ner | ~500 MB | 1.00 | 0.95 | 0.93 | 0.94 |
| KB-NER (the SUC classic) | ~475 MB | 1.00 | 0.87 | 0.97 | 0.92 |
| KBLab reallysimple-ner | ~475 MB | 0.98 | 0.89 | 0.93 | 0.91 |
| RecordedFuture Swedish-NER | ~500 MB | 1.00 | 0.79 | 0.98 | 0.88 |
| sbx PII general / detailed | ~475 MB | 0.05 / 0.10 | 1.00 | 0.05 / 0.10 | 0.10 / 0.19 |

**gold-real LOWERCASED (chat-style text, no casing cues):**

| Model | Redaction recall | Typed F1 |
| ----- | ---------------- | -------- |
| KBLab lowermix reallysimple-ner | **0.97** | **0.90** |
| **maskera student** | 0.91 | 0.86 |
| RecordedFuture Swedish-NER | 0.83 | 0.82 |
| nbailab scandi-ner | 0.69 | 0.77 |
| KB-NER | 0.28 | 0.35 |
| KBLab reallysimple-ner | 0.29 | 0.39 |
| sbx PII general / detailed | 0.09 | 0.16 |

On the curated set all general NER models land within noise of each other
(typed F1 0.82 to 0.90, maskera redaction recall 1.00).

Takeaways:

- On independent cased Swedish text, the 40 MB maskera student has the best
  typed F1 and precision of every model tested, at under a tenth of their size.
  The alternatives run locally too, but at ~500 MB none of them can ship
  inside a web app; maskera is small enough to run where the text already is,
  including in a browser tab.
- Without casing cues, only KBLab's lowermix model (trained on mixed-case SUCX
  specifically for this) is ahead. It is ~475 MB, has no address class, and
  trails on cased text. Its recipe is a good pointer for a future maskera data
  round: more lowercase augmentation.
- The sbx models are branded for PI detection but target a different label
  scheme (they barely flag plain names / places / orgs), so their low numbers
  here reflect scheme mismatch, not general quality. They are not a drop-in
  alternative for this task.
- None of the alternatives detects street addresses (ADR), handles the
  four-type scheme maskera's placeholder layer expects, or fits a browser
  bundle, so each would still need maskera's distillation pipeline to be
  usable here. Measured against that pipeline's own teacher-and-distill
  output, they do not motivate a backbone switch (see the base-model check in
  [training/README.md](../training/README.md)).

## Metric definitions

- **precision / recall / F1** use exact span matching (start and end must both
  match). `span F1` ignores the label (was the PII covered at all?);
  `labeled F1` also requires the right label.
- **leaks** counts gold entities with **zero overlapping prediction**. This is
  the privacy-critical number: a partial overlap still masks part of the value,
  a leak masks nothing. Redaction recall = 1 - leak rate.

## Method notes

Two things make numbers in older documents read higher than this file:

1. **Overlap vs exact matching.** The training-side Python harness
   (`training/evaluate.py`) scores overlap-based "type-aware F1", which is more
   forgiving than exact spans. The same model on the same independent set reads
   ~0.94 overlap but 0.906 exact. This file uses the stricter measure.
2. **The precision guard.** Teacher-vs-student tables in
   [`training/README.md`](../training/README.md) compare the shipped pipeline
   (with `reconstruct()`, which drops mid-word fragments and bare digits)
   against raw teacher output. That guard is why the 40 MB student can read
   higher than the 440 MB teacher in those tables.

## What the model was trained on

- ~24k synthetic template-generated Swedish sentences (generator in the repo,
  no real personal data), plus
- the **Swedish NER Corpus** train split, ~6.9k real news sentences from a
  public, openly licensed dataset. It contains real sentences about public
  figures; nothing was scraped or collected for this project, and no user data
  is involved. Consequence: the Swedish NER Corpus **test** split is
  in-distribution and is not usable as an independent benchmark.

## Continuous gates

- **Every push:** CI re-grades the published Hub artifact against the curated
  corpus with a span-F1 floor of 0.90 and a leak ceiling of 0.08
  (`.github/workflows/ci.yml`).
- **Weekly canary:** re-grades the live Hub artifact and opens an issue if
  anything drifts (`.github/workflows/model-canary.yml`).

## Known gaps

- The independent set is 22 sentences. A larger independent gold set is the
  top measurement TODO.
- No eval set covers the actual target domain (support / healthcare / legal
  text); the true target-domain number is unknown until real annotated text
  from those domains exists.

## Updating this file

Re-run the commands above against the new artifact, update the tables, the
date and the artifact hash, in one commit with the model change. The
round-by-round training history stays in [`training/README.md`](../training/README.md);
this file only ever describes the currently published artifact.
