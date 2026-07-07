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

All inference happens **on the device where the text is**, via
[Transformers.js](https://huggingface.co/docs/transformers.js) / ONNX Runtime
(browser, Node, Electron): nothing is sent to any server. At ~40 MB it is
small enough to run **directly in a browser tab**, which is exactly how the
maskera demo ships: try it live at [maskera.dev](https://maskera.dev).

Benchmarked against the public Swedish NER alternatives (KB-NER,
RecordedFuture, KBLab reallysimple/lowermix, scandi-ner, the sbx PI-detection
pair), it has the **best typed F1 on independent Swedish text of all models
tested, at under a tenth of their size**; see [How it compares](#how-it-compares).

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
through `maskera`, the raw tags map to the placeholder names you see in
redacted output: `PER` → `PERSON`, `LOC` → `LOCATION`, `ORG` → `ORGANIZATION`,
`ADR` → `ADDRESS` (e.g. `[PERSON_1]`).

Note: the PER / LOC / ORG benchmark sets below contain no street addresses, so
`ADR` is measured on its own set (27 sentences, 21 address spans, held out of
training). Measured 2026-07-07 on the shipped q4 artifact: **redaction recall
100%** (every address masked), **0% leaks**, ADDRESS precision 95.5%. The one
weakness is span boundary — on 17 of 21 the model tags the street name but drops
the house number (`Sveavägen` not `Sveavägen 44`), a partial exposure rather
than a leak. Full breakdown:
[BENCHMARKS.md → Address (ADR) eval](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md#address-adr-eval-the-one-class-the-other-sets-miss).

## Quantizations

Three ONNX variants are published so you can trade size for quality:

| `dtype`  | file                       | size    | notes                          |
| -------- | -------------------------- | ------- | ------------------------------ |
| `"q4"`   | `onnx/model_q4.onnx`       | ~40 MB  | default, fastest, smallest     |
| `"q8"`   | `onnx/model_quantized.onnx`| ~55 MB  | int8, better quality           |
| `"fp32"` | `onnx/model.onnx`          | ~220 MB | full precision, best quality   |

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
- For DPOs, security teams and legal reviewers assessing the full system:
  the maskera whitepaper covers architecture, privacy model, training data
  and GDPR positioning: [maskera.dev/whitepaper.pdf](https://maskera.dev/whitepaper.pdf).

## Evaluation

The canonical, dated benchmark tables live in the maskera repo:
[`docs/BENCHMARKS.md`](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md).
Numbers below are copied from there (measured 2026-07-04, `dtype="q4"`,
**exact-span matching**, via the shipped `maskera` pipeline); when they
disagree, BENCHMARKS.md wins.

Curated maskera corpus (148 hand-authored sentences, 204 free-text PER/LOC/ORG
entities, incl. hard negatives and all-lowercase / ALL CAPS / genitive hard
cases, two of which the model is known to miss, graded honestly). Clean,
well-formed sentences that share an author with the training generator, so
treat it as an upper bound and regression tracker:

| metric    | score | meaning                                  |
| --------- | ----- | ---------------------------------------- |
| precision | 95.2% | of predictions, how many were correct    |
| recall    | 97.5% | of real entities, how many were found    |
| span F1   | 96.4% | harmonic mean, label-agnostic            |
| leaks     | 1.0%  | entities missed entirely (the safety number) |

Independent gold set (22 sentences of real Swedish Wikipedia prose,
hand-labelled, held out from all training data). Small, so read it as a
directional independent floor:

| metric    | score | meaning                                  |
| --------- | ----- | ---------------------------------------- |
| precision | 90.0% | of predictions, how many were correct    |
| recall    | 93.1% | of real entities, how many were found    |
| span F1   | 91.5% | harmonic mean, label-agnostic            |
| leaks     | 1.7%  | entities missed entirely                 |

The model is trained on synthetic Swedish (with whole-sentence lowercase,
ALL CAPS and genitive augmentation, since chat users type lowercase) plus the
real **Swedish NER Corpus** (news) train split, which lifted the independent
numbers substantially. That also means the Swedish NER Corpus test split is
in-distribution and is NOT used as the independent measure. A larger
independent gold set is the top data TODO. Harnesses live in the
[maskera repo](https://github.com/joelhagvall/maskera) (`packages/ner/eval`
and `training/`); run them yourself before relying on the numbers.

## How it compares

Every public Swedish NER alternative, measured on the same gold sets
(2026-07-04, overlap matching, PER / LOC / ORG; full method, all three test
sets and honest caveats in
[docs/BENCHMARKS.md](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md),
which wins on any disagreement):

| Model (gold-real, independent text)                | Size    | Typed F1 |
| -------------------------------------------------- | ------- | -------- |
| **maskera-sv-ner**                                  | **~40 MB** | **0.96** |
| KBLab bert-base-swedish-lowermix-reallysimple-ner   | ~475 MB | 0.94     |
| nbailab-base-ner-scandi                             | ~500 MB | 0.94     |
| KB/bert-base-swedish-cased-ner                      | ~475 MB | 0.92     |
| KBLab bert-base-swedish-cased-reallysimple-ner      | ~475 MB | 0.91     |
| RecordedFuture/Swedish-NER                          | ~500 MB | 0.88     |
| sbx KB-bert PI-detection (general / detailed)       | ~475 MB | 0.10 / 0.19 |

The alternatives run fine on a local machine too; the practical difference is
that at 10x the size none of them can ship inside a web app or to thin
clients, which is where maskera puts the redaction: on the device where the
text already is.

On **lowercased chat-style text** (no capitalisation cues) the cased-only
models collapse (KB-NER falls to 0.35); maskera-sv-ner holds 0.86 thanks to
its casing augmentation, second only to KBLab's lowermix (0.90), which is
trained on mixed-case text specifically. None of the alternatives detects
street addresses (`ADR`) or fits in a browser tab.

The maskera row is the fp32 student graded by the same Python harness as the
others; the shipped q4 artifact costs roughly 0.01 overlap F1 on top. The sbx
models target a different PI label scheme, so their number reflects scheme
mismatch on PER/LOC/ORG rather than general quality.

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
