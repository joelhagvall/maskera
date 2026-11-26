# maskera

> Swedish-first, client-side PII redaction: mask personal data before text reaches an LLM, restore it in the answer. Text and restore maps never leave your process. [Live demo: maskera.dev](https://maskera.dev) · [GitHub](https://github.com/joelhagvall/maskera)

Two layers, one import. Deterministic rules (`@maskera/core`, re-exported here) handle structured Swedish PII (personnummer, org-nr, IBAN, cards, phone, email), and a 43 MB Swedish ONNX model handles free-text names, places, organisations and street addresses. Everything runs locally via Transformers.js (WebGPU/WASM in the browser, native ONNX in Node).

![The two-layer design: input text forks into layer 1, deterministic format-aware rules for structured PII like personnummer, and layer 2, a 43 MB Swedish AI model that catches free text like names. Rules win on overlap, and the merged result is the masked output. The restore key stays on your device.](https://maskera.dev/layers.svg)

```bash
npm install maskera @huggingface/transformers
```

`@huggingface/transformers` (`^4.0.0`, v4 only) is an optional peer dependency; install [`@maskera/core`](https://www.npmjs.com/package/@maskera/core) alone if you only want zero-dep deterministic rules. *(Yarn 4 PnP also needs `onnxruntime-common@1.24.3`.)*

## Usage

```ts
import { createNerRecognizer, redactWithNer } from "maskera"

// Downloads maskera-sv-ner (~43 MB, q4) once from Hugging Face, then uses cache.
// Create once and reuse across calls.
const recognizer = createNerRecognizer()
await recognizer.ready

const { text, restore } = await redactWithNer(
  "Min granne Provnamn bor i Provbyn, personnummer 19900101-2385.",
  { recognizer },
)
// text -> "Min granne [NAMN_1] bor i [PLATS_1], personnummer [PERSONNUMMER_1]."
restore("Jag har meddelat [NAMN_1].")
// -> "Jag har meddelat Provnamn."
```

`redactWithNer` runs `hybridDefaultDetectors` (core's structured rules plus `adress`, `lagenhetsnummer` and context-labeled account/journal numbers). Rules win on overlap. Add `regnummer` explicitly if licence plates matter:

```ts
import { hybridDefaultDetectors, redactWithNer, regnummer } from "maskera"

await redactWithNer(text, {
  recognizer,
  detectors: [...hybridDefaultDetectors, regnummer],
})
```

### Clinical profile

For clinical text, pass `profile: "clinical"` to retain common measurements, doses and care terms while keeping deterministic identifier rules active:

```ts
await redactWithNer(journalText, { recognizer, profile: "clinical" })
```

### Self-hosting the model

Host the static model files from [`joelhagvall/maskera-sv-ner`](https://huggingface.co/joelhagvall/maskera-sv-ner) under a versioned same-origin path (e.g. `/models/maskera-sv-ner-v20/`) to remove the Hugging Face runtime dependency:

```ts
createNerRecognizer({
  model: "maskera-sv-ner-v20",
  localModelPath: "/models/",
  allowLocalModels: true,
  allowRemoteModels: false,
})
```

### Node & raw detections

In Node, `device` defaults to `"cpu"` (native ONNX; single-digit ms per sentence when warm; `dtype: "q8"` is also available). Call `recognizer.detect(text)` if you only want `Detection[]` spans without redaction.

## Options

### `redactWithNer(input, options)`

| Option | Default | Purpose |
| --- | --- | --- |
| `recognizer` | required | Reusable recognizer from `createNerRecognizer()` |
| `profile` | `"general"` | Set `"clinical"` to keep measurements, doses and care terms |
| `detectors` | `hybridDefaultDetectors` | Override the deterministic rule set |
| `placeholder` | `[LABEL_N]` | Customize placeholder format |
| `detectionFilter` | none | Custom filter composed with `profile` |

### `createNerRecognizer(options)`

| Option | Default | Purpose |
| --- | --- | --- |
| `model` | `MASKERA_SV_NER_MODEL` | HF token-classification model id (developer-only) |
| `revision` | `MASKERA_SV_NER_REVISION` | Pinned HF commit SHA for reproducibility; `"main"` tracks latest |
| `dtype` | `"q4"` | `"q4"` (~43 MB, default), `"q8"` (~59 MB) or `"fp32"` (~233 MB) |
| `device` | `"auto"` / `"cpu"` | `"auto"` in browser (WebGPU/WASM), `"cpu"` in Node |
| `minScore` | `0.5` | Confidence threshold (raise e.g. to `0.7` for higher precision) |
| `labelMap` | `defaultLabelMap` | Map raw BIO groups (`PER`, `LOC`, `ORG`, `ADR`) to placeholders or `null` |
| `onProgress` | none | Download progress callback (`status === "progress_total"` for 0-100) |
| `cacheDir` | runtime default | User-private cache path (mainly Node) |
| `verifyModelIntegrity` | `true` | SHA-256 checks pinned Hub files on load (Node only) |

For hardening, CSP headers, self-hosting caveats and custom `labelMap` composition, see [`docs/PRODUCTION.md`](https://github.com/joelhagvall/maskera/blob/main/docs/PRODUCTION.md).

## The model & benchmarks

Default model: [`maskera-sv-ner`](https://huggingface.co/joelhagvall/maskera-sv-ner) (MIT, 43 MB q4, `PER`/`LOC`/`ORG`/`ADR`), distilled from a 3-seed KB-BERT ensemble on 108,400 attested synthetic rows + 6,900 validation rows.

**Published v20 measurements (2026-11-25, q4):**

- **Curated set:** 99.5% span F1, 0/205 leaks.
- **Revised synthetic ADR:** 100.0% label-agnostic span F1, 0/57 leaks (35/35 ADDRESS precision, 98.2% labeled F1).
- **LinkedIn-style set:** 98.1% span F1, 0/53 leaks.
- **Full Swedish hybrid pipeline (258 domain texts, 952 PII):** 943/952 (99.1%) full hits (3 partial leaks, 6 clear-text misses).
- **vs KBLab lowermix fp32 (496 MB, 121 texts, 211 PER/LOC/ORG):** Maskera masked 211/211 both with original casing and lowercased; KBLab masked 205/211 and 187/211 (typed F1: 88.2% vs 89.4% original, 87.4% vs 83.2% lowercased).
- **vs Bards AI EU PII v3 int8 ONNX (309 MB, same 121 texts):** Bards AI masked 181/211 (85.8%) original and 119/211 (56.4%) lowercased (typed F1: 74.6% original, 62.1% lowercased).

These v20 tests are synthetic or author-coupled directional evidence, not an independent universal ranking. Historical v18 comparisons (99.8% curated span-F1, 94.7% independent real text, measured 2026-07-19) and reproduction commands live in [`docs/BENCHMARKS.md`](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md). Training-data attestation: [`docs/TRAINING_DATA_PROTECTION.md`](https://github.com/joelhagvall/maskera/blob/main/docs/TRAINING_DATA_PROTECTION.md).

## Limitations

- **Defense in depth, not a compliance guarantee.** The rule layer is deterministic; the model catches most free-text PII but can miss edge cases.
- **Swedish-first:** behaviour on other languages is undefined.

For DPOs, security teams and legal reviewers: [maskera.dev/whitepaper.pdf](https://maskera.dev/whitepaper.pdf).

## License

Code: MIT. Default model weights: MIT (base model KB-BERT is CC0). See [`NOTICE`](./NOTICE).
