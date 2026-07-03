<img src="logo.svg" alt="maskera" width="56" align="left" />

# maskera

> **Swedish PII redaction, on-device. Names, personnummer, addresses are masked before your text reaches an LLM, a log, or analytics.**

```bash
npm install @maskera/core                            # rules: personnummer, phone, IBAN...
npm install @maskera/ner @huggingface/transformers   # + our Swedish AI model: names, places, orgs
```

```ts
import { createNerRecognizer, redactWithNer } from "@maskera/ner"

const recognizer = createNerRecognizer() // our 40 MB Swedish model, runs in the browser
const { text, restore } = await redactWithNer(
  "hej jag heter anna karlsson, personnummer 19900101-0017, och bor i uppsala",
  { recognizer },
)
text
// "hej jag heter [PERSON_1], personnummer [PERSONNUMMER_1], och bor i [LOCATION_1]"
```

Everything runs client-side. Nothing is sent anywhere, no telemetry, and the
restore map stays with you. **[Live demo →](apps/demo)**

## The model is the point

[`maskera-sv-ner`](https://huggingface.co/joelhagvall/maskera-sv-ner) is our
own Swedish NER model: KB-BERT fine-tuned on synthetic + real Swedish,
distilled and shrunk to a **40 MB** ONNX that runs in the browser
(WebGPU/WASM) and in Node. It catches what regex never can: free-text names,
places, organisations and street addresses, including all-lowercase chat text
("hej jag heter anna karlsson"), ALL CAPS and genitive forms, because that is
how people actually type.

| Eval set | type-aware F1 | redaction recall |
| -------- | ------------- | ---------------- |
| our hand-authored set | **0.946** | 0.97 |
| independent gold (real text by others) | **0.940** | 0.97 |

It matches the full-size Swedish baseline (KB-BERT NER, ~440 MB) on
independent text at a tenth of the size. Training pipeline, benchmarks and
caveats are fully reproducible: see [`training/`](training/). Model weights
are MIT. Every push to this repo re-grades the published model in CI against
a gold corpus with an F1 floor and a leak-rate ceiling.

## Two layers, rules first

1. **`@maskera/core`**: deterministic detectors for structured Swedish PII.
   Personnummer, samordningsnummer, organisationsnummer, phone, email,
   postnummer, bankgiro, plusgiro, IBAN, cards, IP, URL. Checksum-validated
   where a checksum exists, so `2019-2024` is not a bankgiro and
   `123456-0000` is not a person. Zero dependencies, synchronous, runs
   anywhere JavaScript runs.
2. **`@maskera/ner`**: the model layer above, opt-in so core stays
   dependency-free. In the hybrid, rules win on overlap: structured PII is
   always handled deterministically, the model only fills the free-text gap.

Rules alone when inputs are structured-ish; add the model when users type
free text. That split is the design: regex for what regex is good at, ML only
for what it is needed for.

## Use it before an LLM call

Redact on the way in, restore on the way out. The LLM never sees real data,
your code still gets real answers:

```ts
const { text: safePrompt, restore } = await redactWithNer(userInput, { recognizer })
const answer = await llm(safePrompt) // OpenAI / Anthropic / Vercel AI SDK, any
const result = restore(answer)       // placeholders back to real values, locally
```

Placeholders are **stable**: the same value always maps to the same token, so
the model can reason about `[PERSON_1]` consistently. The same one-liner works
before logging: `logger.info(redact(msg).text)`. Runnable example:
[`examples/llm-roundtrip.ts`](examples/llm-roundtrip.ts).

## Custom detectors

Anything you can regex (case ids, customer numbers) joins the same engine:

```ts
import { redact, regexDetector } from "@maskera/core"

const caseId = regexDetector("ARENDENUMMER", /\bAR-\d{6}\b/g)
redact("Ärende AR-123456 är stängt.", { detectors: [caseId] }).text
// "Ärende [ARENDENUMMER_1] är stängt."
```

## Packages

| Package | Status | What it does |
| ------- | ------ | ------------ |
| [`@maskera/core`](packages/core) | ✅ ready | Zero-dep detectors + redact/restore engine |
| [`@maskera/ner`](packages/ner) | ✅ ready | Our Swedish model via Transformers.js |
| `@maskera/node`, `@maskera/react` | ⏳ on demand | Wrappers, built when users ask |

Full API docs live in the package READMEs. For thresholds, self-hosting the
model, fallback patterns and an operational checklist, read
**[docs/PRODUCTION.md](docs/PRODUCTION.md)**.

## Live demo

Redaction as you type, across ten Swedish domains (vård, juridik, BRF, HR,
bank...), with a toggle showing exactly what the AI would otherwise receive.
The model loads in the background; rules work instantly meanwhile.

```bash
pnpm install && pnpm demo   # http://localhost:5180
```

## Honesty & transparency

maskera is **defense in depth, not a compliance guarantee**. The rule layer
is deterministic; the model catches most free-text PII (0.97 redaction recall
on independent text) but no model is perfect. Numbers above come with caveats
spelled out in [`training/README.md`](training/README.md), and
[`docs/TRANSPARENCY.md`](docs/TRANSPARENCY.md) documents exactly what runs
where: 100% on-device, the only network call is the one-time model download
(never your text), self-hostable, trained without any real PII.

## Development

```bash
pnpm install
pnpm build && pnpm test    # 121 tests
pnpm lint                  # biome
pnpm smoke                 # pack tarballs, install fresh, test ESM+CJS
pnpm eval                  # grade the published model against the gold corpus
```

CI runs all of the above on every push, plus a model eval gated on an F1
floor and leak-rate ceiling, and a weekly canary against the live Hub
artifact that opens an issue if anything drifts. Roadmap:
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## License

Code: MIT © Joel Hägvall. Model weights: MIT (base model KB-BERT is CC0,
National Library of Sweden). See [`packages/ner/NOTICE`](packages/ner/NOTICE).
