---
language: sv
license: mit
library_name: transformers
pipeline_tag: token-classification
base_model: KBLab/bert-base-swedish-cased
tags:
  - pii
  - ner
  - swedish
  - privacy
  - gdpr
  - redaction
  - onnx
  - transformers.js
---

# maskera-sv-ner — Swedish PII NER (free-text entities)

A small, browser-deployable Swedish named-entity model for **PII redaction**,
trained for [maskera](https://github.com/joelhagvall/maskera). It detects the
**free-text** entities a rule layer can't catch — people, places, organisations
and street addresses — so structured PII (personnummer, org-nr, phone, IBAN…)
stays with deterministic regex+checksum rules.

- **Labels:** `PER` (person), `LOC` (place), `ORG` (organisation), `ADR` (street address)
- **Base:** `KBLab/bert-base-swedish-cased`, distilled to ~22M params (6 layers)
- **Size:** ~40 MB ONNX — vocab-trimmed (16k) + q4 matmul / int8 embed (`onnx/model_q4.onnx`, load with `dtype: "q4"`). Runs client-side via Transformers.js
- **Scripts:** WASM / WebGPU

## Intended use

Client-side redaction of Swedish text **before** it reaches an LLM, a log, or
analytics. Pair it with a deterministic rule layer for structured identifiers —
the model is intentionally *not* trained on personnummer/org-nr/phone, because a
regex+checksum is strictly more reliable there.

## Usage

### Transformers.js (browser / Node)

```js
import { pipeline } from "@huggingface/transformers"
const ner = await pipeline("token-classification", "joelhagvall/maskera-sv-ner", {
  dtype: "q8", // -> onnx/model_quantized.onnx
})
await ner("Min granne Lars Nordström bor på Kungsholmen och jobbar på Spotify.")
// PER "Lars Nordström", LOC "Kungsholmen", ORG "Spotify"
```

### Via @maskera/ner (recommended — adds the rule layer + restore map)

```ts
import { createNerRecognizer, redactWithNer } from "@maskera/ner"
import { defaultDetectors } from "@maskera/core"

const recognizer = createNerRecognizer({ model: "joelhagvall/maskera-sv-ner", dtype: "q8" })
const { text } = await redactWithNer(input, { recognizer, detectors: defaultDetectors })
```

## Training

- **Data:** synthetic, template-generated Swedish sentences with BIO labels
  (no real personal data — GDPR-safe). See `training/generate_data.mjs`.
- **Teacher:** KB-BERT fine-tuned on the synthetic data.
- **Student:** 6-layer BERT initialised from the teacher (embeddings + every
  other layer, DistilBERT-style) and distilled (logit KL + hard-label CE).
- **Export:** ONNX + dynamic int8 quantization.

## Benchmark

Span-level, type-aware F1 (overlap), vs Rampart:

| Eval set                        | teacher | **student** | Rampart |
| ------------------------------- | ------- | ----------- | ------- |
| hand-authored (121 sents)       | 0.899   | **0.874**   | 0.621   |
| WikiANN sv (independent, 500)   | 0.668   | **0.696**   | 0.392   |

The student beats Rampart on Swedish by a wide margin; Rampart scores 0.00 on
ORG. See the [maskera training README](https://github.com/joelhagvall/maskera/tree/main/training).

## Limitations

- Trained on **synthetic** data; the hand-authored eval shares an author with the
  generator. Treat scores as directional. Absolute quality drops on out-of-domain
  encyclopedic text (WikiANN), as expected.
- Covers PER/LOC/ORG/ADR only — **not** structured PII (use rules for those).
- No model is perfect; use as defense in depth, not a guarantee.

## License & attribution

**MIT.** This is a derivative of **`KBLab/bert-base-swedish-cased`** (KBLab /
National Library of Sweden), which is released under **CC0-1.0** (public domain)
— so commercial use, redistribution and relicensing of the derived weights are
all permitted with no obligation. We license our derivative as MIT to match the
SDK. Synthetic training data contains no real personal data.

As a courtesy (not required under CC0), we credit KBLab / the National Library of
Sweden and cite their paper:

```bibtex
@misc{malmsten2020playing,
  title={Playing with Words at the National Library of Sweden -- Making a Swedish BERT},
  author={Martin Malmsten and Love Börjeson and Chris Haffenden},
  year={2020}, eprint={2007.01658}, archivePrefix={arXiv}, primaryClass={cs.CL}
}
```
