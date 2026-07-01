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

<details>
<summary>Full runnable example (<a href="examples/llm-roundtrip.ts"><code>examples/llm-roundtrip.ts</code></a>)</summary>

```ts
import { redact } from "@maskera/core"

const userMessage =
  "Hej, jag heter Anna Karlsson, personnummer 19900101-0017, " +
  "och jag når er på 070-123 45 67 eller anna@example.se."

const { text, map, restore } = redact(userMessage)

console.log("Sent to LLM:\n", text)
// Hej, jag heter Anna Karlsson, personnummer [PERSONNUMMER_1],
// och jag når er på [PHONE_1] eller [EMAIL_1].

// --- pretend this came back from your model ---
const llmAnswer = "Tack! Jag har noterat [PHONE_1] som kontaktnummer och mejlar [EMAIL_1]."

console.log("\nRestored locally:\n", restore(llmAnswer))
// Tack! Jag har noterat 070-123 45 67 som kontaktnummer och mejlar anna@example.se.
```

</details>

---

Two layers, the same architecture as
[Rampart](https://huggingface.co/nationaldesignstudio/rampart) — a deterministic
rule layer plus a small browser NER model — **specialised for Swedish**:

1. **A deterministic rule layer** (`@maskera/core`) — personnummer, samordningsnummer,
   organisationsnummer, Swedish phone numbers, postnummer, bankgiro/plusgiro and
   IBAN, all checksum-validated. Zero dependencies, runs everywhere.
2. **An optional Swedish NER model** (`@maskera/ner`) — for the free-text entities
   rules can't catch (names, places, organisations, addresses), trained on Swedish.

### How this relates to Rampart

[Rampart](https://huggingface.co/nationaldesignstudio/rampart) (National Design
Studio, CC BY 4.0) pioneered this design and does it well — 7 Latin-script
languages, ~15 MB, rigorously evaluated. maskera is **not** trying to beat it
across the board; it's the **Swedish specialisation** of the same idea. We win in
exactly one place, and only there:

- Rampart **isn't trained on Swedish** (its languages are en/es/fr/de/it/pt/nl), and
- it **strips diacritics** (José→jose) — which destroys Swedish, where **å/ä/ö are
  distinct letters**. maskera uses a *cased* Swedish base (KB-BERT) that keeps them.

So **on Swedish text maskera wins measurably** (see the benchmark); on its own
turf Rampart is excellent, smaller, and more thoroughly evaluated. Use Rampart for
multilingual; use maskera for Swedish.

## What's built

An honest snapshot of where the project is:

- ✅ **Rule engine (`@maskera/core`)** — built from scratch: regex + Luhn-checksum
  detectors for structured Swedish PII (personnummer, org-nr, phone, email,
  IBAN…), plus a redact/restore engine with stable placeholders. Zero
  dependencies, tested. **This is shippable today.**
- ✅ **Our own Swedish NER model** — we **fine-tuned** KB-BERT (CC0 Swedish base
  model) on synthetic Swedish data, **distilled** it, then **shrank** it
  (vocab-trim + q4) to a browser-sized 40 MB ONNX. Benchmarked openly: it beats
  Rampart wide on Swedish (**0.89 vs 0.39** type-aware F1 on independent real
  text) and masks **~0.95** of the PII.
- ✅ **NER layer (`@maskera/ner`)** — runs a model client-side via Transformers.js,
  with subword-span reconstruction and the shared placeholder engine.
- ✅ **Interactive demo** — 10 domains, model always on, live redaction as you type.
- ✅ **Honesty around it** — reproducible training pipeline, two benchmarks with
  caveats, a [transparency doc + FAQ](docs/TRANSPARENCY.md), base-model license
  verified (KB-BERT is CC0), and the model published to the Hugging Face Hub
  ([`joelhagvall/maskera-sv-ner`](https://huggingface.co/joelhagvall/maskera-sv-ner)).

**What we deliberately did _not_ do:** train a language model from scratch (we
stood on KB-BERT), modify Rampart's weights (we only wrap it as an option), claim
GDPR compliance, or publish invented benchmark numbers.

**Not done yet:** smaller architecture toward ~15 MB, a *larger* independent gold
set (training on the Swedish NER Corpus made its test split in-distribution), and
real *target-domain* data (support/healthcare/legal, where the public news/wiki
sets don't reach). Framework wrappers (`@maskera/node`, `@maskera/react`) are
intentionally **demand-driven**, built when users ask, not speculatively. See
[`docs/ROADMAP.md`](docs/ROADMAP.md).

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

The shipped model is **40 MB** (vocab-trimmed + q4), runs in the browser, and
wins on Swedish on **both** our eval and an independent one (type-aware F1, plus
the privacy-relevant **redaction recall** = was the PII masked at all):

| Eval set                              | type-aware F1 | redaction recall |
| ------------------------------------- | ------------- | ------------------ |
| our hand-authored set (PII-style)     | **0.945**     | 0.95               |
| independent gold (real Wikipedia text)| **0.891**     | 0.95               |

### vs the real competitors (not just Rampart)

On the independent gold set, mapped to PER/LOC/ORG (`python
training/benchmark_competitors.py`):

| Model                              | size    | redaction recall | type-aware F1 |
| ---------------------------------- | ------- | ---------------- | ------------- |
| **maskera** (distilled student)    | 82M fp32 / **40 MB q4** | 0.98 | **0.92** |
| KB/bert-base-swedish-cased-ner     | ~440 MB | 1.00             | 0.92          |
| Rampart                            | 15 MB   | ~0.4             | ~0.39         |
| sbx PII general / detailed         | ~440 MB | 0.05 / 0.10      | 0.10 / 0.19   |

The honest read:

- **maskera matches KB**, the strong full-size Swedish baseline, at fp32 (0.92 vs
  0.92). That is the point: you are not trading quality for the browser. The
  *shipped* 40 MB q4 gives up ~0.03 F1 for 10x smaller size and client-side use.
- **The Språkbanken PII models are a different task** (PII categories from learner
  essays), so they barely fire on general name/place/org text; not a competitor
  for free-text redaction. The real comparison is KB, and maskera holds it.
- Rampart is a weak Swedish baseline (ORG F1 = 0.00); beating it was never the
  bar.

The shipped model is **v6**. A synthetic-only round (v5.1) hit a precision
ceiling on independent text (it could buy recall only by over-flagging), so v6
added ~6.9k sentences of real labelled Swedish (the **Swedish NER Corpus** train
split) to the training mix. That is the lever synthetic data could not pull: the
independent Wikipedia number rose from 0.846 (v4) and 0.782 (v5.1) to **0.891**,
with precision **and** recall both high (0.87 / 0.91) instead of one traded for
the other. Because the model now trains on that corpus, its test split is
in-distribution and no longer counts as independent; the honest independent
measure is the held-out Wikipedia gold set above. See
[`training/README.md`](training/README.md) for the full write-up.

> **Read these honestly.** Our own set shares an author with the data generator,
> so 0.945 *flatters* the model. The independent gold set is real prose written by
> others (Wikipedia), but *encyclopedic*, a different domain from the
> support/healthcare PII text this targets, so it is a pessimistic floor and also
> small (a couple dozen sentences). The truth for the target domain sits between.
> What's solid: **redaction recall ~0.95** and a wide win over Rampart. The
> structured-PII rules aren't in this table, they're deterministic, not learned.

The real next gain is **more real labelled Swedish data, in the target domain**
(support/healthcare/legal). Adding the Swedish NER Corpus (news) already raised
the independent number 0.85 to 0.89 and lifted precision and recall together,
which synthetic rounds could not; the public news/wiki sets just don't reach the
target domain, and a larger independent gold set is still needed to measure it.

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
