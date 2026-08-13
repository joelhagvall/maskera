# @maskera/core

Swedish-first, **zero-dependency** PII detection & redaction. Runs in the
browser, Node, and edge runtimes. Part of
[maskera](https://github.com/joelhagvall/maskera), live demo at
[maskera.dev](https://maskera.dev).

```bash
pnpm add @maskera/core
```

```ts
import { redact } from "@maskera/core"

const { text, restore } = redact("Personnummer 19900101-2385, tel 070-174 06 58.")
text // "Personnummer [PERSONNUMMER_1], tel [TELEFON_1]."
```

## Highlights

- **Swedish-first**: personnummer and samordningsnummer are date-shape checked
  but deliberately typo-tolerant; strict Luhn validators remain available.
  Organisationsnummer and payment identifiers keep checksum validation.
- **Stable placeholders**: the same value reuses its token within a call.
- **Restore map**: map LLM output back to real values, locally.
- **Zero dependencies**, tree-shakeable, ESM + CJS + types.

## Built-in detectors

All exported individually and as `defaultDetectors`. Strong format checks and,
where false negatives are not the larger privacy risk, checksums reject common
look-alikes such as year ranges and reference numbers.

| Label                  | Matches                                | Validation            |
| ---------------------- | -------------------------------------- | --------------------- |
| `PERSONNUMMER`         | `19900101-2385`, `900101-2385`         | real date; Luhn-typo tolerant |
| `SAMORDNINGSNUMMER`    | day + 60 variant                       | real date; Luhn-typo tolerant |
| `ORGANISATIONSNUMMER`  | `202100-4748`                          | Luhn, third digit ≥ 2 |
| `EPOST`                | `anna@example.com`                     | pattern               |
| `TELEFON`              | `070-174 06 58`, `+33 6 12 34 56 78`  | Swedish or explicit `+CC` |
| `POSTNUMMER`           | `123 45`; compact `12345` only before a capitalized city or after `SE-` | pattern + context |
| `BANKGIRO`             | `991-2346`                             | Luhn check digit      |
| `PLUSGIRO`             | `92 01 00-5` (spaces tolerated)        | Luhn check digit      |
| `IBAN`                 | `SE42 8000 0890 1191 4616 8423`        | SE pattern            |
| `KORTNUMMER`          | 13-19 digits, spaces/dashes tolerated  | Luhn                  |
| `IP_ADRESS` / `URL`     | IPv4 / http(s) and `www.`-hosts        | pattern               |

Add your own with `regexDetector` (below); mix and match via
`options.detectors`.

### Opt-in heuristics

Three more Swedish detectors ship as `heuristicDetectors` (also exported
individually): `ADRESS` (`Påhittsgatan 12B`), `LAGENHETSNUMMER`
(`lgh 1203`) and `REGNUMMER` (`ABC 123`, currency amounts like `SEK 100`
excluded). They are format-based with no checksum to validate against, so
they stay out of `defaultDetectors`; enable them when free-text addresses and
plates matter more than the occasional over-redaction:

```ts
import { defaultDetectors, heuristicDetectors, redact } from "@maskera/core"

redact(text, { detectors: [...defaultDetectors, ...heuristicDetectors] })
```

`kontonummer` and `journalnummer` are separate contextual detectors. Ordinary
Swedish bank accounts and provider-specific journal identifiers have no single
checksum-backed shape, so they only match after explicit labels such as
`konto`, `kontonummer`, `journalnummer` or `journal-id`. They are exported in
`contextualDetectors`, stay out of conservative rules-only `defaultDetectors`,
and are enabled by the hybrid pipeline.

Note: the model-hybrid `redactWithNer` in the `maskera` package enables
`adress`, `lagenhetsnummer` and the context-labeled account/journal identifiers
by default (its callers have free text by definition); only the synchronous
`redact()` here keeps the structured default set.

## API

### `redact(input, options?) => RedactResult`

```ts
interface RedactOptions {
  detectors?: Detector[]                                  // default: defaultDetectors
  placeholder?: (label: string, index: number) => string // default: `[LABEL_n]`
}

interface RedactResult {
  text: string
  redactions: Redaction[]            // { start, end, value, label, replacement }
  map: Record<string, string>        // token -> original value
  restore: (text: string) => string  // bound to this call's map
}
```

### `restore(text, map) => string`

Re-inserts originals into any string containing the placeholder tokens, safe on
LLM output that reorders or quotes them.

### `regexDetector(label, globalRegex, validate?) => Detector`

Build a detector. If the regex has a capture group, group 1 is treated as the
value to redact. `validate` can reject false positives (e.g. failing a checksum).

### Validators

`luhnValid`, `isPersonnummer`, `isSamordningsnummer`, `isOrganisationsnummer`.

## Input size

`redact()` is synchronous and linear in the input size, which covers pastes,
documents and book-length text. The constant factor is worst on digit-dense
input: a megabyte of pure digits (a log dump) blocks the thread for roughly a
second per call. For documents in the megabyte class and up, split the text on
line or paragraph boundaries and redact chunk by chunk — detection is local to
each chunk, so only an identifier straddling a split point is affected.

## More

Part of [maskera](https://github.com/joelhagvall/maskera); add the
[`maskera`](https://www.npmjs.com/package/maskera) package for free-text
names/places via the Swedish NER model. For DPOs, security teams and legal
reviewers there is a whitepaper covering architecture, privacy model,
training data and GDPR positioning:
[maskera.dev/whitepaper.pdf](https://maskera.dev/whitepaper.pdf).

## License

MIT
