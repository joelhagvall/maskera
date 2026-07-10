# Benchmarks

**This file is the single source of truth for the published model's numbers.**
Every other document (README, Hugging Face model card, transparency page,
training notes) links here instead of copying tables. If a number elsewhere
disagrees with this file, this file wins and the other document has drifted.

- **Measured:** 2026-07-10
- **Artifact:** [`joelhagvall/maskera-sv-ner`](https://huggingface.co/joelhagvall/maskera-sv-ner),
  `onnx/model_q4.onnx` (`dtype: "q4"`, the default and what the demo ships),
  sha256 `2b8f034af5b5803d007bd226ebe675922a88e8ffb523ffc325d4ed120c2237cb`
  (**new weights: the v11 real-register training round**, see
  [training/README.md](../training/README.md); 39,633,680 bytes, same size and
  architecture as the previous artifact)
- **Pipeline:** the shipped `maskera` path (model + `reconstruct()`
  post-processing), `maskera@0.4.5`, graded by
  [`packages/ner/eval/run-eval.mjs`](../packages/ner/eval/run-eval.mjs)
- **Matching:** exact character span. This is the strict harness CI gates on;
  see [method notes](#method-notes) for why older overlap-based numbers read higher.

## Curated corpus (upper bound, regression tracker)

148 hand-authored Swedish sentences, 204 free-text entities
(PERSON / LOCATION / ORGANIZATION), including hard negatives and
all-lowercase / ALL CAPS / genitive hard cases (the 2026-07-04 additions come
from an npm-user-input stress test, including two cases the model is KNOWN to
miss, graded honestly). It shares an author with the training-data generator,
so read it as an **upper bound and regression tracker**, not a universal score.

| metric     | score | meaning                                        |
| ---------- | ----- | ---------------------------------------------- |
| precision  | 97.6% | of predictions, how many were correct          |
| recall     | 98.5% | of real entities, how many were found          |
| span F1    | 98.0% | harmonic mean, label-agnostic                  |
| labeled F1 | 98.0% | same, but the label must also be right         |
| leaks      | 1.0%  | entities missed entirely, 2 of 204 (the safety number) |

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
| precision  | 86.7% | of predictions, how many were correct          |
| recall     | 89.7% | of real entities, how many were found          |
| span F1    | 88.1% | harmonic mean, label-agnostic                  |
| labeled F1 | 86.4% | same, but the label must also be right         |
| leaks      | 1.7%  | entities missed entirely, 1 of 58              |

The v11 round traded ~3pp exact-span F1 here against the previous artifact
(91.5 -> 88.1, boundary fuzz on encyclopedic prose, not lost detections: leaks
are unchanged at 1 of 58 and overlap-based recall is 0.93) in exchange for the
target-register gains on lowercase text below. Recorded, not hidden.

Reproduce:

```bash
pnpm install && pnpm -C packages/ner build
node packages/ner/eval/convert-gold-real.mjs        # prints the corpus path
CORPUS_FILE=<printed path> MASKERA_REMOTE=1 MASKERA_F1_FLOOR=0 MASKERA_LEAK_CEIL=1 \
  node packages/ner/eval/run-eval.mjs
```

## Address (ADR) eval (the one class the other sets miss)

- **Measured:** 2026-07-10, same q4 artifact as everywhere else.

The shipped model has four classes (PER / LOC / ORG / **ADR**), but every set
above covers only the first three: the Swedish NER Corpus has no address class,
and the curated / stage-2 sets leave structured-looking data to the rule layer.
So `ADR` was the one shipped class with no independent number. This set closes
that gap. 27 sentences, 21 street-address spans, authored for this eval and held
out of training; street names were picked to **avoid** the training generator's
stem list (real streets like Sveavägen, Hornsgatan, Renstiernas gata), so the
surface forms are out-of-distribution, not memorised. It shares our annotation
style, so read it like the curated corpus, not like the independent Wikipedia
set. Distractor sentences (a bare house number, a PO box, a postcode, a phone
number) measure whether the model over-flags addresses.

| metric | score | meaning |
| ------ | ----- | ------- |
| redaction recall (any label) | **100%** (21/21) | address masked under some label |
| labeled ADDRESS recall | **100%** (21/21) | masked *and* correctly typed ADDRESS |
| leaks | **0%** (0/21) | addresses missed entirely (the safety number) |
| ADDRESS precision | **100%** (21/21) | no false ADDRESS flags on the distractor set |
| exact-span recall | **100%** (21/21) | street *and* house number both inside the span |

A clean sweep: every address detected, correctly typed, with the full span
including the house number, and no false flags. Two changes since this eval
was introduced (2026-07-07, then 4/21 exact spans): `reconstruct()` learned to
widen an ADR span over a trailing house number the model left as `O`, and the
v11 weights fixed the previous artifact's one false flag ("Vårdcentralen").

Reproduce (needs the model locally; corpus is committed, no download):

```bash
pnpm install && pnpm -C packages/ner build
CORPUS_FILE="./corpus-adr.mjs" \
  MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v11 \
  node packages/ner/eval/analyze-adr.mjs   # ADR-only breakdown + every gold vs predicted span
```

(`run-eval.mjs` on the same corpus now agrees: aggregate span-F1 98.9%, zero
leaks. `analyze-adr.mjs` remains the per-metric breakdown and prints every gold
vs predicted span.)

## Swedish NER Corpus test split (large held-out, in-distribution)

- **Measured:** 2026-07-10, same q4 artifact as above.

2453 sentences, 1280 PER/LOC/ORG entities, from the public Swedish NER Corpus
(klintan / Webbnyheter 2012) **test** split. Authored and labeled by others, so
it is not anchored to our own annotation style, and the sentences are held out
(disjoint from training). **But** the shipped model trained on this corpus's
**train** split (see [What the model was trained on](#what-the-model-was-trained-on)),
so test and train share source, domain, register and annotation guidelines. Read
this as a **large in-distribution held-out** number: honest about memorisation
(the exact sentences were never seen) but *not* a clean independent or
out-of-domain measure. It is the most reliable per-type breakdown we have.

| metric     | score | meaning                                        |
| ---------- | ----- | ---------------------------------------------- |
| precision  | 88.1% | of predictions, how many were correct          |
| recall     | 85.2% | of real entities, how many were found          |
| span F1    | 86.6% | harmonic mean, label-agnostic                  |
| labeled F1 | 83.8% | same, but the label must also be right         |
| leaks      | 11.3% | 144 of 1280 missed entirely (above the 8% CI ceiling; this is the harder set) |

Recall by type (exact span): **PERSON 90.5%** (554/612), **LOCATION 88.5%**
(314/355), **ORGANIZATION 70.9%** (222/313). ORG is the weakest type here, as it
is across every round of the [training journal](../training/README.md); the
address (ADR) class has no counterpart in this corpus and is scored separately
in [Address (ADR) eval](#address-adr-eval-the-one-class-the-other-sets-miss).
Versus the previous artifact this is +0.7 span F1 and +3.5pp precision for
−2.1pp recall (leaks 8.4% -> 11.3%): the v11 round shifted cased-news recall
toward the lowercase target register, where leaks fell 24.8% -> 20.5% (see the
error analysis below).

Reproduce (needs the model locally; downloads the test split, gitignored):

```bash
pnpm install && pnpm -C packages/ner build
curl -fsSL https://raw.githubusercontent.com/klintan/swedish-ner-corpus/master/test_corpus.txt \
  -o training/.benchmark/test_corpus.txt
MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v11 \
  node packages/ner/eval/benchmark-swedish-ner.mjs
```

## Error analysis (where the model actually fails)

The 2026-07-05 error analysis of the previous artifact identified two
weaknesses on this test split: ORG recall (misses were real company names and
multiword institutions, not just acronyms) and, above all, **lowercase text**
(leak rate tripled to 24.8% without casing cues). The v11 training round
(real target-register data: SUCX 3.0, MASSIVE sv-SE, SIC2; see
[training/README.md](../training/README.md)) was aimed at the lowercase gap.

### Lowercase after the v11 round (measured 2026-07-10)

Same corpus, forced lowercase (a proxy for the chat/support register maskera
targets), cased vs lowercased:

| metric | cased | lowercased | delta | prev. artifact lowercased |
| ------ | ----- | ---------- | ----- | ------------------------- |
| span precision | 88.1% | 83.6% | −4.5pp | 78.0% |
| span recall | 85.2% | 74.6% | −10.6pp | 69.4% |
| span F1 | 86.6% | 78.9% | −7.7pp | 73.4% |
| labeled F1 | 83.8% | 75.1% | −8.7pp | 67.2% |
| **leak rate** | 11.3% | **20.5%** | +9.2pp | **24.8%** |
| PERSON recall | 90.5% | 84.6% | −5.9pp | 81.7% |
| LOCATION recall | 88.5% | 74.9% | −13.6pp | 66.5% |
| ORGANIZATION recall | 70.9% | 54.6% | −16.3pp | 48.6% |

The round moved every lowercase number the right way (span F1 +5.5, leak rate
−4.3pp, LOC recall +8.4pp, ORG recall +6.0pp) and roughly halved the
cased-to-lowercased F1 penalty (−12.5pp to −7.7pp). Lowercase is still the
weaker register and 1 in 5 entities still leaks there; it remains a tracked
gap, now second to ORG.

### ORG is now the top weakness (both registers)

ORG recall is 70.9% cased / 54.6% lowercased, the weakest type in both. The
remaining misses, consistent across the curated set and this corpus, are
**startup/brand names** (Voi, Northmill) and **multiword institutions**
(Inspektionen för vård och omsorg, Försvarets materielverk). A category-level
gazetteer round (Swedish startups, full authority names, NOT the eval
entities themselves) is the v12 lever; see the roadmap.

Reproduce: the analysis script is not committed; regenerate both tables by
running the model over the test split cased and `text.toLowerCase()`, scoring
each with [`score.mjs`](../packages/ner/eval/score.mjs).

## How maskera compares to other Swedish NER models

Competitor rows measured 2026-07-04, the maskera row re-measured 2026-07-10
(v11 student; competitor weights are unchanged) with
[`training/benchmark_competitors.py`](../training/benchmark_competitors.py):
every model on the same gold sets, overlap matching, labels mapped to
PER / LOC / ORG (the cross-model comparable types; ADR is excluded here because
no other model has an address class — it is scored on its own in
[Address (ADR) eval](#address-adr-eval-the-one-class-the-other-sets-miss)).
**Redaction recall** is the safety number:
was the entity flagged at all, under any label. Cross-model *precision* is
indicative rather than definitive, since label schemes differ. The maskera row
is the fp32 student; the shipped q4 artifact costs about 0.01 overlap F1 on
top (see [training/README.md](../training/README.md)).

**gold-real (22 independent Wikipedia sentences, 58 entities):**

| Model | Size | Redaction recall | Typed P | Typed R | Typed F1 |
| ----- | ---- | ---------------- | ------- | ------- | -------- |
| **maskera student** | **40 MB (q4, in-browser)** | **1.00** | 0.91 | 0.97 | **0.94** |
| KBLab lowermix reallysimple-ner | ~475 MB | 1.00 | 0.92 | 0.97 | 0.94 |
| nbailab scandi-ner | ~500 MB | 1.00 | 0.95 | 0.93 | 0.94 |
| KB-NER (the SUC classic) | ~475 MB | 1.00 | 0.87 | 0.97 | 0.92 |
| KBLab reallysimple-ner | ~475 MB | 0.98 | 0.89 | 0.93 | 0.91 |
| RecordedFuture Swedish-NER | ~500 MB | 1.00 | 0.79 | 0.98 | 0.88 |
| sbx PII general / detailed | ~475 MB | 0.05 / 0.10 | 1.00 | 0.05 / 0.10 | 0.10 / 0.19 |

**gold-real LOWERCASED (chat-style text, no casing cues):**

| Model | Redaction recall | Typed F1 |
| ----- | ---------------- | -------- |
| **maskera student** | **0.97** | 0.89 |
| KBLab lowermix reallysimple-ner | **0.97** | **0.90** |
| RecordedFuture Swedish-NER | 0.83 | 0.82 |
| nbailab scandi-ner | 0.69 | 0.77 |
| KB-NER | 0.28 | 0.35 |
| KBLab reallysimple-ner | 0.29 | 0.39 |
| sbx PII general / detailed | 0.09 | 0.16 |

On the curated set all general NER models land within noise of each other
(typed F1 0.82 to 0.90, maskera redaction recall 1.00).

Takeaways:

- On independent cased Swedish text, the 40 MB maskera student ties the best
  full-size models on typed F1 (0.94) with perfect redaction recall, at under
  a tenth of their size. The alternatives run locally too, but at ~500 MB none
  of them can ship inside a web app; maskera is small enough to run where the
  text already is, including in a browser tab.
- Without casing cues, the v11 round (trained on the same SUCX data KBLab's
  lowermix model uses, plus chat-register MASSIVE sv-SE) closed the previous
  gap to lowermix: redaction recall now ties at 0.97 and typed F1 is within
  0.01 (0.89 vs 0.90), from a model a tenth the size with an address class
  lowermix lacks.
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

## Latency

Measured 2026-07-05 on an Apple M4 Pro (24 GB), Node v25.8.2, Google Chrome
148, against the curated corpus (148 sentences, average 46 chars). The v11
artifact has the same size, architecture and quantization, so these figures
carry over unchanged. Warm
figures are per sentence. Browser rows run the production demo bundle with
the self-hosted model, i.e. exactly what maskera.dev ships; "first visit"
cold start was measured against localhost, so a real first visit adds the
network transfer of the ~40 MB model on top (returning visitors read it from
Cache Storage).

| Environment | Cold start | Warm inference (median / p95) | Notes |
| ----------- | ---------- | ----------------------------- | ----- |
| Browser, WASM (demo default) | 0.19 s returning / 1.4 s first visit + download | 50 ms / 58 ms | single-threaded, no GPU needed |
| Browser, WebGPU | 0.21 s returning; first inference adds ~0.5 s shader compile | 3.7 ms / 4.6 ms | opt-in via `device: "webgpu"` |
| Node (onnxruntime native, cpu) | 0.21 s | 3.5 ms / 5.1 ms | server-side |
| Rules only (`@maskera/core`) | none | ~0.002 ms | no model, no network capability |

### Longer inputs

The per-sentence figures above cover the chat-message case (average 46
chars). Longer inputs (support tickets, transcripts) are split into
overlapping chunks past BERT's 512-token window (`runChunk` in
`packages/ner/src/index.ts`), so latency grows roughly linearly with
length. Measured 2026-07-05, same machine, Node (onnxruntime native, cpu),
warm, on texts built by concatenating curated-corpus sentences (n=20 per
length):

| Input length | Warm (median / p95) |
| ------------ | ------------------- |
| ~500 chars | 18 ms / 25 ms |
| ~2,000 chars | 75 ms / 94 ms |
| ~10,000 chars | 428 ms / 458 ms |

The same benchmark script prints these rows (`=== longer inputs ===`). The
other environments have not been measured at these lengths; since chunking
just multiplies the number of model passes, expect them to scale roughly
proportionally to their per-sentence figures (browser WASM at ~14x the
native CPU time, WebGPU at parity).

Reproduce:

```bash
# Node + rules
pnpm -C packages/ner build
MASKERA_REMOTE=1 node packages/ner/eval/bench-latency.mjs

# Browser (needs Chrome; puppeteer-core is deliberately not a repo dep)
BENCH=1 pnpm --filter demo build
npm --prefix /tmp/bench install puppeteer-core
cd apps/demo && NODE_PATH=/tmp/bench/node_modules node scripts/bench-browser.mjs
DEVICE=webgpu NODE_PATH=/tmp/bench/node_modules node scripts/bench-browser.mjs
```

## Known misses (published, on purpose)

The three sentences the published artifact is known to miss, graded honestly
in the tables above. Publishing them is part of the trust model: the eval
harness prints every leak verbatim, nothing is filtered. Provenance: the two
curated sentences are hand-authored test cases with an invented name
("Daniel") and invented all-caps text, and the gold-real sentence is verbatim,
already-published Wikipedia prose about public figures. No user data and no
real private persons appear here.

| Corpus | Input | Expected | Status |
| ------ | ----- | -------- | ------ |
| curated | "Klarna rekryterade Daniel från Spotify i fjol." | `Klarna` ORGANIZATION | known miss (sentence-initial org reads as a name-like subject; `Daniel` and `Spotify` are caught) |
| curated | "VIKTIGT: RING LARS NORDSTRÖM OMGÅENDE IDAG." | `LARS NORDSTRÖM` PERSON | known miss (long ALL CAPS sentence; the shorter "RING LARS NORDSTRÖM" is caught, so the failure is caps combined with surrounding shouting context) |
| gold-real | "Den 6 mars 2018 besökte Löfven Vita huset och hade sitt första officiella möte med …" | `Löfven` PERSON | known miss (bare surname without first name; `Vita huset` and the rest are caught) |

Fixed by the v11 round and moved out of this table: lowercase "fatima"
(chat-register name, now caught) and metonymic `Vita huset` (now caught).

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
  no real personal data), plus four public, openly licensed real corpora
  (all CC BY 4.0; nothing was scraped or collected for this project, and no
  user data is involved):
- the **Swedish NER Corpus** train split, ~6.9k real news sentences.
  Consequence: its **test** split is in-distribution and is not usable as an
  independent benchmark.
- a 25% sample of **SUCX 3.0 NER** (KBLab, scrambled-sentence SUC 3.0), ~10.8k
  gold sentences across balanced 1990s genres, the same data behind KBLab's
  case-robust lowermix model.
- **MASSIVE sv-SE** (Amazon), ~4.9k professionally localized lowercase
  chat-register utterances (its test split is untouched).
- **SIC2** (Språkbanken), ~1k manually annotated informal blog sentences.

## Continuous gates

- **Every push:** CI re-grades the published Hub artifact against the curated
  corpus with a span-F1 floor of 0.90 and a leak ceiling of 0.08
  (`.github/workflows/ci.yml`).
- **Weekly canary:** re-grades the live Hub artifact and opens an issue if
  anything drifts (`.github/workflows/model-canary.yml`).

## Known gaps

- The largest held-out number (span F1 86.6% on the 2453-sentence Swedish NER
  Corpus test split) is **in-distribution**: the model trained on that corpus's
  train split. It confirms the model generalises to unseen sentences of the
  training distribution, but it is not clean independence.
- The only **clean independent** set (different distribution, held out from all
  training) is the 22-sentence Wikipedia set: enough for a direction, not a
  grade. A larger clean-independent gold set is the top measurement TODO; the
  staged plan to build one is in [GOLD_SET_PLAN.md](GOLD_SET_PLAN.md).
- No eval set covers the actual target domain (support / healthcare / legal
  text); the true target-domain number is unknown until real annotated text
  from those domains exists. That is exactly what GOLD_SET_PLAN.md stage 2
  (donated support/chat text) is designed to produce.
- **ORG recall is the biggest quality gap** (70.9% cased / 54.6% lowercased on
  the 2453-sentence set): startup brands and multiword authorities leak. The
  category-level data round for it is planned as v12 (see
  [ROADMAP.md](ROADMAP.md)).
- **Lowercase still trails cased text** (leak rate 20.5% vs 11.3%), though the
  v11 round cut the gap roughly in half; real annotated support/chat text
  remains the lever that closes it.

## Updating this file

Re-run the commands above against the new artifact, update the tables, the
date and the artifact hash, in one commit with the model change. The
whitepaper ([`whitepaper/whitepaper.tex`](whitepaper/whitepaper.tex))
carries a dated snapshot of these numbers; update its section 5 and rebuild
the PDF (`node scripts/build-whitepaper.mjs`) in the same commit. The
round-by-round training history stays in [`training/README.md`](../training/README.md);
this file only ever describes the currently published artifact.
