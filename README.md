<img src="logo.svg" alt="maskera" width="56" align="left" />

# maskera

> **Swedish PII redaction, on-device. Detected names, personnummer, and addresses are masked before your text reaches an LLM, a log, or analytics.**

<a href="https://maskera.dev"><img src="docs/demo.png" alt="maskera-demon: svensk text med markerade personuppgifter till vänster, samma text med platshållare som [NAMN_1] till höger" width="100%"></a>

```bash
npm install maskera @huggingface/transformers   # all-in-one: rules + my Swedish AI model
```

Yarn 4/PnP also needs the runtime leaf that Transformers.js 4.2 imports
without declaring: `yarn add maskera @huggingface/transformers@4.2.0
onnxruntime-common@1.24.3`. npm, pnpm and Bun use the shorter command above.

```ts
import { createNerRecognizer, redactWithNer } from "maskera"

const recognizer = createNerRecognizer() // my 43 MB Swedish model, runs in the browser
const { text, restore } = await redactWithNer(
  "hej jag heter provnamn maskera, personnummer 19900101-2385, och bor i provbyn",
  { recognizer },
)
text
// "hej jag heter [NAMN_1], personnummer [PERSONNUMMER_1], och bor i [PLATS_1]"
```

Masking runs client-side. Text and restore maps are not sent away for
masking, and the packages contain no telemetry. `maskera` re-exports the whole rule layer,
so one import covers rules and model alike. Rules only, zero dependencies:
`npm install @maskera/core`. **[Live demo → maskera.dev](https://maskera.dev)**

## Choose how to run it

This public repository and the demo are the free, local-processing option:
your team owns the integration and operation. Companies that want the same
masking as a ready-made, supported installation in their own environment can
use [Maskera Gateway](https://app.maskera.dev/gateway). Gateway is delivered as a
signed, digest-pinned OCI image with the same 43 MB model built in. It runs on
CPU without a database, GPU or separate model server, and masks every AI call
that the application routes through it before the approved upstream receives
the request.

The options are compared at
[maskera.dev/tjanster](https://maskera.dev/tjanster). Full plan details,
contracts and Gateway documentation live only on app.maskera.dev so
they cannot drift across repositories; the public site shows only the free
option and clear starting prices.

## The model is the point

[`maskera-sv-ner`](https://huggingface.co/joelhagvall/maskera-sv-ner) is our
own Swedish NER model. The published v19 artifact is rebuilt from the pinned
KB-BERT checkpoint using only 64,000 attested generator-produced task rows and
4,760 disjoint validation rows, then distilled and shrunk to a **43 MB** ONNX that runs in the browser
(WebGPU/WASM) and in Node. It catches what regex never can: free-text names,
places, organisations and street addresses, including all-lowercase chat text
("hej jag heter provnamn maskera"), ALL CAPS and genitive forms, because that is
how people actually type.

> **v19 release gates:** span F1 **96.9%** on curated (1/205 leaks), **100.0%**
> label-agnostic span F1 on the revised synthetic ADR set (0/57 leaks),
> **81.7%** on the LinkedIn-style set (0/53 leaks; re-measured 2026-08-10),
> and **96.94%** rare-surname masked recall (q4; release measured 2026-08-06). One
> canonical, dated, reproducible table:
> **[docs/BENCHMARKS.md](docs/BENCHMARKS.md)**; every other number in this
> repo defers to it.

The current v19 q4 artifact was also re-run on 2026-08-11 against KBLab's
case-robust lowermix NER model on the same 121 hand-authored synthetic Swedish
texts (211 PER/LOC/ORG entities, overlap matching). Maskera masked 211/211
with original casing and 211/211 lowercased; KBLab masked 205/211 and 187/211.
KBLab led typed F1 on original casing (89.4% vs 87.1%); Maskera led lowercase
typed F1 (85.7% vs 83.2%). This is a directional, author-coupled comparison,
not an independent ranking. The broader dated public-model comparison still
belongs to v18 and does not automatically transfer to v19. Tables, exact model
revisions, method and caveats:
[docs/BENCHMARKS.md](docs/BENCHMARKS.md). The
training pipeline and the round-by-round journey are fully reproducible: see
[`training/`](training/). Every push to this repo re-grades the published
model in CI against a gold corpus with an F1 floor and a leak-rate ceiling.

The complete products were also compared on 2026-08-14 across 258 synthetic
Swedish domain texts with 952 annotated PII strings. With one strict scorer,
Maskera v19 fully removed **933/952 (98.0%)**; LogosGuard 2.4.4 in Chrome,
Free/`Balanced`, fully removed **606/952 (63.7%)**. Partial/clear-text leaks
were 8/11 and 49/297 respectively. This author-coupled comparison does not
report precision or constitute an independent ranking; its per-document
outcomes, capture hashes, settings, encoding caveat and checksums are in
[docs/BENCHMARKS.md](docs/BENCHMARKS.md).

## Two layers, rules first

<img src="docs/layers.svg" alt="The two-layer design: input text forks into layer 1, deterministic format-aware rules for structured PII like personnummer, and layer 2, a 43 MB Swedish AI model that catches free text like names. Rules win on overlap, and the merged result is the masked output. The restore key stays on your device." width="100%">

1. **`@maskera/core`**: deterministic detectors for structured Swedish PII.
   Personnummer, samordningsnummer, organisationsnummer, phone, email,
   postnummer, bankgiro, plusgiro, IBAN, cards, IP, URL. Format checks and
   selective checksums keep look-alikes such as `2019-2024` from becoming a
   bankgiro; personnummer detection is deliberately Luhn-typo tolerant after a
   real-date check. Zero dependencies, synchronous, runs anywhere JavaScript
   runs. Anything you can regex (case ids, customer numbers) joins the same
   engine via `regexDetector`.
2. **`maskera`** (the package): everything above plus the Swedish model,
   with core fully re-exported. In the hybrid, rules win on overlap:
   structured matches are handled deterministically, and the model only fills
   the free-text gap. Its default rule set also enables the low-risk
   free-text heuristics (street `adress`, `lagenhetsnummer`), since whoever
   loads the model has free text by definition; only `regnummer` stays
   opt-in (plate shape = booking-code shape).

Rules alone when inputs are structured-ish; add the model when users type
free text. That split is the design: regex for what regex is good at, ML only
for what it is needed for.

For clinical text, select the built-in profile so measurements, medication
doses and common care terms stay useful while deterministic PII rules remain
active:

```ts
const result = await redactWithNer(journalText, {
  recognizer,
  profile: "clinical",
})
```

Omit `profile` for the general default. The clinical profile is deliberately
not global because domain precision policies trade some model recall for
utility.

## Use it before an LLM call

Redact on the way in, restore on the way out. The LLM never sees real data,
your code still gets real answers:

```ts
const { text: safePrompt, restore } = await redactWithNer(userInput, { recognizer })
const answer = await llm(safePrompt) // OpenAI / Anthropic / Vercel AI SDK, any
const result = restore(answer)       // placeholders back to real values, locally
```

Placeholders are **stable**: the same value always maps to the same token, so
the model can reason about `[NAMN_1]` consistently. The same one-liner works
before logging: `logger.info(redact(msg).text)`. Runnable example:
[`examples/llm-roundtrip.ts`](examples/llm-roundtrip.ts).

## Packages

| Package | Status | What it does |
| ------- | ------ | ------------ |
| [`@maskera/core`](packages/core) | ✅ ready | Zero-dep detectors + redact/restore engine |
| [`maskera`](packages/ner) | ✅ ready | My Swedish model via Transformers.js |
| `@maskera/node`, `@maskera/react` | ⏳ on demand | Wrappers, built when users ask |

Full API docs live in the package READMEs. For thresholds, self-hosting the
model, fallback patterns and an operational checklist, read
**[docs/PRODUCTION.md](docs/PRODUCTION.md)**.

## Live demo

Live at **[maskera.dev](https://maskera.dev)**: redaction as you type, with
curated Swedish scenarios (HR, kundsupport, vård, juridik, kommun) showing
exactly what the AI receives. The model loads in the background; rules work
instantly meanwhile. Run it locally:

```bash
pnpm install && pnpm demo   # http://localhost:5180
```

## Honesty & transparency

maskera is **defense in depth, not a compliance guarantee**. The rule layer
is deterministic; the model catches most free-text PII but no model is
perfect. The canonical numbers and their caveats live in
[`docs/BENCHMARKS.md`](docs/BENCHMARKS.md), and
[`docs/TRANSPARENCY.md`](docs/TRANSPARENCY.md) documents exactly what runs
where: 100% on-device, the only network calls are one-time fetches of the
model and the WASM runtime (never your text), and self-hostable. The published
v18 training sources remain documented as historical provenance. Published
v19 passed every defined release gate using 64,000 generated training rows and
4,760 disjoint validation rows, with
structured-identifier rejection and exact data/code hashes in a privacy
attestation. On the revised synthetic ADR set it covers all 57 gold spans
exactly with zero leaks, including all 35 marked addresses; one organisation is
typed ADDRESS, so labeled F1 is 96.5%. The complete release snapshot,
scope, and separate KB-BERT pretraining caveat are documented in
[`docs/BENCHMARKS.md`](docs/BENCHMARKS.md) and
[`docs/TRAINING_DATA_PROTECTION.md`](docs/TRAINING_DATA_PROTECTION.md).

For DPOs, security teams and legal reviewers there is a whitepaper covering
architecture, privacy model, training data, measured quality and GDPR
positioning: **[maskera.dev/whitepaper.pdf](https://maskera.dev/whitepaper.pdf)**
(LaTeX source in [`docs/whitepaper/`](docs/whitepaper/), rebuilt with
`node scripts/build-whitepaper.mjs`, requires `brew install tectonic`;
numbers always defer to [`docs/BENCHMARKS.md`](docs/BENCHMARKS.md)).

## Development

```bash
pnpm install
pnpm build && pnpm test
pnpm lint                  # biome
pnpm smoke                 # pack tarballs, install fresh, test ESM+CJS
pnpm eval                  # grade the published model against the gold corpus
pnpm eval:domain           # hybrid pipeline on the tracked synthetic domain corpus
pnpm eval:domain:clinical  # same corpus with the clinical precision profile
```

CI runs all of the above on every push, including the general and clinical
domain gates, plus the package smoke on the declared minimum Node version and
a weekly canary against the live Hub artifact that opens an issue if anything
drifts. Roadmap:
[`docs/ROADMAP.md`](docs/ROADMAP.md).

## License

Code: MIT © Joel Hägvall. Model weights: MIT (base model KB-BERT is CC0,
National Library of Sweden). See [`packages/ner/NOTICE`](packages/ner/NOTICE).

Maskera is developed and maintained by
[Hägvall Labs AB](https://hagvall-labs.com) (Stockholm, Sweden,
reg. no. 559598-0110).
