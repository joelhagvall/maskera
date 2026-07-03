# @maskera/ner

> ONNX + Transformers.js NER layer for
> [maskera](https://github.com/joelhagvall/maskera). Ships with maskera's own
> Swedish model as the default.

The rule layer in `@maskera/core` nails *structured* PII (personnummer, org-nr,
phone, ...). This package adds the part regex can't do: **free-text names,
places, organisations and street addresses** ("min granne Lars på våning 4"),
using a small token-classification model that runs **client-side** via
Transformers.js (WASM/WebGPU in the browser, native ONNX in Node).

It's a separate package on purpose, so `@maskera/core` stays zero-dependency.
The ML runtime is an **optional peer dependency** you install only if you use
this.

```bash
npm install @maskera/ner @huggingface/transformers
```

## Usage

```ts
import { createNerRecognizer, redactWithNer } from "@maskera/ner"

// Downloads maskera-sv-ner (~40 MB, q4) from the Hugging Face Hub on first
// use, then serves it from cache.
const recognizer = createNerRecognizer()
await recognizer.ready

// Hybrid: rule detectors + NER, merged through core's placeholder engine.
// Rules win on overlap: structured PII is deterministic and authoritative.
const result = await redactWithNer(
  "Min granne Lars bor på Kungsholmen, personnummer 19900101-0017.",
  { recognizer },
)
result.text
// "Min granne [PERSON_1] bor på [LOCATION_1], personnummer [PERSONNUMMER_1]."
result.restore("Jag har meddelat [PERSON_1].")
// "Jag har meddelat Lars."
```

Create the recognizer **once** and reuse it: the model loads lazily on first
use (or when you await `ready`), and each `detect`/`redactWithNer` call after
that is a few milliseconds of inference.

### Options

```ts
createNerRecognizer({
  model: MASKERA_SV_NER_MODEL, // default; any HF token-classification model id works
  dtype: "q4",                 // "q4" (40 MB, default) | "q8" (53 MB) | "fp32" (211 MB)
  device: "auto",              // "wasm" | "webgpu" | "cpu" | "auto"
  minScore: 0.5,               // drop predictions below this confidence
  labelMap: (group) => group,  // remap or drop entity groups (return null to drop)
  onProgress: (p) => {},       // model download progress for a loading UI
})
```

- **`dtype`**: `"q4"` is what the maskera demo ships and what the eval gates
  run against. `"q8"` is slightly more accurate on some inputs; `"fp32"` is
  for benchmarking, not the browser.
- **`device`**: `"auto"` picks WebGPU when available, else WASM. In Node,
  Transformers.js uses native ONNX on CPU; `"cpu"` is the explicit choice.
- **`minScore`**: raise it (e.g. `0.7`) to trade recall for precision. For a
  privacy tool the default errs toward recall: a false positive over-masks,
  a false negative leaks.

### Self-hosting the model

Don't want a runtime dependency on the Hugging Face Hub? Host the model files
yourself (they're static files) and point the recognizer at them:

```ts
createNerRecognizer({
  model: "maskera-sv-ner",
  localModelPath: "/models/",   // your own origin or internal CDN
  allowLocalModels: true,
  allowRemoteModels: false,     // never touch the Hub
})
```

Copy the files from the
[Hub repo](https://huggingface.co/joelhagvall/maskera-sv-ner) (config,
tokenizer, `onnx/model_q4.onnx`) into `public/models/maskera-sv-ner/`. This is
exactly how the maskera demo runs, fully offline after first load.

### Node

Same API. `@huggingface/transformers` runs native ONNX on CPU; a warm
recognizer redacts a sentence in single-digit milliseconds:

```ts
const recognizer = createNerRecognizer({ device: "cpu", dtype: "q8" })
await recognizer.ready
const { text } = await redactWithNer(userInput, { recognizer })
```

### Raw detections

`recognizer.detect(text)` returns maskera `Detection[]` (`{ start, end,
value, label }`) if you want the entities without redaction, e.g. for
highlighting.

## The model

The default (and only bundled default) model is
[maskera-sv-ner](https://huggingface.co/joelhagvall/maskera-sv-ner)
(`MASKERA_SV_NER_MODEL`, MIT, 40 MB q4): PER/LOC/ORG/ADR, distilled from
KB-BERT, trained on synthetic + real Swedish with lowercase/ALL CAPS/genitive
augmentation (chat users type lowercase). On the packaged gold corpus it
scores 96% span-F1 with a 1% leak rate; on independent real text, 0.94
type-aware F1 and 0.97 redaction recall. Run the eval yourself:

```bash
pnpm -C packages/ner build
MASKERA_REMOTE=1 node packages/ner/eval/run-eval.mjs
```

Any other Transformers.js token-classification model id also works via
`options.model` + `options.labelMap` if you need different language coverage.

## Limitations

- **Best-effort, not a guarantee.** The rule layer is the dependable floor;
  the model catches most free-text PII but no model is perfect. Keep
  server-side controls for anything high-stakes.
- Swedish-first: behaviour on other languages is undefined.
- Structured identifiers are deliberately out of scope; the rule layer owns
  them, and `redactWithNer` drops any model detection that overlaps a rule hit.

## License

Code: MIT. Default model weights: MIT (base model KB-BERT is CC0). See
[`NOTICE`](./NOTICE).
