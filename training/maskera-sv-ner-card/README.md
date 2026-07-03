---
license: mit
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
through `@maskera/ner`, the raw tags map to the placeholder names you see in
redacted output: `PER` → `PERSON`, `LOC` → `LOCATION`, `ORG` → `ORGANIZATION`,
`ADR` → `ADDRESS` (e.g. `[PERSON_1]`).

Note: the benchmark sets below cover PER / LOC / ORG only, neither contains
street addresses, so `ADR` accuracy is **not** independently measured. Historical
per-type numbers from training are in the
[training notes](https://github.com/joelhagvall/maskera/tree/main/training).

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

The canonical, dated benchmark tables live in the maskera repo:
[`docs/BENCHMARKS.md`](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md).
Numbers below are copied from there (measured 2026-07-03, `dtype="q4"`,
**exact-span matching**, via the shipped `@maskera/ner` pipeline); when they
disagree, BENCHMARKS.md wins.

Curated maskera corpus (139 hand-authored sentences, 197 free-text PER/LOC/ORG
entities, incl. 25 hard negatives and all-lowercase / ALL CAPS / genitive hard
cases). Clean, well-formed sentences that share an author with the training
generator, so treat it as an upper bound and regression tracker:

| metric    | score | meaning                                  |
| --------- | ----- | ---------------------------------------- |
| precision | 95.0% | of predictions, how many were correct    |
| recall    | 97.5% | of real entities, how many were found    |
| span F1   | 96.2% | harmonic mean, label-agnostic            |
| leaks     | 1.0%  | entities missed entirely (the safety number) |

Independent gold set (22 sentences of real Swedish Wikipedia prose,
hand-labelled, held out from all training data). Small, so read it as a
directional independent floor:

| metric    | score | meaning                                  |
| --------- | ----- | ---------------------------------------- |
| precision | 89.8% | of predictions, how many were correct    |
| recall    | 91.4% | of real entities, how many were found    |
| span F1   | 90.6% | harmonic mean, label-agnostic            |
| leaks     | 3.4%  | entities missed entirely                 |

The model is trained on synthetic Swedish (with whole-sentence lowercase,
ALL CAPS and genitive augmentation, since chat users type lowercase) plus the
real **Swedish NER Corpus** (news) train split, which lifted the independent
numbers substantially. That also means the Swedish NER Corpus test split is
in-distribution and is NOT used as the independent measure. A larger
independent gold set is the top data TODO. Harnesses live in the
[maskera repo](https://github.com/joelhagvall/maskera) (`packages/ner/eval`
and `training/`); run them yourself before relying on the numbers.

## License & attribution

- **This model:** MIT.
- **Base model:** KB-BERT (`KB/bert-base-swedish-cased`) is released CC0 by the
  National Library of Sweden (Kungliga biblioteket). No obligations attach, but
  we acknowledge it gratefully; see `NOTICE`.

## Citation

```bibtex
@software{maskera_sv_ner,
  title  = {maskera-sv-ner: Swedish free-text PII NER},
  author = {Hägvall, Joel},
  url    = {https://huggingface.co/joelhagvall/maskera-sv-ner},
  note   = {MIT; distilled on KB-BERT (CC0)}
}
```
