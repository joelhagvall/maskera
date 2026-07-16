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
  - text: "Jag heter Anna Lindqvist och jobbar på Volvo i Göteborg."
---

# maskera-sv-ner

A small Swedish token-classification model that finds **free-text PII**
(people, places and organisations) so it can be redacted before text is sent to
an LLM. It is the optional model layer of [**maskera**](https://github.com/joelhagvall/maskera),
a Swedish-first, client-side PII redaction toolkit. The deterministic stuff
(personnummer, organisationsnummer, IBAN, phone, e-mail…) is handled by
maskera's rule layer; this model only fills the gaps rules can't: names and
places in running text.

All inference happens **on the device where the text is**, via
[Transformers.js](https://huggingface.co/docs/transformers.js) / ONNX Runtime
(browser, Node, Electron): nothing is sent to any server. At ~43 MB it is
small enough to run **directly in a browser tab**, which is exactly how the
maskera demo ships: try it live at [maskera.dev](https://maskera.dev).

Benchmarked against the public Swedish NER alternatives (KB-NER,
RecordedFuture, KBLab reallysimple/lowermix, scandi-ner, the sbx PI-detection
pair), it **holds the best typed F1 on independent Swedish text at under a
tenth of their size** (0.97 vs 0.94 for the closest full-size model); on
lowercase text its strength is the chat/support register it targets, while
KBLab's lowermix still leads on lowercased encyclopedic prose; see
[How it compares](#how-it-compares).

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
`ADR` is measured on its own set (27 sentences, 21 address spans, held out of
training). Measured 2026-07-16 on the shipped q4 artifact: **redaction recall
100%**, **0% leaks**, **ADDRESS precision 100%**, **exact-span recall 100%**,
house numbers included (`Sveavägen 44`, not just `Sveavägen`). One documented
over-redaction on this corpus's distractor set (the ordinary word "Festen"
tagged PERSON; nothing leaks). Full breakdown:
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
  "Anna Lindqvist på Volvo i Göteborg ringde om fakturan.",
  { recognizer },
)
// text -> "[NAMN_1] på [ORGANISATION_1] i [PLATS_1] ringde om fakturan."
```

### With Transformers.js directly

```ts
import { pipeline } from "@huggingface/transformers"

const ner = await pipeline("token-classification", "joelhagvall/maskera-sv-ner", {
  dtype: "q4",
})
const out = await ner("Anna Lindqvist bor i Göteborg.")
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
Numbers below are copied from there (measured 2026-07-16, `dtype="q4"`,
**exact-span matching**, via the shipped `maskera` pipeline); when they
disagree, BENCHMARKS.md wins.

Curated maskera corpus (148 hand-authored sentences, 204 free-text PER/LOC/ORG
entities, incl. hard negatives and all-lowercase / ALL CAPS / genitive hard
cases, graded honestly). Clean, well-formed sentences that share an author
with the training generator, so treat it as an upper bound and regression
tracker. First release with zero leaks on this set (the sentence-initial
"Klarna" classic is fixed):

| metric    | score | meaning                                  |
| --------- | ----- | ---------------------------------------- |
| precision | 99.5% | of predictions, how many were correct    |
| recall    | 100.0% | of real entities, how many were found   |
| span F1   | 99.8% | harmonic mean, label-agnostic            |
| leaks     | 0.0%  | entities missed entirely (the safety number) |

Independent gold set (22 sentences of real Swedish Wikipedia prose,
hand-labelled, held out from all training data). Small, so read it as a
directional independent floor:

| metric    | score | meaning                                  |
| --------- | ----- | ---------------------------------------- |
| precision | 94.7% | of predictions, how many were correct    |
| recall    | 93.1% | of real entities, how many were found    |
| span F1   | 93.9% | harmonic mean, label-agnostic            |
| leaks     | 1.7%  | entities missed entirely, 1 of 58        |

The model is trained on synthetic Swedish (with whole-sentence lowercase,
ALL CAPS and genitive augmentation, since chat users type lowercase; the
current round also trains the student on the trimmed inference vocabulary's
subword decompositions, so rare surnames like "tjulander" stay caught in the
chat register) plus five public, openly licensed real corpora (all
CC BY 4.0): the
[**Swedish NER Corpus**](https://github.com/klintan/swedish-ner-corpus)
(news) train split, a weighted sample of
[**SUCX 3.0 NER**](https://huggingface.co/datasets/KBLab/sucx3_ner)
(KBLab, balanced genres, the data behind KBLab's case-robust lowermix
recipe),
[**MASSIVE sv-SE**](https://huggingface.co/datasets/AmazonScience/massive)
(Amazon, lowercase chat-register utterances),
[**SIC2**](https://spraakbanken.gu.se/resurser/sic2) (Språkbanken, informal
blog text) and a class-audited sample of
[**MultiCoNER v2 sv**](https://huggingface.co/datasets/MultiCoNER/multiconer_v2)
(SemEval-2023, lowercase wiki sentences); from the v14 round also a
register-targeted, ensemble pseudo-labeled sample of
**Flashback / Familjeliv** forum text
([Språkbanken](https://spraakbanken.gu.se/resurser); pseudo-labels amplify
the informal register, every published number is still measured on
human-labeled sets). The v15 round adds a synthetic balanced
class-replay dose (sentence-initial bare-surname declaratives paired with
LOC / ORG / ADR positives and capitalised common-word negatives), which fixed
the bare-lowercase-surname declarative gap and the "Klarna" miss. That also means the Swedish NER Corpus
test split is in-distribution and is NOT used as the independent measure. A
larger independent gold set is the top data TODO. Harnesses live in the
[maskera repo](https://github.com/joelhagvall/maskera) (`packages/ner/eval`
and `training/`); run them yourself before relying on the numbers.

## How it compares

Every public Swedish NER alternative, measured on the same gold sets
(competitors 2026-07-04, Rampart 2026-07-14, swedish-pii and Desert Ant
redact 2026-07-16, the maskera row 2026-07-16;
overlap matching,
PER / LOC / ORG; full method, all three test sets and honest caveats in
[docs/BENCHMARKS.md](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md),
which wins on any disagreement):

| Model (gold-real, independent text)                | Size    | Typed F1 |
| -------------------------------------------------- | ------- | -------- |
| **maskera-sv-ner**                                  | **~43 MB** | **0.97** |
| KBLab bert-base-swedish-lowermix-reallysimple-ner   | ~475 MB | 0.94     |
| nbailab-base-ner-scandi                             | ~500 MB | 0.94     |
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
(previous release: 98.3% on the same rotated frames), and on the lowercased
2453-sentence news test split its leak rate is 13.8% (previous release:
15.2%). On lowercased *encyclopedic* prose (gold-real forced lowercase, 58
entities) KBLab's lowermix still leads on raw redaction recall (0.97 vs 0.90
for the fp32 student), but the shipped q4 artifact now covers 51 of 58
there, back at the project's best level (the previous release covered 50 and
carried this as its documented gap). None of the
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
  we acknowledge it gratefully; see `NOTICE`.
- **Training data:** includes the Swedish NER Corpus, SUCX 3.0 NER
  (KBLab/Språkbanken Text), MASSIVE sv-SE (Amazon Science), SIC2, MultiCoNER
  v2 sv and pseudo-labeled Flashback/Familjeliv forum text (Språkbanken
  Text), all CC BY 4.0; full attributions in `NOTICE`.

## Citation

```bibtex
@software{maskera_sv_ner,
  title  = {maskera-sv-ner: Swedish free-text PII NER},
  author = {Hägvall, Joel},
  url    = {https://huggingface.co/joelhagvall/maskera-sv-ner},
  note   = {MIT; distilled on KB-BERT (CC0)}
}
```
