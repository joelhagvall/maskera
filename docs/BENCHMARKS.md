# Benchmarks

**This file is the single source of truth for the published model's numbers.**
Every other document (README, Hugging Face model card, transparency page,
training notes) links here instead of copying tables. If a number elsewhere
disagrees with this file, this file wins and the other document has drifted.

- **Measured:** 2026-07-16
- **Artifact:** [`joelhagvall/maskera-sv-ner`](https://huggingface.co/joelhagvall/maskera-sv-ner),
  `onnx/model_q4.onnx` (`dtype: "q4"`, the default and what the demo ships),
  sha256 `ca6b4a66d199b0edfb397c39e7ffd25a55320dd4148bb9aed8f1f16ab007c727`
  (**new weights: the v15 balanced-replay round**, see
  [training/README.md](../training/README.md); 42,705,681 bytes, same size
  and architecture as v13/v14. Retires v14's forced-lowercase gate
  exception (coverage back at 51/58, the v11 level) and fixes the
  sentence-initial "Klarna" known miss. Published with one documented
  exception of its own: a single harmless over-redaction on the ADR
  distractor set ("Festen" tagged PERSON, nothing leaks); see
  [Known gaps](#known-gaps))
- **Pipeline:** the shipped `maskera` path (model + `reconstruct()`
  post-processing), measured on `maskera@0.6.1` (0.6.2 was a docs-only
  patch; 0.6.3's two `reconstruct()` guards were verified against this
  same artifact with curated, retention and ADR numbers unchanged),
  graded by
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
(The corpus file has since gained one org.nr gate sentence from the held v16
round, so reproducing today grades 149 sentences / 205 entities; the shipped
v15 artifact was verified against the addition with these numbers unchanged
and leaks still 0.)

| metric     | score | meaning                                        |
| ---------- | ----- | ---------------------------------------------- |
| precision  | 99.5% | of predictions, how many were correct          |
| recall     | 100.0% | of real entities, how many were found         |
| span F1    | 99.8% | harmonic mean, label-agnostic                  |
| labeled F1 | 99.8% | same, but the label must also be right         |
| leaks      | 0.0%  | entities missed entirely, 0 of 204 (the safety number) |

First release with **zero curated leaks**: the sentence-initial "Klarna"
miss, the curated classic since v5, is fixed by the v15 round's
sentence-initial ORG replay (see
[Known misses](#known-misses-published-on-purpose)).

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
| precision  | 94.7% | of predictions, how many were correct          |
| recall     | 93.1% | of real entities, how many were found          |
| span F1    | 93.9% | harmonic mean, label-agnostic                  |
| labeled F1 | 93.9% | same, but the label must also be right         |
| leaks      | 1.7%  | entities missed entirely, 1 of 58              |

Down 1.8 exact-span F1 from the previous artifact (95.7; a few boundary
slips on a set where each entity is worth ~1.7pp), while the safety
numbers hold: the same single leak, and forced-lowercase coverage is UP
(50/58 -> 51/58, retiring v14's below-bar exception). The leak is
UNCHANGED from v13: metonymic "Vita huset"; see
[Known misses](#known-misses-published-on-purpose).

Reproduce:

```bash
pnpm install && pnpm -C packages/ner build
node packages/ner/eval/convert-gold-real.mjs        # prints the corpus path
CORPUS_FILE=<printed path> MASKERA_REMOTE=1 MASKERA_F1_FLOOR=0 MASKERA_LEAK_CEIL=1 \
  node packages/ner/eval/run-eval.mjs
```

## Address (ADR) eval (the one class the other sets miss)

- **Measured:** 2026-07-16, same q4 artifact as everywhere else.

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
(The corpus file has since gained the held v16 round's 14 harder sentences,
so reproducing today grades 41 sentences / 35 address spans; the shipped v15
artifact was verified against the extended set at 35/35 masked, 0 leaks. The
table below is the 21-address set as measured.)

| metric | score | meaning |
| ------ | ----- | ------- |
| redaction recall (any label) | **100%** (21/21) | address masked under some label |
| labeled ADDRESS recall | **100%** (21/21) | masked *and* correctly typed ADDRESS |
| leaks | **0%** (0/21) | addresses missed entirely (the safety number) |
| ADDRESS precision | **100%** (21/21) | no false ADDRESS flags on the distractor set |
| exact-span recall | **100%** (21/21) | street *and* house number both inside the span |

A clean sweep on every address metric: every address detected, correctly
typed, with the full span including the house number, and no false ADDRESS
flags. The v15 weights keep the clean sweep the v11 round established (this
eval started 2026-07-07 at 4/21 exact spans; `reconstruct()`'s house-number
widening and the v11 weights closed it).

**This release's one documented exception lives on this corpus, outside the
address metrics:** in the distractor sentence "Festen är hemma hos Oskar på
Linnégatan 52, fjärde våningen." the ordinary word *Festen* is tagged
PERSON, a single harmless **over**-redaction (the aggregate `run-eval.mjs`
span-F1 on this mixed corpus reads 98.9% because of it; leaks stay 0). The
v15 publish battery gates this corpus at aggregate 100.0/0; the trade was
accepted and documented because the round retires v14's G2 exception, where
real bare surnames leaked. Full reasoning in the training journal (v15
section).

Reproduce (needs the model locally; corpus is committed, no download):

```bash
pnpm install && pnpm -C packages/ner build
CORPUS_FILE="./corpus-adr.mjs" \
  MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v15 \
  node packages/ner/eval/analyze-adr.mjs   # ADR-only breakdown + every gold vs predicted span
```

## Public-term retention (over-redaction on PII-free text)

- **Measured:** 2026-07-16, same q4 artifact, `packages/ner/eval/benchmark-retention.mjs`.

Recall numbers need a paired utility number: a filter that masks everything
has perfect recall. This benchmark runs the model over the 1,524 sentences of
the Swedish NER Corpus test split whose gold tags are all `O` (real news
prose with no entities) and counts everything it flags as an over-redaction.
Rampart publishes the equivalent metric at 91.69% (term retention); maskera
measures:

| mode | token retention | clean sentences | false-flag spans |
| ---- | --------------- | --------------- | ---------------- |
| cased | **99.91%** | 98.7% | 20 |
| forced lowercase | **99.86%** | 97.9% | 33 |

(The previous artifact measured 99.93% / 99.90% with 16 / 23 flags; the two
releases before that 99.95% / 99.93% with 11 / 17. The slide is small in
absolute terms, about one extra flagged token per 2,400, but it is real and
tracked: each register round buys recall with a few more over-flags.) Both
numbers are lower bounds: several of the "false flags" are gold annotation
gaps rather than model errors (the cased list includes *Fjällräddningen*,
*polisen* and the surname *Hirvonen*, all unannotated in the corpus).
Method caveat: only the NER model is graded, not the rules layer, because the
corpus does not annotate structured PII, so a rules hit on e.g. a phone-like
number could be a genuine detection.

Reproduce (fetch the corpus per the file header, then):

```bash
MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v15 \
  node packages/ner/eval/benchmark-retention.mjs
```

## Swedish NER Corpus test split (large held-out, in-distribution)

- **Measured:** 2026-07-16, same q4 artifact as above.

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
| precision  | 94.1% | of predictions, how many were correct          |
| recall     | 90.2% | of real entities, how many were found          |
| span F1    | 92.1% | harmonic mean, label-agnostic                  |
| labeled F1 | 89.6% | same, but the label must also be right         |
| leaks      | 7.2%  | 92 of 1280 missed entirely (second release under the 8% CI ceiling on this, the harder set) |

Recall by type (exact span): **PERSON 95.9%** (587/612), **LOCATION 91.8%**
(326/355), **ORGANIZATION 77.0%** (241/313). ORG is the weakest type here, as it
is across every round of the [training journal](../training/README.md); the
address (ADR) class has no counterpart in this corpus and is scored separately
in [Address (ADR) eval](#address-adr-eval-the-one-class-the-other-sets-miss).
Versus the previous artifact: span F1 +0.1 and labeled F1 +0.5 with PERSON
and LOCATION recall both up, leaks 7.0% -> 7.2% (two sentences, within
noise, under the ceiling), ORG recall 77.3% -> 77.0% (flat; short brand
names remain the gap).

Reproduce (needs the model locally; downloads the test split, gitignored):

```bash
pnpm install && pnpm -C packages/ner build
curl -fsSL https://raw.githubusercontent.com/klintan/swedish-ner-corpus/master/test_corpus.txt \
  -o training/.benchmark/test_corpus.txt
MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v15 \
  node packages/ner/eval/benchmark-swedish-ner.mjs
```

## Error analysis (where the model actually fails)

The 2026-07-05 error analysis of the previous artifact identified two
weaknesses on this test split: ORG recall (misses were real company names and
multiword institutions, not just acronyms) and, above all, **lowercase text**
(leak rate tripled to 24.8% without casing cues). The v11 training round
(real target-register data: SUCX 3.0, MASSIVE sv-SE, SIC2; see
[training/README.md](../training/README.md)) was aimed at the lowercase gap.

### Lowercase after the v15 round (measured 2026-07-16)

Same corpus, forced lowercase (a proxy for the chat/support register maskera
targets), cased vs lowercased:

| metric | cased | lowercased | delta | prev. artifact lowercased |
| ------ | ----- | ---------- | ----- | ------------------------- |
| span precision | 94.1% | 91.7% | −2.4pp | 92.6% |
| span recall | 90.2% | 82.6% | −7.6pp | 81.3% |
| span F1 | 92.1% | 86.9% | −5.2pp | 86.6% |
| labeled F1 | 89.6% | 83.4% | −6.2pp | 83.3% |
| **leak rate** | 7.2% | **13.8%** | +6.6pp | **15.2%** |
| PERSON recall | 95.9% | 91.0% | −4.9pp | 89.1% |
| LOCATION recall | 91.8% | 86.2% | −5.6pp | 84.5% |
| ORGANIZATION recall | 77.0% | 62.0% | −15.0pp | 62.6% |

Fourth release in a row that moves the lowercase headline numbers the right
way, and the biggest single step so far: **leak rate 15.2% -> 13.8%**
(about 1 in 7 entities leaks there now, from 1 in 6.5), with lowercase
PERSON recall up 1.9pp and LOCATION up 1.7pp. The cased-lowercased gap is
the narrowest measured. Lowercase is still the weaker register and remains
a tracked gap.

**The counter-signal from the last release is resolved:** on the
22-sentence independent gold set forced lowercase (encyclopedic prose, 58
entities), the shipped artifact now covers **51 of 58** (redaction recall
0.88), back at the v11 level, versus 50 for v14 and 48 for v13. This was
v14's one accepted below-bar publish gate and v15's headline target: the
balanced-replay round (bare-surname declarative positives paired with LOC /
ORG / ADR positives and capitalised common-word negatives in the same
sentence-initial syntax) fixed the "löfven har varit engagerad ..." class
that two earlier one-sided levers (a PER loss weight, isolated bare-PER
rows) had failed on; full history in the training journal.

### ORG is still the weakest type (both registers)

ORG recall is 77.0% cased / 62.0% lowercased, the weakest type in both,
essentially flat against the v14 release bests (77.3% / 62.6%). The
v12-v14 category-level gazetteer work fixed the multiword-institution class
at the weight level, and the municipal suffix families generalise. What
remains is **short startup/brand names** (Voi, Northmill, Knowit): a length
problem more gazetteer entries do not fix; still on the roadmap.

Reproduce: the analysis script is not committed; regenerate both tables by
running the model over the test split cased and `text.toLowerCase()`, scoring
each with [`score.mjs`](../packages/ner/eval/score.mjs).

## Rare-surname chat register (the standing publish gate)

- **Measured:** 2026-07-16, q4 artifact via the shipped pipeline.

Born from the v12 publish hold ("hej jag heter tjulander ..." went unmasked).
294 generated chat/support sentences, 98 rare Swedish surnames verified to
DECOMPOSE under the trimmed inference vocabulary and verified absent from
every training source (`training/gen_rare_surname_eval.mjs`); a release must
BEAT the previous artifact here, not tie it. **Masked-at-all** (was the name
covered by any label) is the safety metric.

**Frame rotation (2026-07-14, the v14 ruler fix):** v13 take 4 trained on
frames near the original eval's templates, partially burning them as a gate.
The 18 fresh frames from the v13 round's off-frame check (never trained on)
are now the PRIMARY gate file (`eval/rare-surnames.txt`, same 98 surnames),
and the original v13 frames are kept as a secondary set
(`eval/rare-surnames-legacy.txt`). The v13 row below is its re-baseline on
the rotated ruler.

| artifact (rotated primary) | masked at all | masked as PER | leaks |
| -------------------------- | ------------- | ------------- | ----- |
| **this release (v15)** | **99.3%** | **71.4%** | **2/294** |
| previous (v14) | 98.3% | 66.3% | 5/294 |
| v13 (re-baseline) | 94.9% | 68.7% | 15/294 |

Best measured on both safety AND typing: masked-at-all 99.3% (2 leaks, was
5), and the off-frame PER-typing caveat recorded on the last release moved
the right way without trading masked recall for it (66.3% -> 71.4%; the v14
journal had measured that trade-off and declined it). On the legacy
(secondary) set this release masks 99.0% (3 leaks, PER-typed 92.5%) vs the
previous artifact's 98.6% (4, 93.9%): the margin holds on both frame sets,
with a 1.4pp typing dip on the legacy frames noted.

Reproduce:

```bash
pnpm install && pnpm -C packages/ner build
MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v15 \
  node packages/ner/eval/benchmark-rare-surnames.mjs
BENCHMARK_FILE=training/eval/rare-surnames-legacy.txt \
  MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v15 \
  node packages/ner/eval/benchmark-rare-surnames.mjs
```

## How maskera compares to other Swedish NER models

Competitor rows measured 2026-07-04 (Rampart 2026-07-14; swedish-pii and
Desert Ant redact 2026-07-16; KBLab neriob 2026-07-19), the maskera row re-measured 2026-07-16 (v15
student; competitor weights are unchanged) with
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
| **maskera student** | **43 MB (q4, in-browser)** | 0.98 | **0.97** | 0.97 | **0.97** |
| KBLab lowermix reallysimple-ner | ~475 MB | 1.00 | 0.92 | 0.97 | 0.94 |
| nbailab scandi-ner | ~500 MB | 1.00 | 0.95 | 0.93 | 0.94 |
| KBLab neriob (IOB head) | ~475 MB | 1.00 | 0.90 | 0.98 | 0.94 |
| KB-NER (the SUC classic) | ~475 MB | 1.00 | 0.87 | 0.97 | 0.92 |
| KBLab reallysimple-ner | ~475 MB | 0.98 | 0.89 | 0.93 | 0.91 |
| RecordedFuture Swedish-NER | ~500 MB | 1.00 | 0.79 | 0.98 | 0.88 |
| sbx PII general / detailed | ~475 MB | 0.05 / 0.10 | 1.00 | 0.05 / 0.10 | 0.10 / 0.19 |
| Rampart (nationaldesignstudio) | 14.7 MB (q4, in-browser) | 0.34 | 0.88 | 0.28 | 0.42 |
| Desert Ant redact (multilingual) | 13 MB model (on-device) | 0.36 | 1.00 | 0.36 | 0.53 |
| swedish-pii (regex + name lists) | 2.5 MB JS bundle | 0.50 | 0.77 | 0.40 | 0.52 |

**gold-real LOWERCASED (encyclopedic prose forced lowercase, no casing cues):**

| Model | Redaction recall | Typed F1 |
| ----- | ---------------- | -------- |
| KBLab lowermix reallysimple-ner | **0.97** | **0.90** |
| **maskera student** | 0.90 | 0.87 |
| RecordedFuture Swedish-NER | 0.83 | 0.82 |
| nbailab scandi-ner | 0.69 | 0.77 |
| KB-NER | 0.28 | 0.35 |
| KBLab reallysimple-ner | 0.29 | 0.39 |
| KBLab neriob | 0.24 | 0.33 |
| Desert Ant redact (multilingual) | 0.24 | 0.39 |
| sbx PII general / detailed | 0.09 | 0.16 |
| swedish-pii (regex + name lists) | 0.00 | 0.00 |

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
  have measured (rare-surname eval 99.3% masked on the rotated frames,
  klintan-lowercase leaks 13.8%, both release bests). On lowercased
  *encyclopedic prose* (the small table above) KBLab's lowermix still
  leads on raw-student redaction recall (0.97 vs 0.90), but the shipped q4
  pipeline now covers 51 of 58 on that set, back at the v11 level (was 50;
  v13 shipped 48): the bare-lowercase-surname declarative class that drove
  the gap is fixed by the v15 balanced replay.
- **KBLab neriob** (measured 2026-07-19, `KBLab/bert-base-swedish-cased-neriob`,
  the IOB-head sibling of the classic KB-NER with its own weights): same
  profile as KB-NER, strong cased (1.00 redaction recall, 0.94 typed F1),
  collapses on lowercase (0.24 / 0.33). Added while confirming no newer
  KB/KBLab NER model exists: `KBLab/bert-base-swedish-cased-ner` is
  byte-identical to `KB/bert-base-swedish-cased-ner` (same blob hashes), and
  the KB repo's 2026-01-08 commit is a safetensors conversion of the
  unchanged 2022 weights. The newest KBLab NER model remains lowermix
  (April 2023), already graded above.
- The sbx models are branded for PI detection but target a different label
  scheme (they barely flag plain names / places / orgs), so their low numbers
  here reflect scheme mismatch, not general quality. They are not a drop-in
  alternative for this task.
- **Rampart** (measured 2026-07-14, q4 via Transformers.js, the published
  quantization) is the only size-class-comparable competitor: a 14.7 MB
  MiniLM PII model for the browser. On Swedish it is not competitive: 0.34
  redaction recall on gold-real and 45.2% masked on the rare-surname chat
  eval (maskera: 98.3%). Two structural reasons, not tuning: it has **no
  organization label at all** (27 of gold-real's 58 entities are ORG, per-type
  ORG recall 0%), and it is uncased with NFKD accent stripping, so å/ä/ö
  collapse (every å/ä/ö-bearing surname tested leaked). Its card lists
  en/es/fr/de/it/pt/nl; Swedish is not a supported language. This is the
  strongest measured argument for a Swedish-specific model in this size
  class.
- **Desert Ant redact** (measured 2026-07-16, `@desert-ant-labs/redact`
  0.3.0 from npm, on-device ONNX, model auto-downloaded to the managed
  cache, ~13 MB): the same multilingual-on-device category as Rampart and
  the same Swedish outcome: 0.36 redaction recall cased, 0.24 lowercased.
  Its typed precision is perfect (1.00) because it predicts very little;
  what it flags is right, but 6 of 10 real Swedish entities pass through
  unmasked. Label mapping was generous (NAME->PER, CITY/STATE/STREET->LOC).
- **swedish-pii** (measured 2026-07-16, built from source at commit
  `239951f` because the npm package its README documents is not published;
  `detectPII()` defaults, generous label mapping PER_FIRST/PER_LAST->PER,
  SE_CITY/MUNICIPALITY/COUNTY/STREET_ADDRESS->LOC, work/education
  org->ORG): regex + SCB name-list lookup, no model. On cased independent
  text it misses half of all entities (0.50 redaction recall); on
  lowercase text it detects **nothing at all** (0.00: the gazetteer and
  patterns require capitalisation, so chat-register Swedish passes through
  untouched). List lookup also mislabels: "London" is tagged as a Swedish
  first name. Structured identifiers with checksums are not graded here;
  the gap measured is exactly the free-text NER layer the library does not
  have.
- None of the alternatives detects street addresses (ADR), handles the
  four-type scheme maskera's placeholder layer expects, or fits a browser
  bundle, so each would still need maskera's distillation pipeline to be
  usable here. Measured against that pipeline's own teacher-and-distill
  output, they do not motivate a backbone switch (see the base-model check in
  [training/README.md](../training/README.md)).

## Latency

Measured 2026-07-13 on an Apple M4 Pro (24 GB), Node v25.8.2, Google Chrome
148, against the curated corpus (148 sentences, average 46 chars), after the
Transformers.js 4.2 / onnxruntime-web 1.26 upgrade. (Measured on the v13
artifact; v14 and v15 have the identical size, architecture and quantization,
so the rows carry over. Re-measure on the next runtime change.) That runtime costs ~20%
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

The sentences the published artifact is known to get wrong, graded honestly
in the tables above. Publishing them is part of the trust model: the eval
harness prints every leak verbatim, nothing is filtered. Provenance:
hand-authored test cases plus verbatim, already-published Wikipedia prose
about public figures. No user data and no real private persons appear here.

| Corpus | Input | Expected | Status |
| ------ | ----- | -------- | ------ |
| gold-real | "Den 6 mars 2018 besökte Löfven Vita huset och hade sitt första officiella möte med …" | `Vita huset` LOCATION | known miss (metonymic building-as-institution; `Löfven` and the rest are caught) |
| ADR corpus | "Festen är hemma hos Oskar på Linnégatan 52, fjärde våningen." | `Festen` is an ordinary word | known **over**-redaction (`Festen` tagged PERSON; nothing leaks, `Oskar` and the address are caught) |

Metonymic `Vita huset` regressed into the table in v13 and stays; the
`Festen` over-flag is new in v15 (this release's documented exception, the
flip side of its sentence-initial fixes). Historical fixes: bare `Löfven`
and ALL CAPS "RING LARS NORDSTRÖM" (v13); sentence-initial `Klarna`, the
curated classic since v5, and the lowercase-encyclopedic below-bar gate
carried by v14, both fixed by v15's balanced replay.

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

- ~25k synthetic template-generated Swedish sentences (generator in the repo,
  no real personal data; from v13 the distillation also trains the student on
  the trimmed inference vocabulary's subword decompositions with continuation
  labels, so rare names that decompose after vocabulary trimming are learned
  rather than lucked into; from v15 this includes a 1,200-row balanced
  class-replay dose: sentence-initial bare-surname declarative positives
  paired one-for-one with LOC and ORG positives and capitalised common-word
  negatives in the same syntax), plus six public, openly licensed real corpora
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
- from v14: an ~18k-row register-targeted sample of **Flashback / Familjeliv**
  forum sentences (Språkbanken exports), pseudo-labeled by a two-model
  ensemble with a measured confidence/agreement policy and hard filters
  (rows containing gate-eval surnames dropped; see
  `training/convert_pseudo.mjs` and the training journal). Pseudo-labels,
  not gold: they amplify the informal register, and every number in this
  file is still measured on human-labeled sets.

## Continuous gates

- **Every push:** CI re-grades the published Hub artifact against the curated
  corpus with a span-F1 floor of 0.90 and a leak ceiling of 0.08
  (`.github/workflows/ci.yml`).
- **Weekly canary:** re-grades the live Hub artifact and opens an issue if
  anything drifts (`.github/workflows/model-canary.yml`).

## Known gaps

- The largest held-out number (span F1 92.1% on the 2453-sentence Swedish NER
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
- **ORG recall is the biggest quality gap** (77.0% cased / 62.0% lowercased on
  the 2453-sentence set, flat against the v14 release bests). Multiword
  authorities and the municipal suffix families are fixed at the weight level
  by the v12-v14 gazetteer work; what leaks now is short brand names (Voi,
  Northmill, Knowit), a length problem that needs its own idea (see
  [ROADMAP.md](ROADMAP.md)).
- **Lowercase still trails cased text** (leak rate 13.8% vs 7.2%, the
  narrowest gap measured); real annotated support/chat text remains the
  lever that closes it.
- **This release's accepted exception is an over-redaction, not a leak**:
  the ordinary word *Festen* is tagged PERSON in one ADR-corpus distractor
  sentence (aggregate span-F1 98.9% on that corpus against the battery's
  100.0% bar; all five address metrics stay a 100% clean sweep and leaks
  stay 0). The v15 round measured the sentence-initial boundary to be
  zero-sum across classes: four dose variants each traded a different
  single borderline span, and this candidate's flaw was chosen because it
  is the only harmless one. Full sweep in the training journal.

## Updating this file

Re-run the commands above against the new artifact, update the tables, the
date and the artifact hash, in one commit with the model change. The
whitepaper ([`whitepaper/whitepaper.tex`](whitepaper/whitepaper.tex))
carries a dated snapshot of these numbers; update its section 5 and rebuild
the PDF (`node scripts/build-whitepaper.mjs`) in the same commit. The
round-by-round training history stays in [`training/README.md`](../training/README.md);
this file only ever describes the currently published artifact.
