# maskera

> Swedish-first, client-side PII redaction: mask personal data before text
> reaches an LLM, restore it in the answer. Text and restore maps stay with
> the caller.
> [Live demo: maskera.dev](https://maskera.dev) ·
> [Repo on GitHub](https://github.com/joelhagvall/maskera).

Two layers, one import. Deterministic rule detectors handle *structured* PII
(personnummer, org-nr, IBAN, card, phone, ...), and a small Swedish
token-classification model handles the part regex can't do: **free-text names,
places, organisations and street addresses** ("min granne Provnamn på våning 4").
Everything runs **client-side** via Transformers.js (WASM/WebGPU in the
browser, native ONNX in Node).

![The two-layer design: input text forks into layer 1, deterministic format-aware rules for structured PII like personnummer, and layer 2, a 43 MB Swedish AI model that catches free text like names. Rules win on overlap, and the merged result is the masked output. The restore key stays on your device.](https://maskera.dev/layers.svg)

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
`import { redact, redactWithNer } from "maskera"`. The peer range is
`@huggingface/transformers` **v4** (`^4.0.0`); v3 is not supported or tested.

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
  "Min granne Provnamn bor i Provbyn, personnummer 19900101-2385.",
  { recognizer },
)
result.text
// "Min granne [NAMN_1] bor i [PLATS_1], personnummer [PERSONNUMMER_1]."
result.restore("Jag har meddelat [NAMN_1].")
// "Jag har meddelat Provnamn."
```

Create the recognizer **once** and reuse it: the model loads lazily on first
use (or when you await `ready`), and each `detect`/`redactWithNer` call after
that is a few milliseconds of inference.

The hybrid's default rule set (`hybridDefaultDetectors`) is core's structured
defaults **plus** the low-risk free-text heuristics `adress` and
`lagenhetsnummer`, and context-labeled account/journal identifiers. Whoever calls
`redactWithNer` has free text about people, and the address rule guarantees the
house number always ends up inside the mask where the model's span sometimes
splits it. `regnummer` stays opt-in even here: three letters + three digits is
also the shape of booking codes and case ids. Add it explicitly if plates
matter (this is what the live demo runs):

```ts
import { hybridDefaultDetectors, redactWithNer, regnummer } from "maskera"

await redactWithNer(text, {
  recognizer,
  detectors: [...hybridDefaultDetectors, regnummer],
})
```

### Clinical profile

For clinical text, use the opt-in precision policy to keep common measurements,
medication doses and unambiguous care terms available to a downstream assistant
without weakening deterministic identifier rules:

```ts
import { redactWithNer } from "maskera"

await redactWithNer(journalText, {
  recognizer,
  profile: "clinical",
})
```

This policy is intentionally not global: domain filters trade a small amount
of model recall for utility and should only be enabled for clinical workflows.
`clinicalPrecisionFilter` remains exported for callers that want to compose the
same policy manually with a custom pipeline.

### Options

`redactWithNer(input, options)` accepts:

| option | default | purpose |
| ------ | ------- | ------- |
| `recognizer` | required | Reusable recognizer created by `createNerRecognizer()` |
| `profile` | `"general"` | Set `"clinical"` to retain common measurements, doses and care terms |
| `detectors` | `hybridDefaultDetectors` | Override the deterministic rule set |
| `placeholder` | `[LABEL_N]` | Customize generated placeholder tokens |
| `detectionFilter` | none | Advanced custom policy, composed with the selected profile |

The normal path needs only `{ recognizer }`. Prefer `profile: "clinical"` over
wiring `clinicalPrecisionFilter` manually unless you are building a custom
policy.

Recognizer construction has these options:

```ts
createNerRecognizer({
  model: MASKERA_SV_NER_MODEL, // default; any HF token-classification model id works
  revision: MASKERA_SV_NER_REVISION, // default for maskera's model: a pinned Hub commit
  dtype: "q4",                 // "q4" (43 MB, default) | "q8" (59 MB) | "fp32" (233 MB)
  device: "auto",              // browser default; Node defaults to "cpu"
  minScore: 0.5,               // drop predictions below this confidence
  labelMap: defaultLabelMap,   // remap or drop raw model groups (return null to drop)
  onProgress: (e) => {},       // model download progress for a loading UI
  cacheDir: ".cache/models",   // optional writable cache directory (mainly Node)
  verifyModelIntegrity: true,  // default: sha256-check the pinned model's cached files
})
```

`model`, `revision` and `localModelPath` are **developer-only configuration**:
they decide where executable weights are loaded from and must never be
derived from end-user input.

- **`revision`**: the Hub commit, tag or branch the weights come from. maskera's
  own model defaults to the pinned `MASKERA_SV_NER_REVISION`, so a given release
  of this package always runs the exact weights it was benchmarked against, and
  a compromised Hub account cannot swap the model out from under an installed
  version. New weights therefore arrive with a maskera release, not on their
  own; pass `revision: "main"` if you would rather track the Hub directly. Any
  other `model` keeps Transformers.js's own default, and the option is ignored
  when loading from `localModelPath`. The value is validated at construction:
  Transformers.js interpolates it verbatim into its cache path, so anything
  containing `..` or `\`, or starting with `/`, throws (a commit sha, tag or
  branch name all pass).
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
  The directory must be writable **only by the current process's user** — the
  runtime reuses any file that exists there, so a shared world-writable
  location (a bare `/tmp` subdir, for example) lets another local user swap
  the model files. `verifyModelIntegrity` catches that for the pinned default
  model, but not for a custom `model`. Use a project- or user-local path.
- **`verifyModelIntegrity`**: on by default, and only meaningful for maskera's
  own model loaded from the Hub at the pinned revision (Node only). Every
  cached model file is sha256-checked against digests pinned in this package —
  once before the pipeline touches the cache, once after the download —
  because the revision pin controls *what* is downloaded while
  Transformers.js's cache trusts any file that merely *exists*. A mismatch
  throws and refuses to load. A custom `model`/`revision`/`localModelPath`
  has no digest map and is **not** verified; self-hosted models need their own
  integrity story.

### Self-hosting the model

Don't want a runtime dependency on the Hugging Face Hub? Host the model files
yourself (they're static files) and point the recognizer at them:

```ts
createNerRecognizer({
  model: "maskera-sv-ner-v19", // version the folder name: the browser caches by URL
  localModelPath: "/models/",   // same-origin path (or a CDN reverse-proxied here)
  allowLocalModels: true,
  allowRemoteModels: false,     // never touch the Hub
})
```

Copy the files from the
[Hub repo](https://huggingface.co/joelhagvall/maskera-sv-ner) (config,
tokenizer, `onnx/model_q4.onnx`) into `public/models/maskera-sv-ner-v19/`
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
KB-BERT. Published v19 uses only 64,000 attested generator-produced task rows
plus 4,760 disjoint validation rows and has passed every defined release gate.
On its revised synthetic ADR set the current pipeline covers all 57
gold spans exactly with zero leaks, including all 35 marked addresses; one
organisation is typed ADDRESS, so labeled F1 is 96.5%. On the packaged gold
curated set v19 reaches 96.9% span F1 with 1/205 leaks, and on the
LinkedIn-style set it reaches 81.7% with 0/53 leaks (re-measured 2026-08-10).
On the packaged gold corpus historical v18 scored 99.8% span-F1 with a 0.0%
leak rate; on independent real text, 94.7% and 3.4% (measured 2026-07-19).
Those historical comparisons do not automatically transfer to v19. The
canonical, dated release tables live in
[docs/BENCHMARKS.md](https://github.com/joelhagvall/maskera/blob/main/docs/BENCHMARKS.md).
The current v19 q4 artifact was compared separately on 2026-08-11 with KBLab
lowermix fp32 on the same 121 synthetic, hand-authored Swedish texts (211
PER/LOC/ORG entities, overlap matching). Maskera masked 211/211 both with
original casing and lowercased; KBLab masked 205/211 and 187/211. KBLab led
typed F1 on original casing (89.4% vs 87.1%); Maskera led lowercase typed F1
(85.7% vs 83.2%). Because Maskera's developer wrote the corpus, treat this as
directional regression evidence rather than an independent ranking.
The full v19 hybrid was also compared on 2026-08-14 with LogosGuard 2.4.4 in
Chrome, Free/`Balanced`, across 258 synthetic Swedish domain texts with 952
annotated PII strings. Using the same strict full-removal scorer, Maskera fully
removed 933/952 (98.0%) and LogosGuard 606/952 (63.7%); partial/clear-text leaks
were 8/11 and 49/297. This comparison is author-coupled and does not report
precision; the per-document outcomes, capture hashes and encoding caveat are
in the canonical benchmark report.
v19's training-data scope, identifier rejection, provenance hashes,
and separate KB-BERT pretraining caveat are documented in
[TRAINING_DATA_PROTECTION.md](https://github.com/joelhagvall/maskera/blob/main/docs/TRAINING_DATA_PROTECTION.md).
Run the eval yourself:

```bash
pnpm -C packages/ner build
MASKERA_REMOTE=1 node packages/ner/eval/run-eval.mjs
```

For the complete hybrid path (rules plus v19), the repository also contains a
tracked, privacy-safe 258-text Swedish domain regression corpus:

```bash
pnpm eval:domain
pnpm eval:domain:clinical
```

These commands use the demo's local q4 model and enforce the corpus-specific
full-hit floor. Set `MASKERA_REPORT=tmp/pii-domain.md` for an ignored detailed
report; see [`docs/BENCHMARKS.md`](../../docs/BENCHMARKS.md) for scope and the
dated baseline.

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
