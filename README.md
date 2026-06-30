<img src="logo.svg" alt="maskera" width="56" align="left" />

# maskera

> **Swedish PII redaction, on-device — before your text reaches an LLM, a log, or analytics.**

```bash
pnpm add @maskera/core
```

```ts
import { redact } from "@maskera/core"

redact("Mitt personnummer är 19900101-0017. Maila anna@example.se.").text
// "Mitt personnummer är [PERSONNUMMER_1]. Maila [EMAIL_1]."
```

Zero dependencies. Runs anywhere JavaScript runs. Personnummer, samordningsnummer,
org-nummer and the rest are checksum-validated, not guessed — and an optional
Swedish model adds names, places and orgs. **[Live demo →](apps/demo)**

### Use it before an LLM call

Redact on the way in, restore on the way out — the model never sees real data,
your code still gets real answers:

```ts
import { redact } from "@maskera/core"

const { text: safePrompt, restore } = redact(userInput)
const answer = await llm(safePrompt) // OpenAI / Anthropic / Vercel AI SDK — any
const result = restore(answer) // placeholders → real values, locally
```

The same one-liner works before logging or analytics: `logger.info(redact(msg).text)`.

---

Two layers, inspired by [Rampart](https://huggingface.co/nationaldesignstudio/rampart)
but built **Swedish-first**:

1. **A deterministic rule layer** (`@maskera/core`) — personnummer, samordningsnummer,
   organisationsnummer, Swedish phone numbers, postnummer, bankgiro/plusgiro and
   IBAN, all checksum-validated. Zero dependencies, runs everywhere.
2. **An optional Swedish NER model** (`@maskera/ner`) — for the free-text entities
   rules can't catch (names, places, organisations, addresses). We trained our
   own, and **it beats Rampart on Swedish by a wide margin** (benchmark below).

## What's built

An honest snapshot of where the project is:

- ✅ **Rule engine (`@maskera/core`)** — built from scratch: regex + Luhn-checksum
  detectors for structured Swedish PII (personnummer, org-nr, phone, email,
  IBAN…), plus a redact/restore engine with stable placeholders. Zero
  dependencies, tested. **This is shippable today.**
- ✅ **Our own Swedish NER model** — we **fine-tuned** KB-BERT (CC0 Swedish base
  model) on synthetic Swedish data, then **distilled** it into a browser-sized
  student (~82 MB int8 ONNX). Benchmarked openly: **0.70 F1 vs Rampart's 0.39**
  on independent data — a wide win on Swedish.
- ✅ **NER layer (`@maskera/ner`)** — runs a model client-side via Transformers.js,
  with subword-span reconstruction and the shared placeholder engine.
- ✅ **Interactive demo** — 10 domains, model always on, live redaction as you type.
- ✅ **Honesty around it** — reproducible training pipeline, two benchmarks with
  caveats, a [transparency doc + FAQ](docs/TRANSPARENCY.md), base-model license
  verified (KB-BERT is CC0), and Hugging Face publishing prepared.

**What we deliberately did _not_ do:** train a language model from scratch (we
stood on KB-BERT), modify Rampart's weights (we only wrap it as an option), claim
GDPR compliance, or publish invented benchmark numbers.

**Not done yet:** vocab-trim + q4 toward ~15-30 MB, a larger independent eval
set, and hosting the model on the Hub. Framework wrappers (`@maskera/node`,
`@maskera/react`) are intentionally **demand-driven** — built when users ask, not
speculatively. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Why it exists

> "I want to use AI, but I don't want to send personal data to the model."

That single sentence is the whole pitch. It's the blocker for municipalities,
healthcare, insurance, law firms, HR tools, customer support, and BRF platforms.
maskera turns it into one function call you run **on the client**, so the sensitive
values never travel.

- **Privacy before the LLM** — strip PII from prompts, keep the meaning.
- **PII-safe logging & analytics** — redact before you persist anything.
- **GDPR / EU AI Act posture** — data minimisation by construction.
- **Stable placeholders** — the same value always maps to the same token, so the
  model can reason about `[PERSON_1]` consistently and you can map results back.

## Benchmark: Swedish PII (free-text entities)

Measured on a hand-authored Swedish eval set (121 sentences, 236 entities)
deliberately outside the training distribution — novel names/places/orgs,
lowercase, abbreviations, foreign names, and distractors that must not be
tagged. Span-level, type-aware F1 (see [`training/`](training/)).

| Model                       | Size   | Overlap F1 | Exact F1 |
| --------------------------- | ------ | ---------- | -------- |
| maskera teacher (KB-BERT)     | 440 MB | **0.899**  | 0.851    |
| **maskera student (distilled)** | 82 MB | **0.874** | 0.798    |
| Rampart                     | 15 MB  | 0.621      | 0.494    |

Per-type F1 (overlap): the student scores PER 0.91 / LOC 0.90 / ORG 0.81 /
ADR 0.85. Rampart's gaps are concentrated — **ORG F1 = 0.00** (it tags no
Swedish organisations, 0/67) and **LOC recall = 0.39**.

An **independent** check on third-party data (WikiANN Swedish, no shared author)
confirms the direction: student **0.70** vs Rampart **0.39** overlap F1 — the gap
holds and widens, with Rampart again at ORG F1 = 0.00. Absolute scores drop on
that out-of-domain encyclopedic text (honest domain shift); see
[`training/README.md`](training/README.md).

> **Honest caveats.** The hand-authored eval set is modest (121 sentences,
> single annotator) and shares an author with the synthetic data generator —
> treat it as a strong *directional* signal, not a final number. WikiANN is
> silver-standard (noisy), so its absolute values are depressed for all models
> equally. The structured-PII rules aren't in these tables because they're
> deterministic, not learned.

## Live demo

An interactive playground shows redaction happening **as you type**, across real
scenarios from healthcare, law, BRF/property, crisis response, HR, support,
municipality, insurance, banking and schools — toggle the shield on/off to see
exactly what the AI would otherwise receive.

The Swedish NER model is **always on**: the demo auto-loads it in the browser on
startup (no toggle). The rule layer works instantly meanwhile, so there's no
blank wait — once the model finishes loading it takes over free-text name/place/
org detection seamlessly. Rules and model both run; rules win on overlap.

```bash
pnpm install
pnpm demo      # opens apps/demo on http://localhost:5180
```

## Packages

This is a pnpm monorepo.

| Package          | Status          | What it does                                          |
| ---------------- | --------------- | ----------------------------------------------------- |
| `@maskera/core`    | ✅ ready        | Zero-dep Swedish PII detectors + redact/restore engine |
| `@maskera/ner`     | 🧪 experimental | Opt-in ONNX/Transformers.js NER for free-text names/places |
| `@maskera/node`    | ⏳ on demand    | Express middleware + AI-SDK wrappers — built when users ask |
| `@maskera/react`   | ⏳ on demand    | `usePrivacyGuard()` hook + `<RedactedInput />` — if there's pull |

> `@maskera/core` already runs in React and Node today (it's just functions), so
> the wrappers are DX conveniences, not capability — we build them when real
> demand appears, not speculatively.

```
maskera/
├── packages/
│   ├── core/        @maskera/core — rules + redact/restore engine (shippable today)
│   └── ner/         @maskera/ner  — Transformers.js NER layer (Rampart or our model)
├── apps/
│   └── demo/        interactive live-redaction playground (Vite + React)
├── training/        Swedish NER: data gen, fine-tune, distill, ONNX, benchmark
└── docs/ROADMAP.md  the plan
```

## `@maskera/core` — the rule layer

```bash
pnpm add @maskera/core
```

Built-in detectors, all checksum-validated where a checksum exists:

| Label                  | Validation                          |
| ---------------------- | ----------------------------------- |
| `PERSONNUMMER`         | date + Luhn                         |
| `SAMORDNINGSNUMMER`    | date (+60 day) + Luhn               |
| `ORGANISATIONSNUMMER`  | Luhn, third digit ≥ 2               |
| `EMAIL`                | pattern                             |
| `PHONE`                | Swedish mobile + landline           |
| `POSTNUMMER`           | NNN NN                              |
| `BANKGIRO` / `PLUSGIRO`| pattern                             |
| `IBAN`                 | SE pattern                          |
| `CREDIT_CARD`          | Luhn                                |
| `IP_ADDRESS` / `URL`   | pattern                             |

### Custom detectors

```ts
import { redact, regexDetector } from "@maskera/core"

const apartment = regexDetector("LAGENHETSNUMMER", /\blgh\s?\d{4}\b/gi)

redact("Bor i lgh 1203.", { detectors: [apartment] }).text
// "Bor i [LAGENHETSNUMMER_1]."
```

### API

- `redact(input, options?)` → `{ text, redactions, map, restore }`
- `redactFromDetections(input, detections, options?)` → reuse the engine with external detections
- `restore(text, map)` → original values re-inserted
- `regexDetector(label, globalRegex, validate?)` → a `Detector`
- `defaultDetectors`, plus every detector individually
- validators: `luhnValid`, `isPersonnummer`, `isSamordningsnummer`, `isOrganisationsnummer`

## `@maskera/ner` — the model layer (optional)

Adds free-text entities (names, places, orgs) via a Transformers.js model that
runs client-side. The ML runtime is an optional peer dependency, so
`@maskera/core` stays zero-dependency.

```bash
pnpm add @maskera/ner @huggingface/transformers
```

```ts
import { createNerRecognizer, redactWithNer } from "@maskera/ner"

const recognizer = createNerRecognizer() // pass { model } to use our Swedish model
await recognizer.ready

const { text } = await redactWithNer("Min granne Lars bor på Kungsholmen.", {
  recognizer,
})
// "Min granne [PER_1] bor på [LOC_1]."
```

The default model is Rampart (CC BY 4.0). Our Swedish model — which wins the
benchmark above — is trained in [`training/`](training/); point
`createNerRecognizer({ model })` at it once hosted. See
[`packages/ner/NOTICE`](packages/ner/NOTICE) for model attribution.

## Training & the Swedish model

[`training/`](training/) is a full, reproducible pipeline: synthetic Swedish
data generation → KB-BERT fine-tune → DistilBERT-style distillation → ONNX +
int8 → benchmark vs Rampart. It runs on Apple Silicon (MPS). See
[`training/README.md`](training/README.md) for the method, the size ladder, and
the lesson that a from-scratch small student memorises synthetic templates
(F1 1.00) but doesn't generalise — initialising from the teacher fixes it.

## Development

```bash
pnpm install
pnpm build      # build all packages
pnpm test       # run all tests (vitest)
pnpm lint       # biome
```

## Transparency & privacy

Since maskera is a privacy tool, it's explicit about its own workings:
**redaction runs 100% on-device, nothing is sent anywhere, no telemetry**, and the
model was trained on **fully synthetic data — no real PII, no scraping.** The only
network calls are a one-time fetch of model weights/runtime (never your text), and
everything is reproducible and self-hostable. Full details + FAQ:
[`docs/TRANSPARENCY.md`](docs/TRANSPARENCY.md).

## A note on guarantees

maskera is **defense in depth, not a guarantee**. Regex + checksums catch
structured data reliably; the NER layer catches most free-text names/places but
no model is perfect. Treat it as a strong first line — keep server-side controls
too. It is a data-minimisation aid, **not** a compliance guarantee.

## License

Code: MIT © Joel Hägvall. Model weights carry their own licenses (Rampart:
CC BY 4.0; KB-BERT base: see National Library of Sweden).
