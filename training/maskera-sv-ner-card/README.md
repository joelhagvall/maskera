---
license: apache-2.0
language:
  - sv
library_name: transformers.js
pipeline_tag: token-classification
base_model: KB/bert-base-swedish-cased
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

It runs **fully in the browser** via [Transformers.js](https://huggingface.co/docs/transformers.js)
/ ONNX Runtime Web: no server, no data leaves the device.

- **Base model:** [KB/bert-base-swedish-cased](https://huggingface.co/KB/bert-base-swedish-cased) (KB-BERT, CC0), 6 transformer layers
- **Task:** token classification (BIO), entity types `PER`, `LOC`, `ORG`, `ADR`
- **Languages:** Swedish
- **License:** Apache-2.0

## Labels

| Tag     | Meaning                       |
| ------- | ----------------------------- |
| `O`     | not an entity                 |
| `PER`   | person name                   |
| `LOC`   | place / location              |
| `ORG`   | organisation / company        |
| `ADR`   | street address                |

Tags are emitted in BIO form (`B-PER`, `I-PER`, …).

## Quantizations

Three ONNX variants are published so you can trade size for quality:

| `dtype`  | file                       | size    | notes                          |
| -------- | -------------------------- | ------- | ------------------------------ |
| `"q4"`   | `onnx/model_q4.onnx`       | ~38 MB  | default, fastest, smallest     |
| `"q8"`   | `onnx/model_quantized.onnx`| ~55 MB  | int8, better quality           |
| `"fp32"` | `onnx/model.onnx`          | ~220 MB | full precision, best quality   |

## Usage

### With maskera (recommended)

```ts
import { createNerRecognizer, redactWithNer } from "@maskera/ner"

const recognizer = createNerRecognizer({
  model: "joelhagvall/maskera-sv-ner",
  dtype: "q4",
})

const { text, restore } = await redactWithNer(
  "Anna Lindqvist på Volvo i Göteborg ringde om fakturan.",
  { recognizer },
)
// text -> "[PERSON_1] på [ORGANIZATION_1] i [LOCATION_1] ringde om fakturan."
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

## Evaluation

Curated maskera corpus (197 free-text PER/LOC/ORG entities across 139
hand-authored sentences, incl. 25 hard negatives and all-lowercase / ALL CAPS /
genitive hard cases), `dtype="q4"`:

| metric    | score | meaning                                  |
| --------- | ----- | ---------------------------------------- |
| recall    | 97.5% | of real entities, how many were found    |
| precision | 95.0% | of predictions, how many were correct    |
| F1        | 96.2% | harmonic mean                            |
| leaks     | 1.0%  | entities missed entirely (the safety number) |

Curated means clean, well-formed sentences, so treat it as an upper bound and
regression tracker, not a universal score.

Independent gold set (real Swedish Wikipedia prose, hand-labelled, held out from
training), `dtype="q4"`:

| metric           | score | meaning                                   |
| ---------------- | ----- | ----------------------------------------- |
| recall           | 95%   | of real entities, how many were found     |
| precision        | 93%   | of predictions, how many were correct     |
| type-aware F1    | 94%   | harmonic mean                             |
| redaction recall | 97%   | of real entities, how many were masked at all |

The model is trained on synthetic Swedish (with whole-sentence lowercase,
ALL CAPS and genitive augmentation, since chat users type lowercase) plus the
real **Swedish NER Corpus** (news) train split, which together lifted this
independent number from 0.85 to 0.94. That
also means the Swedish NER Corpus test split is now in-distribution and is NOT
used as the independent measure. This gold set is small (a couple dozen
sentences); a larger independent gold set is the top data TODO. Harnesses live
in the [maskera repo](https://github.com/joelhagvall/maskera) (`packages/ner/eval`
and `training/`); run them yourself before relying on the numbers.

## License & attribution

- **This model:** Apache-2.0.
- **Base model:** KB-BERT (`KB/bert-base-swedish-cased`) is released CC0 by the
  National Library of Sweden (Kungliga biblioteket). No obligations attach, but
  we acknowledge it gratefully; see `NOTICE`.

## Citation

```bibtex
@software{maskera_sv_ner,
  title  = {maskera-sv-ner: Swedish free-text PII NER},
  author = {Hägvall, Joel},
  url    = {https://huggingface.co/joelhagvall/maskera-sv-ner},
  note   = {Apache-2.0; distilled on KB-BERT (CC0)}
}
```
