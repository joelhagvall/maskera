# Benchmarks

**This file is the single source of truth for the published model's numbers.**
Every other document (README, Hugging Face model card, transparency page,
training notes) links here instead of copying tables. If a number elsewhere
disagrees with this file, this file wins and the other document has drifted.

- **Measured:** 2026-07-04
- **Artifact:** [`joelhagvall/maskera-sv-ner`](https://huggingface.co/joelhagvall/maskera-sv-ner),
  `onnx/model_q4.onnx` (`dtype: "q4"`, the default and what the demo ships),
  sha256 `f34aa2d9e2272aa8cadded3ff819827d858cb5ab07c9b40f2bc4d1d147dd5625`
  (unchanged; the 2026-07-04 gains come from the pipeline, not new weights)
- **Pipeline:** the shipped `maskera` path (model + `reconstruct()`
  post-processing), `maskera@0.4.1`, graded by
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
| precision  | 95.2% | of predictions, how many were correct          |
| recall     | 97.5% | of real entities, how many were found          |
| span F1    | 96.4% | harmonic mean, label-agnostic                  |
| labeled F1 | 95.4% | same, but the label must also be right         |
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
| precision  | 90.0% | of predictions, how many were correct          |
| recall     | 93.1% | of real entities, how many were found          |
| span F1    | 91.5% | harmonic mean, label-agnostic                  |
| labeled F1 | 91.5% | same, but the label must also be right         |
| leaks      | 1.7%  | entities missed entirely, 1 of 58              |

Reproduce:

```bash
pnpm install && pnpm -C packages/ner build
node packages/ner/eval/convert-gold-real.mjs        # prints the corpus path
CORPUS_FILE=<printed path> MASKERA_REMOTE=1 MASKERA_F1_FLOOR=0 MASKERA_LEAK_CEIL=1 \
  node packages/ner/eval/run-eval.mjs
```

## Address (ADR) eval (the one class the other sets miss)

- **Measured:** 2026-07-07, same q4 artifact as everywhere else (sha unchanged).

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
| ADDRESS precision | 95.5% (21/22) | one false flag: "Vårdcentralen" tagged ADDRESS |
| exact-span recall | **19%** (4/21) | street *and* house number both inside the span |

The headline is the split between the first three rows and the last: the model
detects and correctly types **every** address with zero leaks, but on 17 of 21
it **drops the house number** — it tags `Sveavägen` but not `Sveavägen 44`. The
four exact matches are all cases where a letter is glued to the number
(`Odengatan 12B`, `skånegatan 74 b`, `Ynglingavägen 4 D`); a plain `Gata NN`
loses the digits. For redaction that is a **partial exposure**: the street is
masked (`[ADDRESS_1] 44`) but a bare house number can remain in the clear. A
lone number is far less identifying than the street, so leakage stays 0%, but
tightening the ADR span boundary to include the trailing number is the clear
next training lever for this class. (The training generator emits addresses as
`street SP number`; the model learned the stem strongly and treats the detached
number as `O`.)

Reproduce (needs the model locally; corpus is committed, no download):

```bash
pnpm install && pnpm -C packages/ner build
CORPUS_FILE="./corpus-adr.mjs" \
  MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v5 \
  node packages/ner/eval/analyze-adr.mjs   # ADR-only breakdown + every gold vs predicted span
```

(`run-eval.mjs` on the same corpus reports an aggregate span-F1 of 57.8%, but
that conflates the number-dropping boundary miss with detection; `analyze-adr.mjs`
separates the two, which is why the per-metric table above is the honest read.)

## Swedish NER Corpus test split (large held-out, in-distribution)

- **Measured:** 2026-07-05, same q4 artifact as above (sha unchanged).

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
| precision  | 84.6% | of predictions, how many were correct          |
| recall     | 87.3% | of real entities, how many were found          |
| span F1    | 85.9% | harmonic mean, label-agnostic                  |
| labeled F1 | 81.9% | same, but the label must also be right         |
| leaks      | 8.4%  | 108 of 1280 missed entirely (above the 8% CI ceiling; this is the harder set) |

Recall by type (exact span): **PERSON 91.8%** (562/612), **LOCATION 91.0%**
(323/355), **ORGANIZATION 74.4%** (233/313). ORG is the weakest type here, as it
is across every round of the [training journal](../training/README.md); the
address (ADR) class has no counterpart in this corpus and is scored separately
in [Address (ADR) eval](#address-adr-eval-the-one-class-the-other-sets-miss).

Reproduce (needs the model locally; downloads the test split, gitignored):

```bash
pnpm install && pnpm -C packages/ner build
curl -fsSL https://raw.githubusercontent.com/klintan/swedish-ner-corpus/master/test_corpus.txt \
  -o training/.benchmark/test_corpus.txt
MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v5 \
  node packages/ner/eval/benchmark-swedish-ner.mjs
```

## Error analysis (where the model actually fails)

Measured 2026-07-05 on the 2453-sentence Swedish NER Corpus test split, to turn
the two known weaknesses (ORG recall, lowercase text) into specifics that a
training round can act on. Both are honest bad news, recorded on purpose.

### ORG misses are mostly real company names, not acronyms

Of 313 gold ORG entities, 80 are missed (exact span). Of those 80, **63 are
total leaks** (no overlapping prediction at all); ORG redaction recall (caught
under any label) is 79.9%. A convenient story would be "the misses are just bare
acronyms" — the data refutes it:

| Category | Count | Share | Examples |
| -------- | ----- | ----- | -------- |
| single Capitalised word (real orgs) | 52 | 65% | Apple, Google, Samsung, Skandia, Villaägarna, Djurgården, Fritidsresor |
| multiword organisation | 22 | 27.5% | Högsta domstolen, Davis Cup, Rio de Janeiros Zoo, The Voice, Rosa bandet |
| acronym (ALLCAPS ≤6) | 6 | 7.5% | S, C, IOK |

Three actionable patterns: **international brands** (Apple, Google, Samsung,
Sprint, Opel) under-represented in Swedish-first training data; **genitive ORG**
forms (Opels, Apples, Samsungs, Googles, Socialdemokaternas, Fotbollförbundets);
and **multiword institutions** (courts, media, sports). Next ORG data round:
add these three, in that order.

### Lowercase is a bigger weakness than the 22-sentence set showed

Same corpus, forced lowercase (a proxy for the chat/support register maskera
targets), cased vs lowercased:

| metric | cased | lowercased | delta |
| ------ | ----- | ---------- | ----- |
| span precision | 84.6% | 78.0% | −6.5pp |
| span recall | 87.3% | 69.4% | −18.0pp |
| span F1 | 85.9% | 73.4% | −12.5pp |
| labeled F1 | 81.9% | 67.2% | −14.8pp |
| **leak rate** | 8.4% | **24.8%** | **+16.3pp** |
| PERSON recall | 91.8% | 81.7% | −10.1pp |
| LOCATION recall | 91.0% | 66.5% | −24.5pp |
| ORGANIZATION recall | 74.4% | 48.6% | −25.9pp |

Leaks nearly triple without casing cues: **1 in 4 entities slips through**.
PERSON holds up best (names carry non-casing signal); LOCATION and ORG collapse.
This matters because the **target domain is lowercase**: support and chat text is
where the product is used and where the model is weakest. The 22-sentence gold
set understated this (≈−5pp); at 2453 sentences it is −12.5pp span F1 and a
tripled leak rate. Lowercase augmentation (cf. KBLab's lowermix recipe in the
comparison below) is the single biggest open lever, ahead of the ORG round.

Reproduce: the analysis script is not committed; regenerate both tables by
running the model over the test split cased and `text.toLowerCase()`, scoring
each with [`score.mjs`](../packages/ner/eval/score.mjs).

## How maskera compares to other Swedish NER models

Measured 2026-07-04 with [`training/benchmark_competitors.py`](../training/benchmark_competitors.py):
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

## Latency

Measured 2026-07-05 on an Apple M4 Pro (24 GB), Node v25.8.2, Google Chrome
148, against the curated corpus (148 sentences, average 46 chars). Warm
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
curated sentences are hand-authored test cases with invented names ("Daniel",
"fatima"), and the gold-real sentence is verbatim, already-published
Wikipedia prose about public figures. No user data and no real private
persons appear here.

| Corpus | Input | Expected | Status |
| ------ | ----- | -------- | ------ |
| curated | "Klarna rekryterade Daniel från Spotify i fjol." | `Klarna` ORGANIZATION | known miss (sentence-initial org reads as a name-like subject; `Daniel` and `Spotify` are caught) |
| curated | "hejhej det är fatima igen, hör av dig när du kan" | `fatima` PERSON | known miss. Not casing alone: capitalised "Fatima" is caught, and so is lowercase "anna". The failure is lowercase text combined with a name further from the training distribution; name-origin robustness in casing-free text is a tracked gap (see the lowercased benchmark and GOLD_SET_PLAN.md) |
| gold-real | "Den 6 mars 2018 besökte Löfven Vita huset och hade sitt första officiella möte med …" | `Vita huset` LOCATION | known miss (metonymic building name; `Löfven` and the rest are caught) |

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

- The largest held-out number (span F1 85.9% on the 2453-sentence Swedish NER
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
- **Lowercase is the biggest quality gap, not ORG.** On the 2453-sentence set,
  forcing lowercase drops span F1 −12.5pp and triples the leak rate to 24.8%
  (see [Error analysis](#error-analysis-where-the-model-actually-fails)). Since
  the target register (chat/support) is lowercase, lowercase augmentation is the
  top training priority, ahead of the ORG recall round.

## Updating this file

Re-run the commands above against the new artifact, update the tables, the
date and the artifact hash, in one commit with the model change. The
whitepaper ([`whitepaper/whitepaper.tex`](whitepaper/whitepaper.tex))
carries a dated snapshot of these numbers; update its section 5 and rebuild
the PDF (`node scripts/build-whitepaper.mjs`) in the same commit. The
round-by-round training history stays in [`training/README.md`](../training/README.md);
this file only ever describes the currently published artifact.
