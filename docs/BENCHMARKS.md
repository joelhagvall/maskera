# Benchmarks

**This file is the single source of truth for the published model's numbers.**
Other documents link here and some carry dated summary snapshots or copied
tables. If a number elsewhere disagrees with this file, this file wins and the
other document has drifted.

- **Published:** 2026-08-06
- **Artifact:** [`joelhagvall/maskera-sv-ner`](https://huggingface.co/joelhagvall/maskera-sv-ner),
  `onnx/model_q4.onnx` (`dtype: "q4"`, the default and what the demo ships),
  sha256 `6f4bf061e9af6827e4ffe82bcfcb84709daa84c5f5ed7a05c2083a3e535fda66`,
  Hub revision `7ecd7a531c989d09ffb3d9ecf4168696786a204e`, 42,705,681 bytes.
  This is the attested privacy-clean v19 release; see
  [training/README.md](../training/README.md).
- **Pipeline:** the shipped `maskera` path (model + `reconstruct()`
  post-processing), graded by
  [`packages/ner/eval/run-eval.mjs`](../packages/ner/eval/run-eval.mjs)
- **Matching:** exact character span. This is the strict harness CI gates on;
  see [method notes](#method-notes) for why older overlap-based numbers read higher.

> **Comparison boundary:** the dated public-model comparison tables below still
> describe historical v18 and must not be attributed to v19. Published v19 has
> its own release snapshot immediately below. Raw external eval copies and the
> earlier real-looking address surfaces remain excluded from the checkout.
> Those historical comparison rows used `maskera@0.6.4`; the current v19 npm
> release is versioned separately and does not relabel them.

## Published privacy-clean v19 release

- **Measured:** 2026-08-06.
- **Artifact:** `student-v19-privacy-precision2-onnx`, published as Hub revision
  `7ecd7a531c989d09ffb3d9ecf4168696786a204e`; q4,
  42,705,681 bytes, evaluated through the current packaged reconstruction and
  default whole-word precision guard.
- **Release state:** every defined gate passes; the Hub, npm source pin and demo
  checksum map all target this exact artifact.

| synthetic release set | precision | recall | span F1 | labeled F1 | leaks |
| --- | ---: | ---: | ---: | ---: | ---: |
| curated, 149 documents / 205 entities | 95.3% | 98.5% | 96.9% | 95.9% | 1/205 (0.5%) |
| synthetic ADR, 41 documents / 57 entities | 100.0% | 100.0% | **100.0%** | 96.5% | **0/57 (0.0%)** |
| LinkedIn-style, 32 documents / 53 entities | 74.6% | 88.7% | 81.0% | 77.6% | **0/53 (0.0%)** |

The synthetic ADR set contains 35 marked street-address spans. All 35 are
found, labeled ADDRESS, and matched exactly, including the house number. One
gold organisation is covered at the exact span but typed ADDRESS, so
ADDRESS-only precision is 35/36 (97.2%) and whole-corpus labeled F1 is 96.5%
even though label-agnostic span precision, recall and F1 are all 100.0%. The
curated miss is one broad public geographic region, not a person, contact,
identifier, or street address.

Two additional aggregate gates also pass:

| gate | v19 result | release floor |
| --- | ---: | ---: |
| synthetic gold, type F1 | 92.89% | 90.0% |
| synthetic gold, type recall | 94.07% | 92.0% |
| synthetic gold, masked recall | 98.31% | 97.0% |
| decomposing rare surnames, masked recall | 96.94% (285/294; 9 leaks) | >94.9% |
| decomposing rare surnames, PER-typed recall | 82.65% | reported, not gated |

This release fixes the initial privacy-clean run's over-masking on the ADR
set. The clean sweep is a pipeline result: before the current narrow runtime
precision guard, the same q4 weights scored 98.3% span F1 there. The guard
drops only configured whole-word surfaces; multi-word entities containing the
same words are unaffected. v19 does not improve every aggregate:
rare-surname masked recall is lower than the initial privacy-clean attempt but
still clears its historical safety floor. Treat the figures as release
gates on synthetic or author-coupled data, not as an independent universal
quality claim.

## Structured-detector regression corpus (core rules + v19 hybrid)

- **Measured:** 2026-08-06, after the Luhn-fallback and international-phone
  detector changes in `@maskera/core`.
- **Corpus:** 258 synthetic Swedish texts across 19 categories, with 949
  annotated PII strings. This is local exploratory coverage, not an
  independent benchmark or release gate; the generated files live under the
  ignored `tmp/pii-test/` directory.
- **Pipeline:** `maskera-sv-ner-v19` q4 on CPU through `redactWithNer`, with the
  deterministic core rules and NER layer enabled.

| run | full hits | partial leaks | clear-text misses | hit rate | classified junk redactions |
| --- | ---: | ---: | ---: | ---: | ---: |
| before detector changes | 874 | 1 | 74 | 92.1% | 284 / 1,459 (19.5%) |
| after detector changes | **937** | **1** | **11** | **98.7%** | 291 / 1,531 (19.0%) |

The 63 recovered full hits are predominantly format-correct but Luhn-invalid
personnummer/samordningsnummer, plus international phone numbers. The remaining
11 misses are malformed/OCR identifiers and NER misses in code-switched or
spoken-number text. This corpus must not be read as a universal precision claim;
clinical language still produces the largest concentration of over-redaction.

The official v19 NER release eval was rerun against the bundled q4 artifact on
the same date: curated span F1 **96.9%** (1/205 leaks), unchanged from the
published snapshot.

## Curated corpus (upper bound, regression tracker)

149 hand-authored Swedish sentences, 205 free-text entities
(PERSON / LOCATION / ORGANIZATION), including hard negatives and
all-lowercase / ALL CAPS / genitive hard cases (the 2026-07-04 additions come
from an npm-user-input stress test; the org.nr gate sentence was added with
the v16 round). It shares an author with the training-data generator,
so read it as an **upper bound and regression tracker**, not a universal score.

| metric     | score | meaning                                        |
| ---------- | ----- | ---------------------------------------------- |
| precision  | 99.5% | of predictions, how many were correct          |
| recall     | 100.0% | of real entities, how many were found         |
| span F1    | 99.8% | harmonic mean, label-agnostic                  |
| labeled F1 | 99.8% | same, but the label must also be right         |
| leaks      | 0.0%  | entities missed entirely, 0 of 205 (the safety number) |

Second consecutive zero-leak release on this corpus (v15 fixed the
sentence-initial "Fiktivbolaget" classic; v18 keeps the sweep on the extended
149-sentence set including the org.nr gate).

Reproduce (downloads the published model from the Hub):

```bash
pnpm install && pnpm build
MASKERA_REMOTE=1 node packages/ner/eval/run-eval.mjs
```

## Independent gold set (honest floor)

22 verbatim sentences of real Swedish Wikipedia prose, 58 entities, written by
others and excluded from Maskera's task training and vocabulary selection.
Small, and encyclopedic rather than the support/healthcare/legal text maskera
targets, so read it as a **directional independent floor**. As with any
pretrained base model, this does not prove that related text was absent from
KB-BERT's earlier third-party pretraining corpus.

| metric     | score | meaning                                        |
| ---------- | ----- | ---------------------------------------------- |
| precision  | 96.4% | of predictions, how many were correct          |
| recall     | 93.1% | of real entities, how many were found          |
| span F1    | 94.7% | harmonic mean, label-agnostic                  |
| labeled F1 | 94.7% | same, but the label must also be right         |
| leaks      | 3.4%  | entities missed entirely, 2 of 58              |

Up 0.8 exact-span F1 from the previous artifact (93.9) with precision up
1.7pp at the same recall, and forced-lowercase coverage is UP again
(51/58 -> **53/58**, the best measured). The honest cost, weighed
explicitly in the publish decision: leaks went 1 -> 2 of 58. The standing
metonymic-location miss is joined by a sentence-initial bare surname in one
declarative-prose sentence (the adjacent full-name form is caught): the
documented bare-surname declarative residue, now surfacing
once in cased form. The designed 294-sentence rare-surname gate built to
measure exactly this class reads its best value ever (99.3% masked, 2
leaks); see [Known misses](#known-misses-published-on-purpose).

The raw 22-sentence copy was intentionally removed from this checkout on
2026-08-06. These v18 aggregates remain for historical transparency; they are
not a dependency of the privacy-clean build or release runner.

## Address (ADR) eval (the one class the other sets miss)

- **Measured:** 2026-07-19, same q4 artifact as everywhere else.

The shipped model has four classes (PER / LOC / ORG / **ADR**), but every set
above covers only the first three: the Swedish NER Corpus has no address class,
and the curated / stage-2 sets leave structured-looking data to the rule layer.
So `ADR` was the one shipped class with no independent number. This set closes
that gap. 41 sentences, 35 street-address spans, authored for this eval and
held out of training (the original 21-address set plus the v16 round's 14
harder categories: saint/S:t prefixes, free-word endings, farm/rural shapes,
abbreviations, -kajen). These are the historical v18 results. On 2026-08-06
the corpus's ordinary street/number surfaces were replaced by explicit
synthetic markers so no example can accidentally resolve to a real property.
That revision is not directly comparable and the table below must not be
relabelled as a result on the replacement corpus.

| metric | score | meaning |
| ------ | ----- | ------- |
| redaction recall (any label) | **100%** (35/35) | address masked under some label |
| labeled ADDRESS recall | **100%** (35/35) | masked *and* correctly typed ADDRESS |
| leaks | **0%** (0/35) | addresses missed entirely (the safety number) |
| ADDRESS precision | **100%** (35/35) | no false ADDRESS flags on the distractor set |
| exact-span recall | **100%** (35/35) | street *and* house number both inside the span |

A clean sweep on every address metric, now on the extended 35-address set:
every address detected, correctly typed, with the full span including the
house number, and no false ADDRESS flags. This release also cleans the
whole distractor harness: the v15 "Festen" over-redaction (an ordinary
word tagged PERSON in one distractor sentence, that release's documented
exception) is gone, so the aggregate `run-eval.mjs` span-F1 on this mixed
corpus reads 100.0.

Reproduce (corpus is committed; the model downloads from the Hub):

```bash
pnpm install && pnpm build
CORPUS_FILE="./corpus-adr.mjs" MASKERA_MODEL=joelhagvall/maskera-sv-ner \
  node packages/ner/eval/analyze-adr.mjs   # ADR-only breakdown + every gold vs predicted span
```

With a local copy of the model (e.g. the demo's gitignored
`apps/demo/public/models/`), point at it instead:
`MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v19`.

## Public-term retention (over-redaction on PII-free text)

- **Measured:** 2026-07-19, same q4 artifact, `packages/ner/eval/benchmark-retention.mjs`.

Recall numbers need a paired utility number: a filter that masks everything
has perfect recall. This benchmark runs the model over the 1,524 sentences of
the Swedish NER Corpus test split whose gold tags are all `O` (real news
prose with no entities) and counts everything it flags as an over-redaction.
Rampart publishes the equivalent metric at 91.69% (term retention); maskera
measures:

| mode | token retention | clean sentences | false-flag spans |
| ---- | --------------- | --------------- | ---------------- |
| cased | **99.90%** | 98.7% | 21 |
| forced lowercase | **99.86%** | 98.1% | 31 |

(The previous artifact measured 99.91% / 99.86% with 20 / 33 flags, and the
releases before that 99.93% / 99.90% with 16 / 23 and 99.95% / 99.93% with
11 / 17. This release holds the line: cased +1 flag, lowercase −2, ending
the three-release slide. The absolute cost remains about one flagged token
per 1,000.) Both
numbers are lower bounds: several of the "false flags" are gold annotation
gaps rather than model errors (the cased list includes *Fjällräddningen*,
*polisen* and the surname *Hirvonen*, all unannotated in the corpus).
Method caveat: only the NER model is graded, not the rules layer, because the
corpus does not annotate structured PII, so a rules hit on e.g. a phone-like
number could be a genuine detection.

Reproduce (the model downloads from the Hub):

```bash
curl -fsSL https://raw.githubusercontent.com/klintan/swedish-ner-corpus/master/test_corpus.txt \
  --create-dirs -o training/.benchmark/test_corpus.txt
MASKERA_REMOTE=1 node packages/ner/eval/benchmark-retention.mjs
```

## Swedish NER Corpus test split (large held-out, in-distribution)

- **Measured:** 2026-07-19, same q4 artifact as above.

2453 sentences, 1280 PER/LOC/ORG entities, from the public Swedish NER Corpus
(klintan / Webbnyheter 2012) **test** split. Authored and labeled by others, so
it is not anchored to our own annotation style, and the sentences are held out
(disjoint from training). The published v18 model did train on this corpus's
train split, so test and train share source, domain, register and annotation
guidelines. Read this as a large in-distribution held-out number, not a clean
independent or out-of-domain measure.

| metric     | score | meaning                                        |
| ---------- | ----- | ---------------------------------------------- |
| precision  | 94.0% | of predictions, how many were correct          |
| recall     | 89.8% | of real entities, how many were found          |
| span F1    | 91.9% | harmonic mean, label-agnostic                  |
| labeled F1 | 89.7% | same, but the label must also be right         |
| leaks      | 7.0%  | 90 of 1280 missed entirely (third release under the 8% CI ceiling on this, the harder set, and the equal-best rate) |

Recall by type (exact span): **PERSON 96.1%** (588/612), **LOCATION 92.1%**
(327/355), **ORGANIZATION 75.1%** (235/313). ORG is the weakest type here, as it
is across every round of the [training journal](../training/README.md); the
address (ADR) class has no counterpart in this corpus and is scored separately
in [Address (ADR) eval](#address-adr-eval-the-one-class-the-other-sets-miss).
Versus the previous artifact: leaks 7.2% -> 7.0% (back to the equal-best
rate) with PERSON and LOCATION exact-span recall both up, span F1 −0.2 /
labeled F1 +0.1 (flat), ORG recall 77.0% -> 75.1% (a real 1.9pp dip; short
brand names remain the gap and the boundary churn is documented in the
training journal's v18 leak diff).

Reproduce (downloads the test split, gitignored, and the model from the Hub):

```bash
pnpm install && pnpm build
curl -fsSL https://raw.githubusercontent.com/klintan/swedish-ner-corpus/master/test_corpus.txt \
  --create-dirs -o training/.benchmark/test_corpus.txt
MASKERA_REMOTE=1 node packages/ner/eval/benchmark-swedish-ner.mjs
```

## Error analysis (where the model actually fails)

The 2026-07-05 error analysis of the previous artifact identified two
weaknesses on this test split: ORG recall (misses were real company names and
multiword institutions, not just acronyms) and, above all, **lowercase text**
(leak rate tripled to 24.8% without casing cues). The v11 training round
(real target-register data: SUCX 3.0, MASSIVE sv-SE, SIC2; see
[training/README.md](../training/README.md)) was aimed at the lowercase gap.

### Lowercase after the v18 round (measured 2026-07-19)

Same corpus, forced lowercase (a proxy for the chat/support register maskera
targets), cased vs lowercased:

| metric | cased | lowercased | delta | prev. artifact lowercased |
| ------ | ----- | ---------- | ----- | ------------------------- |
| span precision | 94.0% | 91.7% | −2.3pp | 91.7% |
| span recall | 89.8% | 82.5% | −7.3pp | 82.6% |
| span F1 | 91.9% | 86.9% | −5.0pp | 86.9% |
| labeled F1 | 89.7% | 83.3% | −6.4pp | 83.4% |
| **leak rate** | 7.0% | **14.2%** | +7.2pp | **13.8%** |
| PERSON recall | 96.1% | 91.2% | −4.9pp | 91.0% |
| LOCATION recall | 92.1% | 87.3% | −4.8pp | 86.2% |
| ORGANIZATION recall | 75.1% | 60.1% | −15.0pp | 62.0% |

The four-release streak of lowercase leak-rate improvements pauses:
**13.8% -> 14.2%** (+0.4pp, still the second-best measured and well under
the 15.5% publish ceiling). The leak diff against the previous artifact is
30 new / 25 fixed, balanced across PER/LOC/ORG in both directions:
ordinary boundary churn, not the systematic famous-entity dilution that
held the v17 candidate at 16.5% (54 new / 20 fixed; the v18 round exists
to fix exactly that, full diff in the training journal). Lowercase PERSON
and LOCATION recall are both up; lowercase ORG carries the churn.

**The encyclopedic-lowercase counter-signal keeps improving:** on the
22-sentence independent gold set forced lowercase (encyclopedic prose, 58
entities), the shipped artifact now covers **53 of 58** (redaction recall
0.91), the best measured: 48 (v13) -> 50 (v14) -> 51 (v15) -> 53. The
remaining five misses are three bare lowercase "provnamn" declaratives plus
the standing "provhuset" / "usa" metonym sentence.

### Homograph first names (the sharpest lowercase hole, measured 2026-07-21)

A user report ("lowercase `göran` right after `iphone.` is not masked")
turned into a contrast measurement, and the reported cause was not the real
one. On 252 generated lowercase chat sentences, each with one bare given
name ([`training/eval/homograph-names.txt`](../training/eval/homograph-names.txt),
graded by
[`benchmark-homograph-names.mjs`](../packages/ner/eval/benchmark-homograph-names.mjs)):

| cell | n | leaks | leak rate |
| ---- | - | ----- | --------- |
| name is also an ordinary Swedish word | 180 | 46 | **25.6%** |
| name with no word sense (control) | 72 | 1 | **1.4%** |
| homograph, brand word right before | 90 | 27 | 30.0% |
| homograph, ordinary noun right before | 90 | 19 | 21.1% |
| control, brand word right before | 36 | 1 | 2.8% |
| control, ordinary noun right before | 36 | 0 | 0.0% |

**The collision is the failure, not the context.** A name that is also a word
(`dag`, `bror`, `lova`, `juni`, `liv`, `bo` leak 5-6 of 6 frames each) leaks
~18x more than a control name in the identical sentence. The brand word that
prompted the report is real but worth ~9pp on homographs and ~3pp on ordinary
names: tail noise on top of the actual hole. The tail-length dimension did not
replicate between two runs of the experiment and should be treated as frame
noise, not signal.

**Precision on those same words is currently perfect: 0 of 31** ordinary uses
(`jag ska bo kvar i lägenheten`, `det ligger en sten i vägen`) is flagged.
That is the number that rules out the obvious fix: a lowercase first-name
gazetteer would buy recall here by spending exactly this, in exactly the
register where those words are common. The fix belongs in training data that
carries both roles of each word, and is on the roadmap for the next round.

The set is a **diagnostic, never a publish gate** (six generated frames;
gating would train the next round against the frame, the failure the v14
rare-surname frame rotation had to undo). The name list it draws from is
derived mechanically, not hand-picked, by crossing SCB given names against
SALDO word classes: [`training/gen_homograph_names.mjs`](../training/gen_homograph_names.mjs).

Reproduce:

```bash
pnpm -C packages/ner build
node training/gen_homograph_names.mjs        # downloads SCB + SALDO, ~75 MB
node training/gen_homograph_name_eval.mjs
MASKERA_REMOTE=1 node packages/ner/eval/benchmark-homograph-names.mjs
```

### ORG is still the weakest type (both registers)

ORG recall is 75.1% cased / 60.1% lowercased, the weakest type in both and
down ~2pp from the v15 release bests (77.0% / 62.0%): this release's
boundary churn lands on ORG. The v12-v14 category-level gazetteer work
fixed the multiword-institution class at the weight level, and the
municipal suffix families generalise. What remains is **short
startup/brand names** (Voi, Northmill, Knowit): a length problem more
gazetteer entries do not fix; still on the roadmap.

Reproduce: the analysis script is not committed; regenerate both tables by
running the model over the test split cased and `text.toLowerCase()`, scoring
each with [`score.mjs`](../packages/ner/eval/score.mjs).

## Rare-surname chat register (the standing publish gate)

- **Measured:** 2026-07-19, q4 artifact via the shipped pipeline.

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
| **this release (v18)** | **99.3%** | **78.2%** | **2/294** |
| previous (v15) | 99.3% | 71.4% | 2/294 |
| v13 (re-baseline) | 94.9% | 68.7% | 15/294 |

Ties the previous release's best-ever masked recall (99.3%, the same 2
leaks) while PER-typing takes its biggest single step, 71.4% -> **78.2%**:
rare names are not just covered but correctly labeled PERSON more often,
with no masked-recall trade (the v14 journal had measured that trade-off
and declined it). On the legacy (secondary) set this release masks 98.6%
(4 leaks) with PER-typing 94.2% (previous: 99.0% / 3 / 92.5%): one
sentence weaker on masking there, typing up 1.7pp.

Reproduce:

```bash
pnpm install && pnpm build
MASKERA_REMOTE=1 node packages/ner/eval/benchmark-rare-surnames.mjs
BENCHMARK_FILE=training/eval/rare-surnames-legacy.txt \
  MASKERA_REMOTE=1 node packages/ner/eval/benchmark-rare-surnames.mjs
```

## How maskera compares to other Swedish NER models

Competitor rows measured 2026-07-04 (Rampart 2026-07-14; swedish-pii and
Desert Ant redact 2026-07-16; KBLab neriob 2026-07-19), the maskera row re-measured 2026-07-19 (v18
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
untrimmed student here, which flattered the row. Reproducibility note: the
competitor rows all download from the Hub automatically, but the maskera row
grades the local training checkpoint `training/student-v18-trimmed`, which is
not committed. The same weights are published: `onnx/model.onnx` in the
[Hub repo](https://huggingface.co/joelhagvall/maskera-sv-ner) is the fp32 ONNX
export of exactly that checkpoint, so the row can be verified externally
against the published fp32 ONNX (or, closer to production, compare the shipped
q4 numbers from the sections above).

**gold-real (22 independent Wikipedia sentences, 58 entities):**

| Model | Size | Redaction recall | Typed P | Typed R | Typed F1 |
| ----- | ---- | ---------------- | ------- | ------- | -------- |
| **maskera student** | **43 MB (q4, in-browser)** | 0.97 | **0.96** | 0.95 | **0.96** |
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
| KBLab lowermix reallysimple-ner | **0.97** | 0.90 |
| **maskera student** | 0.95 | **0.91** |
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

- On independent cased Swedish text, the 43 MB maskera student leads all
  full-size models outright on typed F1 (0.96 vs 0.94) at under a tenth of
  their size. The alternatives run locally too, but at ~500 MB none of them
  can ship inside a web app; maskera is small enough to run where the text
  already is, including in a browser tab.
- On lowercase text the honest picture is register-dependent. In the
  chat/support register maskera targets, this release ties the strongest
  measured masking (rare-surname eval 99.3% on the rotated frames, 2
  leaks) with its best rare-name typing (78.2%); klintan-lowercase leaks
  read 14.2% (second-best measured, the churn documented above). On
  lowercased *encyclopedic prose* (the small table above) the gap to
  KBLab's lowermix has nearly closed: raw-student redaction recall 0.95
  vs 0.97, and maskera now edges typed F1 (0.91 vs 0.90); the shipped q4
  pipeline covers 53 of 58 on that set, the best measured (v13 shipped
  48; v15 51).
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
  eval (maskera: 99.3%). Two structural reasons, not tuning: it has **no
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
artifact; v14, v15 and v18 have the identical size, architecture and
quantization, so the rows carry over. Re-measure on the next runtime change.) That runtime costs ~20%
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
pnpm build
MASKERA_REMOTE=1 node packages/ner/eval/bench-latency.mjs

# Browser (needs Chrome; puppeteer-core is deliberately not a repo dep).
# The demo's model dir is gitignored; fetch the published model into it first:
hf download joelhagvall/maskera-sv-ner config.json tokenizer.json tokenizer_config.json \
  special_tokens_map.json vocab.txt onnx/model_q4.onnx \
  --local-dir apps/demo/public/models/maskera-sv-ner-v19
BENCH=1 pnpm --filter demo build
npm --prefix /tmp/bench install puppeteer-core
cd apps/demo && NODE_PATH=/tmp/bench/node_modules node scripts/bench-browser.mjs
DEVICE=webgpu NODE_PATH=/tmp/bench/node_modules node scripts/bench-browser.mjs
```

## Known misses (aggregate categories)

The raw external sentences and entity values were removed from this checkout
on 2026-08-06. The dated v18 aggregate retains two genuine miss categories:

| Category | Type | Status |
| -------- | ---- | ------ |
| metonymic building used as an institution name | LOCATION | one complete miss |
| sentence-initial bare surname in declarative prose | PERSON | one complete miss; adjacent full-name form covered |

The first category regressed in v13 and remained in v18. The second was new in
v18 and was weighed against the 294-sentence rare-surname aggregate, which
measured 99.3% masked. The earlier ordinary-word ADR-corpus over-redaction was
fixed in v18. Historical raw spot-probe strings are intentionally not repeated
here; the training journal retains category-level lessons and aggregate scores.

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

## Published task-data history

- Synthetic template-generated Swedish plus six openly licensed public source
  families: Swedish NER Corpus, SUCX 3.0 NER, MASSIVE sv-SE, SIC2,
  MultiCoNER v2 sv, and pseudo-labelled Flashback/Familjeliv forum samples.
  The exact historical recipe is preserved in `training/README.md` and the v18
  model card. No customer data was used.

Published privacy-clean v19 instead uses 64,000 generated rows
and 4,760 disjoint validation rows, including 2,800/560 all-`O` hard-negative
rows. It rejects structured identifiers and ordinary street/number pairs and
carries exact data/code hashes in `privacy-attestation.json`. The train SHA-256
is `5c6ad83e7b4e3b200d18dca49cd6603482c1d53e330de28ac095ef4e043786e3`,
the validation SHA-256 is
`b7b4a3886ab31218ed368ba8e20fbe2446cffe100b54c0115ef2286ee50faf1a`,
and the generator SHA-256 is
`6b800e1748245a4296626d582585f9814c7a6bd383f87b3e3f290f231585eff5`.
It is the artifact measured in the v19 release section above; the dated public
comparison tables remain historical v18 evidence. See
[`TRAINING_DATA_PROTECTION.md`](TRAINING_DATA_PROTECTION.md).

## Continuous gates

- **Every push:** CI re-grades the published Hub artifact against the curated
  corpus with a span-F1 floor of 0.90 and a leak ceiling of 0.08
  (`.github/workflows/ci.yml`).
- **Weekly canary:** re-grades the live Hub artifact and opens an issue if
  anything drifts (`.github/workflows/model-canary.yml`).

## Known gaps

- The 2453-sentence Swedish NER Corpus test split is the largest held-out v18
  measure, but it is in-distribution because v18 trained on that corpus's train
  split.
- The 22-sentence Wikipedia set adds a different distribution and was held out
  of v18 task training, but it is enough for a direction, not a grade. It also
  cannot prove example-level independence from KB-BERT pretraining. Its local
  raw copy has been removed.
- No eval set fully covers the actual target domain (support / healthcare /
  legal text); the true target-domain number remains uncertain until the
  independently authored fictional stage-2 set is larger and partner-side
  aggregate validation exists. No real or donated message enters the corpus.
- **ORG recall is the biggest quality gap** (75.1% cased / 60.1% lowercased on
  the 2453-sentence set, down ~2pp from the v15 release bests). Multiword
  authorities and the municipal suffix families are fixed at the weight level
  by the v12-v14 gazetteer work; what leaks now is short brand names (Voi,
  Northmill, Knowit), a length problem that needs its own idea (see
  [ROADMAP.md](ROADMAP.md)).
- **Lowercase still trails cased text** (leak rate 14.2% vs 7.0%; the
  four-release improvement streak paused, the churn is documented above).
  The privacy-clean levers are broader generated register coverage and
  independently authored fictional evaluation, not retained customer text.
- **Lowercase given names that are also ordinary words leak 25.6%** vs 1.4%
  for names with no word sense (`dag`, `bror`, `bo`, `liv`, `juni`, `lova`;
  measured 2026-07-21, table above). Precision on the word sense is perfect
  today (0/31), so the fix is training data carrying both roles of each word,
  not a gazetteer. Nothing ships against this yet.
- **This release's accepted cost is a second gold-real leak**:
  sentence-initial bare "Provnamn" in one declarative-prose sentence (2 of
  58 leak there now, see [Known misses](#known-misses-published-on-purpose)).
  It is the documented bare-surname declarative residue in cased form, on
  the eval axis the 294-sentence rare-surname gate was built to measure at
  scale, and that gate reads its best value ever. In exchange the release
  carries no gate exception at all: the v15 "Festen" over-redaction is
  fixed and no gate passed below its bar.

## Updating this file

Re-run the commands above against the new artifact, update the tables, the
date and the artifact hash, in one commit with the model change. The
whitepaper ([`whitepaper/whitepaper.tex`](whitepaper/whitepaper.tex))
carries a dated snapshot of these numbers; update its section 5 and rebuild
the PDF (`node scripts/build-whitepaper.mjs`) in the same commit. The
round-by-round training history stays in [`training/README.md`](../training/README.md);
this file only ever describes the currently published artifact.
