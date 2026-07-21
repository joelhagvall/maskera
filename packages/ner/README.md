# maskera

> Swedish-first, client-side PII redaction: mask personal data before text
> reaches an LLM, restore it in the answer. Nothing leaves the device.
> [Live demo: maskera.dev](https://maskera.dev) ·
> [Repo on GitHub](https://github.com/joelhagvall/maskera).

Two layers, one import. Deterministic rule detectors handle *structured* PII
(personnummer, org-nr, IBAN, card, phone, ...), and a small Swedish
token-classification model handles the part regex can't do: **free-text names,
places, organisations and street addresses** ("min granne Lars på våning 4").
Everything runs **client-side** via Transformers.js (WASM/WebGPU in the
browser, native ONNX in Node).

![The two-layer design: input text forks into layer 1, deterministic checksum-validated rules that catch structured PII like personnummer, and layer 2, a 43 MB Swedish AI model that catches free text like names. Rules win on overlap, and the merged result is the masked output. The restore key stays on your device.](https://maskera.dev/layers.svg)

```bash
npm install maskera @huggingface/transformers
```

npm, pnpm and Bun resolve that install as-is. Yarn 4's strict Plug'n'Play
mode also requires Transformers.js 4.2's undeclared runtime import as a direct
application dependency:

```bash
yarn add maskera @huggingface/transformers@4.2.0 onnxruntime-common@1.24.3
```

The ML runtime is an **optional peer dependency**: skip it (and install
[`@maskera/core`](https://www.npmjs.com/package/@maskera/core) instead) if you
only want the zero-dependency rule layer. Core's entire API is re-exported
here, so one import covers rules and model alike:
`import { redact, redactWithNer } from "maskera"`.

## Usage

```ts
import { createNerRecognizer, redactWithNer } from "maskera"

// Downloads maskera-sv-ner (~43 MB, q4) from the Hugging Face Hub on first
// use, then serves it from cache.
const recognizer = createNerRecognizer()
await recognizer.ready

// Hybrid: rule detectors + NER, merged through core's placeholder engine.
// Rules win on overlap: structured PII is deterministic and authoritative.
const result = await redactWithNer(
  "Min granne Lars bor på Kungsholmen, personnummer 19900101-2385.",
  { recognizer },
)
result.text
// "Min granne [NAMN_1] bor på [PLATS_1], personnummer [PERSONNUMMER_1]."
result.restore("Jag har meddelat [NAMN_1].")
// "Jag har meddelat Lars."
```

Create the recognizer **once** and reuse it: the model loads lazily on first
use (or when you await `ready`), and each `detect`/`redactWithNer` call after
that is a few milliseconds of inference.

The hybrid's default rule set (`hybridDefaultDetectors`) is core's
checksum-validated defaults **plus** the low-risk free-text heuristics
`adress` and `lagenhetsnummer`: whoever calls `redactWithNer` has free text
about people, and the address RULE guarantees the house number always ends up
inside the mask where the model's span sometimes splits it. `regnummer` stays
opt-in even here, three letters + three digits is also the shape of booking
codes and case ids. Add it explicitly if plates matter (this is what the live
demo runs):

```ts
import { hybridDefaultDetectors, redactWithNer, regnummer } from "maskera"

await redactWithNer(text, {
  recognizer,
  detectors: [...hybridDefaultDetectors, regnummer],
})
```

### Options

```ts
createNerRecognizer({
  model: MASKERA_SV_NER_MODEL, // default; any HF token-classification model id works
  dtype: "q4",                 // "q4" (43 MB, default) | "q8" (59 MB) | "fp32" (233 MB)
  device: "auto",              // browser default; Node defaults to "cpu"
  minScore: 0.5,               // drop predictions below this confidence
  labelMap: defaultLabelMap,   // remap or drop raw model groups (return null to drop)
  onProgress: (e) => {},       // model download progress for a loading UI
  cacheDir: ".cache/models",   // optional writable cache directory (mainly Node)
})
```

- **`dtype`**: `"q4"` is what the maskera demo ships and what the eval gates
  run against. `"q8"` is slightly more accurate on some inputs; `"fp32"` is
  for benchmarking, not the browser.
- **`device`**: in the browser, the default `"auto"` picks WebGPU when
  available, else WASM. Node defaults to `"cpu"`, using native ONNX without
  probing macOS CoreML; pass an explicit value to override either default.
- **`minScore`**: raise it (e.g. `0.7`) to trade recall for precision. For a
  privacy tool the default errs toward recall: a false positive over-masks,
  a false negative leaks.
- **`labelMap`**: receives the RAW model group with the BIO prefix stripped
  (`"PER"`, `"LOC"`, `"ORG"`, `"ADR"` for maskera-sv-ner) and replaces the
  default mapping entirely, so `(group) => group` gives you `[PER_1]`, not
  `[NAMN_1]`. To keep the Swedish placeholder names while remapping or
  dropping a group, delegate to the exported `defaultLabelMap`:

  ```ts
  import { createNerRecognizer, defaultLabelMap } from "maskera"

  createNerRecognizer({
    // keep the default Swedish labels, but never mask organisations
    labelMap: (group) => {
      const label = defaultLabelMap(group)
      return label === "ORGANISATION" ? null : label
    },
  })
  ```

- **`onProgress`**: Hub downloads receive Transformers.js events verbatim
  (typed as `NerProgressEvent`). Per-file `progress` events carry `file` and a
  0-100 `progress`; with `@huggingface/transformers` v4+ there are also
  `progress_total` events whose `progress` is the aggregate percentage across
  all files, which is the one number a loading bar wants:

  ```ts
  onProgress: (e) => {
    if (e.status === "progress_total") setPercent(Math.round(e.progress ?? 0))
  }
  ```

  Self-hosted models emit safe coarse `initiate` (0) and `ready` (100) events
  by default. Transformers.js 4.2 otherwise probes the full ONNX file in
  parallel with the real download, which can fail in a fresh Chromium cache.
  Set `nativeLocalProgress: true` only if your Transformers.js runtime includes
  a fix that cancels that metadata response.
- **`cacheDir`**: sets a writable Transformers.js cache directory. Under Yarn
  PnP, maskera automatically redirects the runtime's read-only virtual default
  to `<project>/.cache/transformers`; set this option to choose another path.

### Self-hosting the model

Don't want a runtime dependency on the Hugging Face Hub? Host the model files
yourself (they're static files) and point the recognizer at them:

```ts
createNerRecognizer({
  model: "maskera-sv-ner-v18", // version the folder name: the browser caches by URL
  localModelPath: "/models/",   // same-origin path (or a CDN reverse-proxied here)
  allowLocalModels: true,
  allowRemoteModels: false,     // never touch the Hub
})
```

Copy the files from the
[Hub repo](https://huggingface.co/joelhagvall/maskera-sv-ner) (config,
tokenizer, `onnx/model_q4.onnx`) into `public/models/maskera-sv-ner-v18/`
(version the folder name, the browser caches model files by URL). This is
exactly how the maskera demo runs, fully offline after first load. Use a
same-origin path such as `/models/`; Transformers.js 4.2's tokenizer metadata
path does not reliably support an absolute CDN base URL. If the files live on
a CDN, reverse-proxy that origin below your own `/models/` route.

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
(`MASKERA_SV_NER_MODEL`, MIT, 43 MB q4): PER/LOC/ORG/ADR, distilled from
KB-BERT, trained on synthetic + real Swedish with lowercase/ALL CAPS/genitive
augmentation (chat users type lowercase). On the packaged gold corpus it
scores 99.8% span-F1 with a 0.0% leak rate; on independent real text, 94.7%
and 3.4% (measured 2026-07-19). The canonical, dated tables live in
[docs/BENCHMARKS.md](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md).
Run the eval yourself:

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

For DPOs, security teams and legal reviewers there is a whitepaper covering
architecture, privacy model, training data and GDPR positioning:
[maskera.dev/whitepaper.pdf](https://maskera.dev/whitepaper.pdf).

## License

Code: MIT. Default model weights: MIT (base model KB-BERT is CC0). See
[`NOTICE`](./NOTICE).
