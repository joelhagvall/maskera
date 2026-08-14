---
license: mit
language:
  - sv
library_name: transformers.js
pipeline_tag: token-classification
base_model: KBLab/bert-base-swedish-cased
tags:
  - pii
  - ner
  - swedish
  - privacy
  - redaction
  - gdpr
  - onnx
  - transformers.js
widget:
  - text: "Jag heter Provnamn Maskera och jobbar på Fiktivbolaget i Provbyn."
---

<!-- maskera-release-status: published -->

# maskera-sv-ner

> **Repository status (2026-08-06):** the weights served under this id are the
> attested, privacy-clean v19 release. The dated public-comparison tables below
> remain historical v18 metrics and are explicitly separated from v19's
> synthetic release-gate results.

A small Swedish token-classification model that finds **free-text PII**
(people, places and organisations) so it can be redacted before text is sent to
an LLM. It is the optional model layer of [**maskera**](https://github.com/joelhagvall/maskera),
a Swedish-first, client-side PII redaction toolkit. The deterministic stuff
(personnummer, organisationsnummer, IBAN, phone, e-mail…) is handled by
maskera's rule layer; this model only fills the gaps rules can't: names and
places in running text.

![Where this model fits: input text forks into layer 1, maskera's deterministic format-aware rules for structured PII like personnummer, and layer 2, this model, catching free text like names. Rules win on overlap, and the merged result is the masked output.](https://maskera.dev/layers.svg)

All inference happens **on the device where the text is**, via
[Transformers.js](https://huggingface.co/docs/transformers.js) / ONNX Runtime
(browser, Node, Electron): nothing is sent to any server. At ~43 MB it is
small enough to run **directly in a browser tab**, which is exactly how the
maskera demo ships: try it live at [maskera.dev](https://maskera.dev).

The current v19 q4 artifact was re-run on 2026-08-11 against KBLab's
case-robust lowermix model on the same 121 hand-authored synthetic Swedish
texts (211 PER/LOC/ORG entities). Maskera masked all 211 entities both with
original casing and lowercased; KBLab masked 205 and 187. KBLab led typed F1
on original casing (89.4% vs 87.1%); Maskera led lowercase typed F1 (85.7% vs
83.2%). The corpus is author-coupled to Maskera, so this is directional rather
than an independent ranking. The broader public-model comparison remains a
historical v18 snapshot; see [How it compares](#how-it-compares).

The complete v19 hybrid was also compared on 2026-08-14 with LogosGuard 2.4.4
in Chrome, Free/`Balanced`, over 258 synthetic Swedish domain texts with 952
annotated PII strings. Under the same strict full-removal scorer, Maskera fully
removed **933/952 (98.0%)** and LogosGuard **606/952 (63.7%)**;
partial/clear-text leaks were 8/11 and 49/297. The corpus is author-coupled and
not exhaustively annotated for precision. Per-document outcomes, capture
hashes, settings, encoding caveat and reproduction boundary are in the
canonical benchmark.

- **Base model:** [KBLab/bert-base-swedish-cased](https://huggingface.co/KBLab/bert-base-swedish-cased) (KB-BERT, CC0), 6 transformer layers
- **Task:** token classification (BIO), entity types `PER`, `LOC`, `ORG`, `ADR`
- **Languages:** Swedish
- **License:** MIT

## Labels

| Tag     | Meaning                       |
| ------- | ----------------------------- |
| `O`     | not an entity                 |
| `PER`   | person name                   |
| `LOC`   | place / location              |
| `ORG`   | organisation / company        |
| `ADR`   | street address                |

Tags are emitted in BIO form (`B-PER`, `I-PER`, …). When you run the model
through `maskera`, the raw tags map to the placeholder names you see in
redacted output: `PER` → `NAMN`, `LOC` → `PLATS`, `ORG` → `ORGANISATION`,`ADR` → `ADRESS` (e.g. `[NAMN_1]`).

Note: the PER / LOC / ORG benchmark sets below contain no street addresses, so
`ADR` is measured on its own set (41 sentences, 35 address spans incl.
saint-prefix, free-word-ending, farm and abbreviated forms, held out of
training). Measured 2026-07-19 on the shipped q4 artifact: **redaction recall
100%**, **0% leaks**, **ADDRESS precision 100%**, **exact-span recall 100%**,
house numbers included. The earlier real-looking street/number surfaces were
removed from the repository on 2026-08-06 and replaced with conspicuously
synthetic markers; the dated v18 address result is therefore historical. v19
has been measured separately on the replacement set (all 35 addresses exact,
0/57 corpus leaks) and does not relabel the v18 result. The previous
release's documented over-redaction on this corpus's distractor set (the
ordinary word "Festen" tagged PERSON) is fixed. Full breakdown:
[BENCHMARKS.md → Address (ADR) eval](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md#address-adr-eval-the-one-class-the-other-sets-miss).

## Quantizations

Three ONNX variants are published so you can trade size for quality:

| `dtype`  | file                       | size    | notes                          |
| -------- | -------------------------- | ------- | ------------------------------ |
| `"q4"`   | `onnx/model_q4.onnx`       | ~43 MB  | default, fastest, smallest     |
| `"q8"`   | `onnx/model_quantized.onnx`| ~59 MB  | int8, better quality           |
| `"fp32"` | `onnx/model.onnx`          | ~233 MB | full precision, best quality   |

## Usage

### With maskera (recommended)

```ts
import { createNerRecognizer, redactWithNer } from "maskera"

const recognizer = createNerRecognizer({
  model: "joelhagvall/maskera-sv-ner",
  dtype: "q4",
})

const { text, restore } = await redactWithNer(
  "Provnamn Maskera på Fiktivbolaget i Provbyn ringde om fakturan.",
  { recognizer },
)
// text -> "[NAMN_1] på [ORGANISATION_1] i [PLATS_1] ringde om fakturan."
```

For clinical text, use the package's built-in precision profile rather than
changing the model threshold globally:

```ts
const result = await redactWithNer(journalText, {
  recognizer,
  profile: "clinical",
})
```

Omitting `profile` keeps the general default. The clinical policy never drops
deterministic rule detections and is intentionally limited to workflows where
retaining measurements, medication doses and care terms matters.

### With Transformers.js directly

```ts
import { pipeline } from "@huggingface/transformers"

const ner = await pipeline("token-classification", "joelhagvall/maskera-sv-ner", {
  dtype: "q4",
})
const out = await ner("Provnamn Maskera bor i Provbyn.")
```

## Intended use & limitations

- **Intended use:** redacting free-text Swedish names/places/orgs as a privacy
  layer in front of an LLM, paired with maskera's deterministic rule detectors.
- **Not a compliance product.** It will miss and over-flag entities; treat its
  output as a *risk-reduction* layer, not a guarantee. Do not rely on it alone
  for anything legally sensitive.
- Trained for Swedish; behaviour on other languages is undefined.
- Structured identifiers (personnummer, IBAN, phone numbers, …) are deliberately
  out of scope; use maskera's rule layer for those.
- For DPOs, security teams and legal reviewers assessing the full system:
  the maskera whitepaper covers architecture, privacy model, training data
  and GDPR positioning: [maskera.dev/whitepaper.pdf](https://maskera.dev/whitepaper.pdf).

## Evaluation

The canonical, dated benchmark tables live in the maskera repo:
[`docs/BENCHMARKS.md`](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md).
Numbers below are copied from there (measured 2026-07-19, `dtype="q4"`,
**exact-span matching**, via the shipped `maskera` pipeline); when they
disagree, BENCHMARKS.md wins.

Curated maskera corpus (149 hand-authored sentences, 205 free-text PER/LOC/ORG
entities, incl. hard negatives and all-lowercase / ALL CAPS / genitive hard
cases, graded honestly). Clean, well-formed sentences that share an author
with the training generator, so treat it as an upper bound and regression
tracker. Second consecutive release with zero leaks on this set:

| metric    | score | meaning                                  |
| --------- | ----- | ---------------------------------------- |
| precision | 99.5% | of predictions, how many were correct    |
| recall    | 100.0% | of real entities, how many were found   |
| span F1   | 99.8% | harmonic mean, label-agnostic            |
| leaks     | 0.0%  | entities missed entirely (the safety number) |

Independent gold set (22 sentences of real Swedish Wikipedia prose,
hand-labelled and excluded from Maskera's task training and vocabulary
selection). Small, so read it as a directional independent floor; this does
not prove example-level absence from KB-BERT's earlier pretraining corpus:

| metric    | score | meaning                                  |
| --------- | ----- | ---------------------------------------- |
| precision | 96.4% | of predictions, how many were correct    |
| recall    | 93.1% | of real entities, how many were found    |
| span F1   | 94.7% | harmonic mean, label-agnostic            |
| leaks     | 3.4%  | entities missed entirely, 2 of 58 (both listed in BENCHMARKS.md's known-miss table) |

### Published privacy-clean v19

The published v19 artifact's task-specific fine-tuning and distillation data
is generated by `training/generate_data.mjs`: 64,000 training rows and 4,760
disjoint validation rows, with whole-sentence lowercase, ALL CAPS, genitive,
balanced-class, all-`O` hard-negative, and trimmed-vocabulary subword variants.
It does not use customer data, logs, forum posts, news, scraped text, public NER
corpora, or pseudo-labels from those sources. Its active release battery also
uses only synthetic/task-authored sets and non-record category probes. The 20k
vocabulary ranks pieces by the attested synthetic splits and fills unused
capacity from the pinned KB-BERT tokenizer's native id order.
Common name, place, and organisation fragments are randomly composed as class
exemplars rather than copied records or factual claims; a chance collision with
an ordinary real name cannot be ruled out. Every address span contains an
explicit synthetic marker, so a random street/number pair cannot silently
become a plausible real property address.

Every task row is rejected if it contains an IBAN/account-shaped value,
identity or organisation number, phone, e-mail, URL, public IP, payment
identifier, long account/card-like number, or postal code. This includes
officially reserved test values: those are useful for the separate rule-engine
tests but unnecessary for NER weights. The exact train/validation row counts
and SHA-256 hashes, the generator code hash, and audit-code hashes are in
`privacy-attestation.json` beside the weights. Training, distillation, vocabulary
trimming, ONNX export, and publication all refuse legacy or incomplete
attestations.

The exact published-v19 provenance is:

- generator SHA-256:
  `6b800e1748245a4296626d582585f9814c7a6bd383f87b3e3f290f231585eff5`;
- train SHA-256:
  `5c6ad83e7b4e3b200d18dca49cd6603482c1d53e330de28ac095ef4e043786e3`;
- validation SHA-256:
  `b7b4a3886ab31218ed368ba8e20fbe2446cffe100b54c0115ef2286ee50faf1a`;
- KB-BERT revision:
  `ce7c3424687f042f1320e0528293d492c82918c4`.

Measured on the published q4 artifact plus the packaged runtime precision
guard, with the LinkedIn-style row re-measured from a clean build on
2026-08-10: curated span F1 96.9% with 1/205 leaks; revised synthetic ADR span
precision/recall/F1 100.0% with 0/57 leaks; LinkedIn-style span F1 81.7% with
0/53 leaks; decomposing rare-surname masked recall 96.94% (285/294). All 35
marked address spans are exact and labeled ADDRESS. One gold organisation is
typed ADDRESS, so whole-corpus ADR labeled F1 is 96.5% and ADDRESS-only
precision is 35/36. These are synthetic release-gate results, not the historical
v18 comparison metrics or an independent universal quality estimate.

This attestation covers Maskera's task-specific processing. It does not claim
that the third-party KB-BERT checkpoint was originally pretrained on
synthetic-only data; CC0 is a copyright permission, not a GDPR determination.
Full scope and verification commands:
[TRAINING_DATA_PROTECTION.md](https://github.com/joelhagvall/maskera/blob/main/docs/TRAINING_DATA_PROTECTION.md).
Harnesses live in the
[maskera repo](https://github.com/joelhagvall/maskera) (`packages/ner/eval`
and `training/`); run them yourself before relying on the numbers.

## How it compares

### Current v19 vs KBLab lowermix

Measured 2026-08-11 with overlap matching on 121 synthetic, hand-authored
Swedish texts containing 211 comparable PER/LOC/ORG entities. Maskera is the
published 43 MB q4 ONNX artifact; KBLab lowermix is its published 496 MB fp32
artifact at revision `007c6b26e6418574c494791f036d5dfa34a558da`.
Addresses and Maskera's product post-processing are excluded.

| casing | model | masked at all | typed F1 |
| --- | --- | ---: | ---: |
| original | **maskera-sv-ner v19 q4** | **100.0% (211/211)** | 87.1% |
| original | KBLab lowermix fp32 | 97.2% (205/211) | **89.4%** |
| lowercase | **maskera-sv-ner v19 q4** | **100.0% (211/211)** | **85.7%** |
| lowercase | KBLab lowermix fp32 | 88.6% (187/211) | 83.2% |

Maskera's developer wrote the corpus. It is held out of training and outside
the generator templates, but the comparison remains author-coupled and must
not be read as an independent universal ranking. The machine result, exact
model revisions, environment and command are in
[`docs/BENCHMARKS.md`](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md).

### Historical v18 broader comparison

The public Swedish NER alternatives included in this comparison, measured on
the same gold sets
(competitors 2026-07-04, Rampart 2026-07-14, swedish-pii and Desert Ant
redact 2026-07-16, KBLab neriob 2026-07-19, the maskera row 2026-07-19;
overlap matching,
PER / LOC / ORG; full method, all three test sets and honest caveats in
[docs/BENCHMARKS.md](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md),
which wins on any disagreement):

| Model (gold-real, independent text)                | Size    | Typed F1 |
| -------------------------------------------------- | ------- | -------- |
| **maskera-sv-ner**                                  | **~43 MB** | **0.96** |
| KBLab bert-base-swedish-lowermix-reallysimple-ner   | ~475 MB | 0.94     |
| nbailab-base-ner-scandi                             | ~500 MB | 0.94     |
| KBLab bert-base-swedish-cased-neriob                | ~475 MB | 0.94     |
| KB/bert-base-swedish-cased-ner                      | ~475 MB | 0.92     |
| KBLab bert-base-swedish-cased-reallysimple-ner      | ~475 MB | 0.91     |
| RecordedFuture/Swedish-NER                          | ~500 MB | 0.88     |
| Desert Ant redact (multilingual on-device)          | ~13 MB  | 0.53     |
| swedish-pii (regex + name lists, 0.00 on lowercase) | 2.5 MB  | 0.52     |
| Rampart (browser PII, no ORG class, no Swedish)     | ~15 MB  | 0.42     |
| sbx KB-bert PI-detection (general / detailed)       | ~475 MB | 0.10 / 0.19 |

The alternatives run fine on a local machine too; the practical difference is
that at more than 10x the size none of them can ship inside a web app or to thin
clients, which is where maskera puts the redaction: on the device where the
text already is.

On **lowercase text** (no capitalisation cues) the cased-only models collapse
(KB-NER falls to 0.35 typed F1 on lowercased gold-real). maskera-sv-ner's
lowercase strength is the register it targets: on a 294-sentence chat/support
eval of rare decomposing surnames held out of training, it masks 99.3%
(tying the previous release) and now types 78.2% of them correctly as PERSON
(previous release: 71.4%), and on the lowercased 2453-sentence news test
split its leak rate is 14.2% (previous release: 13.8%, the documented churn
in BENCHMARKS.md). On lowercased *encyclopedic* prose (gold-real forced
lowercase, 58 entities) the gap to KBLab's lowermix has nearly closed
(redaction recall 0.95 vs 0.97 for the fp32 student), and the shipped q4
artifact now covers 53 of 58 there, the project's best. None of the
alternatives detects street addresses (`ADR`) or fits in a browser tab; the
one size-class peer (Rampart, 14.7 MB) has no organization class at all and
strips å/ä/ö, and masks 45% on the rare-surname eval.

The maskera row is the fp32 student graded by the same Python harness as the
others (from this release the vocabulary-trimmed student, which is what
actually ships, rather than the more flattering untrimmed one). The sbx
models target a different PI label scheme, so their number reflects scheme
mismatch on PER/LOC/ORG rather than general quality.

## License & attribution

- **This model:** MIT.
- **Base model:** KB-BERT (`KBLab/bert-base-swedish-cased`) is released CC0 by the
  National Library of Sweden (Kungliga biblioteket). No obligations attach, but
  I acknowledge it gratefully; see `NOTICE`.
- **Published v18 task data:** generated Swedish plus the openly licensed
  public corpora listed in the v18 release history.
- **Published v19 task data:** generated locally by the public Maskera
  generator; no third-party text corpus is used. The artifact carries the exact
  provenance hashes above in `privacy-attestation.json`; that file ships
  unchanged with its weights.

## Citation

```bibtex
@software{maskera_sv_ner,
  title  = {maskera-sv-ner: Swedish free-text PII NER},
  author = {Hägvall, Joel},
  url    = {https://huggingface.co/joelhagvall/maskera-sv-ner},
  note   = {MIT; distilled on KB-BERT (CC0)}
}
```
