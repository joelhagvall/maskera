# Benchmarks

**This file is the single source of truth for the published model's numbers.**
Every other document (README, Hugging Face model card, transparency page,
training notes) links here instead of copying tables. If a number elsewhere
disagrees with this file, this file wins and the other document has drifted.

- **Measured:** 2026-07-11
- **Artifact:** [`joelhagvall/maskera-sv-ner`](https://huggingface.co/joelhagvall/maskera-sv-ner),
  `onnx/model_q4.onnx` (`dtype: "q4"`, the default and what the demo ships),
  sha256 `7505b72d18705cffa73e965b23d913e516dece57aa5afe618fb801f54cfd9ee1`
  (**new weights: the v13 decomposed-surname round**, see
  [training/README.md](../training/README.md); 42,705,681 bytes, +3.1 MB over
  the previous artifact from the 20k vocabulary trim, same architecture)
- **Pipeline:** the shipped `maskera` path (model + `reconstruct()`
  post-processing), `maskera@0.5.1`, graded by
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
| precision  | 99.0% | of predictions, how many were correct          |
| recall     | 98.5% | of real entities, how many were found          |
| span F1    | 98.8% | harmonic mean, label-agnostic                  |
| labeled F1 | 98.8% | same, but the label must also be right         |
| leaks      | 0.5%  | entities missed entirely, 1 of 204 (the safety number) |

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
| precision  | 93.1% | of predictions, how many were correct          |
| recall     | 93.1% | of real entities, how many were found          |
| span F1    | 93.1% | harmonic mean, label-agnostic                  |
| labeled F1 | 93.1% | same, but the label must also be right         |
| leaks      | 1.7%  | entities missed entirely, 1 of 58              |

The v13 round recovered the ~3pp exact-span F1 that v11 had traded here and
more (86.4 -> 93.1 labeled, the best this set has measured), with leaks still
at 1 of 58. The single miss changed identity: bare "Löfven" (the previous
known miss) is now caught, while metonymic "Vita huset" regressed back to a
miss; see [Known misses](#known-misses-published-on-purpose).

Reproduce:

```bash
pnpm install && pnpm -C packages/ner build
node packages/ner/eval/convert-gold-real.mjs        # prints the corpus path
CORPUS_FILE=<printed path> MASKERA_REMOTE=1 MASKERA_F1_FLOOR=0 MASKERA_LEAK_CEIL=1 \
  node packages/ner/eval/run-eval.mjs
```

## Address (ADR) eval (the one class the other sets miss)

- **Measured:** 2026-07-11, same q4 artifact as everywhere else.

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
including the house number, and no false flags. The v13 weights keep the
clean sweep the v11 round established (this eval started 2026-07-07 at 4/21
exact spans; `reconstruct()`'s house-number widening and the v11 weights
closed it).

Reproduce (needs the model locally; corpus is committed, no download):

```bash
pnpm install && pnpm -C packages/ner build
CORPUS_FILE="./corpus-adr.mjs" \
  MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v13 \
  node packages/ner/eval/analyze-adr.mjs   # ADR-only breakdown + every gold vs predicted span
```

(`run-eval.mjs` on the same corpus now agrees: aggregate span-F1 98.9%, zero
leaks. `analyze-adr.mjs` remains the per-metric breakdown and prints every gold
vs predicted span.)

## Swedish NER Corpus test split (large held-out, in-distribution)

- **Measured:** 2026-07-11, same q4 artifact as above.

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
| precision  | 94.3% | of predictions, how many were correct          |
| recall     | 88.3% | of real entities, how many were found          |
| span F1    | 91.2% | harmonic mean, label-agnostic                  |
| labeled F1 | 89.0% | same, but the label must also be right         |
| leaks      | 8.7%  | 111 of 1280 missed entirely (just above the 8% CI ceiling; this is the harder set) |

Recall by type (exact span): **PERSON 94.8%** (580/612), **LOCATION 91.0%**
(323/355), **ORGANIZATION 72.5%** (227/313). ORG is the weakest type here, as it
is across every round of the [training journal](../training/README.md); the
address (ADR) class has no counterpart in this corpus and is scored separately
in [Address (ADR) eval](#address-adr-eval-the-one-class-the-other-sets-miss).
Versus the previous artifact this is +4.6 span F1 with every column improved,
and it breaks the leak slide of the previous three releases
(8.4% -> 11.3% in v11, back to 8.7% here at a much higher F1): the v13 round's
denser supervision (continuation labels + subword replacement, see the
training journal) lifted the cased register it never targeted.

Reproduce (needs the model locally; downloads the test split, gitignored):

```bash
pnpm install && pnpm -C packages/ner build
curl -fsSL https://raw.githubusercontent.com/klintan/swedish-ner-corpus/master/test_corpus.txt \
  -o training/.benchmark/test_corpus.txt
MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v13 \
  node packages/ner/eval/benchmark-swedish-ner.mjs
```

## Error analysis (where the model actually fails)

The 2026-07-05 error analysis of the previous artifact identified two
weaknesses on this test split: ORG recall (misses were real company names and
multiword institutions, not just acronyms) and, above all, **lowercase text**
(leak rate tripled to 24.8% without casing cues). The v11 training round
(real target-register data: SUCX 3.0, MASSIVE sv-SE, SIC2; see
[training/README.md](../training/README.md)) was aimed at the lowercase gap.

### Lowercase after the v13 round (measured 2026-07-11)

Same corpus, forced lowercase (a proxy for the chat/support register maskera
targets), cased vs lowercased:

| metric | cased | lowercased | delta | prev. artifact lowercased |
| ------ | ----- | ---------- | ----- | ------------------------- |
| span precision | 94.3% | 92.4% | −1.9pp | 83.6% |
| span recall | 88.3% | 81.0% | −7.3pp | 74.6% |
| span F1 | 91.2% | 86.3% | −4.9pp | 78.9% |
| labeled F1 | 89.0% | 83.1% | −5.9pp | 75.1% |
| **leak rate** | 8.7% | **15.5%** | +6.8pp | **20.5%** |
| PERSON recall | 94.8% | 90.8% | −4.0pp | 84.6% |
| LOCATION recall | 91.0% | 85.4% | −5.6pp | 74.9% |
| ORGANIZATION recall | 72.5% | 56.9% | −15.6pp | 54.6% |

Second release in a row that moves every lowercase number the right way
(span F1 +7.4, leak rate −5.0pp) and the cased-to-lowercased F1 penalty
shrinks again (−7.7pp to −4.9pp). Lowercase is still the weaker register
(about 1 in 6 entities leaks there) and remains a tracked gap.

**One honest counter-signal in a different lowercase register:** on the
22-sentence independent gold set forced lowercase (encyclopedic prose, 58
entities), the shipped artifact covers 48 of 58 (redaction recall 0.83)
versus 51 of 58 (0.88) for the previous artifact: bare lowercase surnames in
declarative prose ("löfven har varit engagerad i ...") leak where the chat
phrasings of the same names are caught, while several of the previous
artifact's multiword-ORG leaks there are fixed. Small n, artificial register
(nobody types encyclopedic prose in lowercase), but recorded, not hidden;
lowercase declarative-prose name frames are on the v14 list.

### ORG is still the top weakness (both registers)

ORG recall is 72.5% cased / 56.9% lowercased, the weakest type in both, though
both are release bests. The v12/v13 category-level gazetteer work fixed the
multiword-institution class at the weight level (lowercase "inspektionen för
strategiska produkter", "länsstyrelsen i örebro län" and the previous
release's authority leaks are all caught now); what remains is **short
startup/brand names** (Voi, Northmill, Knowit): a length problem more
gazetteer entries do not fix, and the municipal "-avdelningen" suffix, which
did not generalise from ten gazetteer instances. Both are on the roadmap.

Reproduce: the analysis script is not committed; regenerate both tables by
running the model over the test split cased and `text.toLowerCase()`, scoring
each with [`score.mjs`](../packages/ner/eval/score.mjs).

## Rare-surname chat register (the v13 publish gate)

- **Measured:** 2026-07-11, q4 artifact via the shipped pipeline.

Born from the v12 publish hold ("hej jag heter tjulander ..." went unmasked).
294 generated chat/support sentences, 98 rare Swedish surnames verified to
DECOMPOSE under the trimmed inference vocabulary and verified absent from
every training source (`training/gen_rare_surname_eval.mjs`); a release must
BEAT the previous artifact here, not tie it. **Masked-at-all** (was the name
covered by any label) is the safety metric.

| artifact | masked at all | masked as PER | leaks |
| -------- | ------------- | ------------- | ----- |
| **this release (v13)** | **96.6%** | 92.5% | **10/294** |
| previous (v11) | 94.9% | 93.2% | 15/294 |

A second variant with 18 FRESH frames (disjoint from both training and the
gate eval, same surnames) guards against frame overfitting: this release
masks 94.9% (15 leaks) vs the previous artifact's 92.2% (23), so the margin
holds and even grows off-frame. Caveat recorded: PER-typing on the fresh
frames is 68.7% vs the previous 74.5% (caught-but-mislabeled rare names);
masking, not typing, is the safety property, and typing is on the v14 list.

Reproduce:

```bash
pnpm install && pnpm -C packages/ner build
MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v13 \
  node packages/ner/eval/benchmark-rare-surnames.mjs
BENCHMARK_FILE=training/eval/rare-surnames-fresh.txt \
  MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v13 \
  node packages/ner/eval/benchmark-rare-surnames.mjs
```

## How maskera compares to other Swedish NER models

Competitor rows measured 2026-07-04, the maskera row re-measured 2026-07-11
(v13 student; competitor weights are unchanged) with
[`training/benchmark_competitors.py`](../training/benchmark_competitors.py):
every model on the same gold sets, overlap matching, labels mapped to
PER / LOC / ORG (the cross-model comparable types; ADR is excluded here because
no other model has an address class, it is scored on its own in
[Address (ADR) eval](#address-adr-eval-the-one-class-the-other-sets-miss)).
**Redaction recall** is the safety number:
was the entity flagged at all, under any label. Cross-model *precision* is
indicative rather than definitive, since label schemes differ. Method fix
from this release: the maskera row is now the **vocabulary-trimmed** fp32
student (what actually ships, pre-quantization); earlier releases graded the
untrimmed student here, which flattered the row.

**gold-real (22 independent Wikipedia sentences, 58 entities):**

| Model | Size | Redaction recall | Typed P | Typed R | Typed F1 |
| ----- | ---- | ---------------- | ------- | ------- | -------- |
| **maskera student** | **43 MB (q4, in-browser)** | 0.98 | **0.97** | 0.98 | **0.97** |
| KBLab lowermix reallysimple-ner | ~475 MB | 1.00 | 0.92 | 0.97 | 0.94 |
| nbailab scandi-ner | ~500 MB | 1.00 | 0.95 | 0.93 | 0.94 |
| KB-NER (the SUC classic) | ~475 MB | 1.00 | 0.87 | 0.97 | 0.92 |
| KBLab reallysimple-ner | ~475 MB | 0.98 | 0.89 | 0.93 | 0.91 |
| RecordedFuture Swedish-NER | ~500 MB | 1.00 | 0.79 | 0.98 | 0.88 |
| sbx PII general / detailed | ~475 MB | 0.05 / 0.10 | 1.00 | 0.05 / 0.10 | 0.10 / 0.19 |

**gold-real LOWERCASED (encyclopedic prose forced lowercase, no casing cues):**

| Model | Redaction recall | Typed F1 |
| ----- | ---------------- | -------- |
| KBLab lowermix reallysimple-ner | **0.97** | **0.90** |
| **maskera student** | 0.88 | 0.90 |
| RecordedFuture Swedish-NER | 0.83 | 0.82 |
| nbailab scandi-ner | 0.69 | 0.77 |
| KB-NER | 0.28 | 0.35 |
| KBLab reallysimple-ner | 0.29 | 0.39 |
| sbx PII general / detailed | 0.09 | 0.16 |

On the curated set all general NER models land within noise of each other
(typed F1 0.82 to 0.90, maskera redaction recall 1.00).

Takeaways:

- On independent cased Swedish text, the 43 MB maskera student now leads all
  full-size models outright on typed F1 (0.97 vs 0.94) at under a tenth of
  their size. The alternatives run locally too, but at ~500 MB none of them
  can ship inside a web app; maskera is small enough to run where the text
  already is, including in a browser tab.
- On lowercase text the honest picture is register-dependent. In the
  chat/support register maskera targets, this release is the strongest we
  have measured (rare-surname eval 96.6% masked, klintan-lowercase leaks
  15.5%, both release bests). On lowercased *encyclopedic prose* (the small
  table above) KBLab's lowermix leads: maskera's raw-student redaction recall
  is 0.88 and the shipped q4 pipeline measures 0.83 on that set, down from
  the previous release: bare surnames in lowercase declarative prose leak
  where chat phrasings are caught. Recorded as a known gap; the previous
  release's published 0.97 on this table was also the untrimmed student,
  which overstated its shipped artifact (0.88 measured the same way).
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

Measured 2026-07-13 on an Apple M4 Pro (24 GB), Node v25.8.2, Google Chrome
148, against the curated corpus (148 sentences, average 46 chars), after the
Transformers.js 4.2 / onnxruntime-web 1.26 upgrade. That runtime costs ~20%
on the single-threaded browser WASM path versus Transformers.js 3.8 (warm
median 50 -> 60 ms; same model artifact, and the WebGPU, Node and rules rows
are unchanged or slightly faster). Warm
figures are per sentence. Browser rows run the production demo bundle with
the self-hosted model, i.e. exactly what maskera.dev ships; "first visit"
cold start was measured against localhost, so a real first visit adds the
network transfer of the ~43 MB model on top (returning visitors read it from
Cache Storage).

| Environment | Cold start | Warm inference (median / p95) | Notes |
| ----------- | ---------- | ----------------------------- | ----- |
| Browser, WASM (demo default) | 0.30 s returning / 1.9 s first visit + download | 60 ms / 66 ms | single-threaded, no GPU needed |
| Browser, WebGPU | 0.34 s returning; first inference adds ~45 ms shader compile | 4.0 ms / 4.8 ms | opt-in via `device: "webgpu"` |
| Node (onnxruntime native, cpu) | 0.20 s | 3.4 ms / 5.3 ms | server-side |
| Rules only (`@maskera/core`) | none | ~0.002 ms | no model, no network capability |

### Longer inputs

The per-sentence figures above cover the chat-message case (average 46
chars). Longer inputs (support tickets, transcripts) are split into
overlapping chunks past BERT's 512-token window (`runChunk` in
`packages/ner/src/index.ts`), so latency grows roughly linearly with
length. Measured 2026-07-13, same machine, Node (onnxruntime native, cpu),
warm, on texts built by concatenating curated-corpus sentences (n=20 per
length):

| Input length | Warm (median / p95) |
| ------------ | ------------------- |
| ~500 chars | 17 ms / 22 ms |
| ~2,000 chars | 66 ms / 69 ms |
| ~10,000 chars | 394 ms / 426 ms |

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

The two sentences the published artifact is known to miss, graded honestly
in the tables above. Publishing them is part of the trust model: the eval
harness prints every leak verbatim, nothing is filtered. Provenance: the
curated sentence is a hand-authored test case with an invented name
("Daniel"), and the gold-real sentence is verbatim, already-published
Wikipedia prose about public figures. No user data and no real private
persons appear here.

| Corpus | Input | Expected | Status |
| ------ | ----- | -------- | ------ |
| curated | "Klarna rekryterade Daniel från Spotify i fjol." | `Klarna` ORGANIZATION | known miss (sentence-initial org reads as a name-like subject; `Daniel` and `Spotify` are caught) |
| gold-real | "Den 6 mars 2018 besökte Löfven Vita huset och hade sitt första officiella möte med …" | `Vita huset` LOCATION | known miss (metonymic building-as-institution; `Löfven` and the rest are caught) |

Fixed by the v13 round and moved out of this table: bare `Löfven` (the
long-standing bare-surname miss, in this exact sentence) and the ALL CAPS
"VIKTIGT: RING LARS NORDSTRÖM OMGÅENDE IDAG." Regressed back INTO the table
by the same round: metonymic `Vita huset`, which the v11 weights caught. The
lowercase-encyclopedic register gap described in the error analysis is also
a known, published limitation of this release.

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
   against raw teacher output. That guard is why the 43 MB student can read
   higher than the 440 MB teacher in those tables.

## What the model was trained on

- ~24k synthetic template-generated Swedish sentences (generator in the repo,
  no real personal data; from v13 the distillation also trains the student on
  the trimmed inference vocabulary's subword decompositions with continuation
  labels, so rare names that decompose after vocabulary trimming are learned
  rather than lucked into), plus five public, openly licensed real corpora
  (all CC BY 4.0; nothing was scraped or collected for this project, and no
  user data is involved):
- the **Swedish NER Corpus** train split, ~8.6k real news sentences (incl.
  lowercase augmentation duplicates). Consequence: its **test** split is
  in-distribution and is not usable as an independent benchmark.
- a 25% sample of **SUCX 3.0 NER** (KBLab, scrambled-sentence SUC 3.0), ~14.6k
  gold sentences across balanced 1990s genres, the same data behind KBLab's
  case-robust lowermix model.
- **MASSIVE sv-SE** (Amazon), ~4.9k professionally localized lowercase
  chat-register utterances (its test split is untouched).
- **SIC2** (Språkbanken), ~1k manually annotated informal blog sentences.
- a class-audited 50% sample of **MultiCoNER v2 sv** (SemEval-2023), ~4.9k
  all-lowercase wiki sentences; org-name-polluted classes dropped wholesale
  (see `training/convert_multiconer.mjs`).

## Continuous gates

- **Every push:** CI re-grades the published Hub artifact against the curated
  corpus with a span-F1 floor of 0.90 and a leak ceiling of 0.08
  (`.github/workflows/ci.yml`).
- **Weekly canary:** re-grades the live Hub artifact and opens an issue if
  anything drifts (`.github/workflows/model-canary.yml`).

## Known gaps

- The largest held-out number (span F1 91.2% on the 2453-sentence Swedish NER
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
- **ORG recall is the biggest quality gap** (72.5% cased / 56.9% lowercased on
  the 2453-sentence set). Multiword authorities are fixed at the weight level
  by the v12/v13 gazetteer work; what leaks now is short brand names (Voi,
  Northmill, Knowit), a length problem that needs its own idea (see
  [ROADMAP.md](ROADMAP.md)).
- **Lowercase still trails cased text** (leak rate 15.5% vs 8.7%), though two
  releases in a row have narrowed it; real annotated support/chat text
  remains the lever that closes it.
- **Lowercased declarative prose regressed** in this release (gold-real forced
  lowercase: 48/58 covered vs the previous 51/58): bare lowercase surnames in
  sentence shapes like "löfven har varit engagerad i ..." leak while the chat
  phrasings of the same names are caught. Small artificial probe, but tracked;
  lowercase prose name-frames are queued for v14, alongside PER-typing of
  rare names in unseen frames (masking leads, labeling lags).

## Updating this file

Re-run the commands above against the new artifact, update the tables, the
date and the artifact hash, in one commit with the model change. The
whitepaper ([`whitepaper/whitepaper.tex`](whitepaper/whitepaper.tex))
carries a dated snapshot of these numbers; update its section 5 and rebuild
the PDF (`node scripts/build-whitepaper.mjs`) in the same commit. The
round-by-round training history stays in [`training/README.md`](../training/README.md);
this file only ever describes the currently published artifact.
