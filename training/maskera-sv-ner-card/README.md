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

A 43 MB Swedish token-classification model (ONNX) that detects **free-text PII** (names, places, organisations and street addresses) directly on-device via [Transformers.js](https://huggingface.co/docs/transformers.js) in the browser (WebGPU/WASM) or Node.js. It powers the NER layer of [**maskera**](https://github.com/joelhagvall/maskera), paired with deterministic rules for structured Swedish identifiers (personnummer, IBAN, phone, email). Try it live at [maskera.dev](https://maskera.dev).

![Where this model fits: input text forks into layer 1, maskera's deterministic format-aware rules for structured PII like personnummer, and layer 2, this model, catching free text like names. Rules win on overlap, and the merged result is the masked output.](https://maskera.dev/layers.svg)

- **Release:** attested privacy-clean **v22** (published 2026-11-28)
- **Base model:** [KBLab/bert-base-swedish-cased](https://huggingface.co/KBLab/bert-base-swedish-cased) (KB-BERT, CC0), distilled to 8 layers with rank-256 factorised FFN and a 24k Swedish WordPiece vocabulary
- **Task:** BIO token classification (`PER`, `LOC`, `ORG`, `ADR`), lowercase- and ALL CAPS-robust
- **License:** MIT

## Labels & Quantizations

| Tag | Meaning | `maskera` placeholder |
| --- | --- | --- |
| `O` | not an entity | n/a |
| `PER` | person name | `[NAMN_1]` |
| `LOC` | place / location | `[PLATS_1]` |
| `ORG` | organisation / company | `[ORGANISATION_1]` |
| `ADR` | street address | `[ADRESS_1]` |

| `dtype` | File | Size | Notes |
| --- | --- | ---: | --- |
| `"q4"` | `onnx/model_q4.onnx` | ~43 MB | default, fastest, smallest |
| `"q8"` | `onnx/model_quantized.onnx` | ~65 MB | int8 |
| `"fp32"` | `onnx/model.onnx` | ~254 MB | full precision |

## Usage

### With `maskera` (recommended: rules + NER)

```ts
import { createNerRecognizer, redactWithNer } from "maskera"

const recognizer = createNerRecognizer({ dtype: "q4" })
const { text, restore } = await redactWithNer(
  "Provnamn Maskera på Fiktivbolaget i Provbyn ringde om fakturan.",
  { recognizer },
)
// "[NAMN_1] på [ORGANISATION_1] i [PLATS_1] ringde om fakturan."
```

For clinical text, pass `profile: "clinical"` to retain common measurements, medication doses and care terms while keeping all deterministic identifier rules active.

### With Transformers.js directly

```ts
import { pipeline } from "@huggingface/transformers"

const ner = await pipeline("token-classification", "joelhagvall/maskera-sv-ner", {
  dtype: "q4",
})
const out = await ner("Provnamn Maskera bor i Provbyn.")
```

## Evaluation: Published privacy-clean v22

Measured 2026-11-28 on the published `q4` artifact (`~43 MB`). Full tables, scripts and caveats live in [`docs/BENCHMARKS.md`](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md), which is the canonical source if any figure differs.

### Independent Swedish benchmark (23,980 texts, 0 rows in Maskera's training)

Pooled across SUC 3.0 test, SIC2 Swedish blogs, MultiCoNER v2 Swedish test and ai4privacy openpii Swedish validation (`bench/independent/score.mjs`):

- **Names:** **95.3%** (11,974/12,570)
- **Lowercase names:** **91.1%** (4,401/4,829)
- **Places:** **96.2%** (5,530/5,749)
- **Street addresses + postcodes:** **95.7%** (5,249/5,482)
- **Entity-free sentences with a hit (SUC + SIC2):** **5.6%** (608/10,800; down 54.5% from 12.3% in v21)

### Release gates (synthetic Swedish sets)

| Dataset | Span F1 | Leaks | Notes |
| --- | ---: | ---: | --- |
| Curated (149 docs / 205 entities) | **99.3%** | **1/205** | Exact span, incl. lowercase & ALL CAPS; 99.3% labeled F1 |
| Revised synthetic ADR (41 docs / 57 entities) | **100.0%** | **0/57** | 35/35 ADDRESS precision; 100.0% labeled F1 |
| LinkedIn-style (32 docs / 53 entities) | **95.3%** | **0/53** | Exact span; 95.3% labeled F1 |
| Rare decomposing surnames (294 entities) | n/a | **2/294** | **99.32%** masked recall (292/294) |

### Current v22 vs other models supporting Swedish

Overlap matching on 121 hand-authored synthetic Swedish texts (211 `PER`/`LOC`/`ORG` entities, no addresses or product post-processing). Maskera `q4` (43 MB) vs [`KBLab/bert-base-swedish-lowermix-reallysimple-ner`](https://huggingface.co/KBLab/bert-base-swedish-lowermix-reallysimple-ner) `fp32` (496 MB, rev `007c6b26e6418574c494791f036d5dfa34a558da`, measured 2026-11-28).

| Casing | Model | Masked at all | Typed F1 |
| --- | --- | ---: | ---: |
| original | **maskera-sv-ner v22 q4** | **100.0% (211/211)** | 91.6% |
| original | KBLab lowermix fp32 | 97.2% (205/211) | 89.4% |
| lowercase | **maskera-sv-ner v22 q4** | **100.0% (211/211)** | **89.9%** |
| lowercase | KBLab lowermix fp32 | 88.6% (187/211) | 83.2% |

*Caveats:* The release-gate and KBLab datasets above are synthetic and author-coupled, so treat them as directional regression evidence rather than an independent universal ranking. Only models with explicit Swedish support are compared here. Historical v18 comparison metrics (from 2026-07-19 on independent Wikipedia prose) are kept separately in [`docs/BENCHMARKS.md`](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md) and do not transfer to v22.

## Training data & provenance

v22 task fine-tuning and distillation uses 176,600 generated training rows and 12,440 disjoint validation rows from `training/generate_data.mjs` (combining multi-sentence paragraphs up to 256 tokens, structured form rows, Swedish precision/homograph contrasts, and an audited synthetic Swedish prose template pool), distilled from a 3-seed KB-BERT teacher ensemble into an 8-layer rank-256 student with a 24k WordPiece vocabulary. No customer data, logs, scraped text or public NER corpora are used. Every row is rejected if it contains an IBAN, personal/org number, phone, email, URL, IP, payment ID, long account number or postal code, and every street address carries an explicit synthetic marker.

Exact v22 provenance (recorded in `privacy-attestation.json` beside the weights):

- Generator SHA-256: `f6ae657f9eade2e38ef4cc8a64d551b7bb20a4f86e5960057efb77a12d433b56`
- Synthetic prose pool SHA-256: `4d49241efb2c0848d04c1c1b637257b541613924c800c27d0701da2db0a6a9b5`
- Train SHA-256: `934e2b432b7e6d278a72d0aed9a38c262dbcd49d591c27c6eb4569625f52f83b`
- Validation SHA-256: `31631e78389d33677cc7fedc62df82cb993aec4703195a094bc021ad383ff1e8`
- KB-BERT revision: `ce7c3424687f042f1320e0528293d492c82918c4`

This attestation covers Maskera's task-specific processing; it does not claim that KB-BERT was originally pretrained on synthetic-only data. Full scope and verification commands: [TRAINING_DATA_PROTECTION.md](https://github.com/joelhagvall/maskera/blob/main/docs/TRAINING_DATA_PROTECTION.md).

## Intended use & limitations

- **Intended use:** redacting free-text Swedish names, places, organisations and street addresses before an LLM call, paired with `maskera`'s deterministic rule layer.
- **Not a compliance guarantee:** the model can miss and over-flag entities. Treat it as a risk-reduction layer and keep human review where errors carry high impact.
- **Swedish-first:** behaviour on other languages is undefined; structured IDs belong to the rule layer.
- **Whitepaper for DPOs & security teams:** [maskera.dev/whitepaper.pdf](https://maskera.dev/whitepaper.pdf).

## License & citation

MIT (base model KB-BERT is CC0, National Library of Sweden; see `NOTICE`).

```bibtex
@software{maskera_sv_ner,
  title  = {maskera-sv-ner: Swedish free-text PII NER},
  author = {Hägvall, Joel},
  url    = {https://huggingface.co/joelhagvall/maskera-sv-ner},
  note   = {MIT; distilled on KB-BERT (CC0)}
}
```
