# maska

> Swedish-first, client-side PII redaction for AI apps.

**maska** ("to mask" in Swedish) detects and redacts personal data **before it
ever leaves the user's device** — before it hits an LLM, a log line, or an
analytics event. The core is zero-dependency and runs anywhere JavaScript runs:
the browser, Node, edge runtimes, React Native.

It was inspired by [Rampart](https://huggingface.co/nationaldesignstudio/rampart)
(browser-side PII redaction via a small ONNX model), but built **Swedish-first**:
personnummer, samordningsnummer, organisationsnummer, svenska telefonnummer,
postnummer, bankgiro/plusgiro and IBAN are first-class, checksum-validated
citizens — not an afterthought in a multilingual model.

```ts
import { redact } from "@maska/core"

const { text, map, restore } = redact(
  "Jag heter Anna och mitt personnummer är 19900101-0017. Maila anna@example.se.",
)

text
// "Jag heter Anna och mitt personnummer är [PERSONNUMMER_1]. Maila [EMAIL_1]."

// Send `text` to your LLM. When it answers using the placeholders, map back:
restore(llmAnswer) // -> original values re-inserted locally
```

## Why it exists

> "I want to use AI, but I don't want to send personal data to the model."

That single sentence is the whole pitch. It's the blocker for municipalities,
healthcare, insurance, law firms, HR tools, customer support, and BRF platforms.
maska turns it into one function call you run **on the client**, so the sensitive
values never travel.

- **Privacy before the LLM** — strip PII from prompts, keep the meaning.
- **PII-safe logging & analytics** — redact before you persist anything.
- **GDPR / EU AI Act posture** — data minimisation by construction.
- **Stable placeholders** — the same value always maps to the same token, so the
  model can reason about `[PERSON_1]` consistently and you can map results back.

## What's in the box

This is a pnpm monorepo. Today the published, battle-tested piece is the core:

| Package          | Status      | What it does                                          |
| ---------------- | ----------- | ----------------------------------------------------- |
| `@maska/core`    | ✅ ready    | Zero-dep Swedish PII detectors + redact/restore engine |
| `@maska/react`   | 🚧 planned  | `usePrivacyGuard()` hook + `<RedactedInput />`         |
| `@maska/node`    | 🚧 planned  | Express middleware + Vercel AI SDK / Anthropic wrapper |

See [`docs/ROADMAP.md`](docs/ROADMAP.md) for the plan, including the optional
ONNX/Transformers.js NER layer for free-text names and places.

## Install

```bash
pnpm add @maska/core
```

## Detectors

Built-in, all checksum-validated where a checksum exists:

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
import { redact, regexDetector } from "@maska/core"

const apartment = regexDetector("LAGENHETSNUMMER", /\blgh\s?\d{4}\b/gi)

redact("Bor i lgh 1203.", { detectors: [apartment] }).text
// "Bor i [LAGENHETSNUMMER_1]."
```

## API

- `redact(input, options?)` → `{ text, redactions, map, restore }`
- `restore(text, map)` → original values re-inserted
- `regexDetector(label, globalRegex, validate?)` → a `Detector`
- `defaultDetectors`, plus every detector individually
- validators: `luhnValid`, `isPersonnummer`, `isSamordningsnummer`, `isOrganisationsnummer`

## Development

```bash
pnpm install
pnpm build      # build all packages
pnpm test       # run all tests
pnpm lint       # biome
```

## A note on guarantees

maska is **defense in depth, not a guarantee**. Regex + checksums catch
structured data reliably; free-text names and addresses need the planned NER
layer, and even then no redactor is perfect. Treat it as a strong first line —
keep server-side controls too.

## License

MIT © Joel Hägvall
