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

const { text, restore } = redact("Personnummer 19900101-2385, tel 070-123 45 67.")
text // "Personnummer [PERSONNUMMER_1], tel [TELEFON_1]."
```

## Highlights

- **Swedish-first**: personnummer, samordningsnummer, organisationsnummer,
  date- and Luhn-validated, so `123456-0000` is *not* mistaken for a person.
- **Stable placeholders**: the same value reuses its token within a call.
- **Restore map**: map LLM output back to real values, locally.
- **Zero dependencies**, tree-shakeable, ESM + CJS + types.

## Built-in detectors

All exported individually and as `defaultDetectors`. Checksum-validated where
a checksum exists, so look-alikes (year ranges, reference numbers) don't fire.

| Label                  | Matches                                | Validation            |
| ---------------------- | -------------------------------------- | --------------------- |
| `PERSONNUMMER`         | `19900101-2385`, `900101-2385`         | date + Luhn           |
| `SAMORDNINGSNUMMER`    | day + 60 variant                       | date + Luhn           |
| `ORGANISATIONSNUMMER`  | `556016-0680`                          | Luhn, third digit ≥ 2 |
| `EPOST`                | `anna@example.se`                      | pattern               |
| `TELEFON`              | `070-123 45 67`, `+46 8 123 456`       | Swedish mobile + landline |
| `POSTNUMMER`           | `114 55`; compact `85231` only before a capitalized city or after `SE-` | pattern + context |
| `BANKGIRO`             | `5050-1055`                            | Luhn check digit      |
| `PLUSGIRO`             | `90 19 50-6` (spaces tolerated)        | Luhn check digit      |
| `IBAN`                 | `SE45 5000 0000 0583 9825 7466`        | SE pattern            |
| `KORTNUMMER`          | 13-19 digits, spaces/dashes tolerated  | Luhn                  |
| `IP_ADRESS` / `URL`     | IPv4 / http(s) and `www.`-hosts        | pattern               |

Add your own with `regexDetector` (below); mix and match via
`options.detectors`.

### Opt-in heuristics

Three more Swedish detectors ship as `heuristicDetectors` (also exported
individually): `ADRESS` (`Sankt Eriksgatan 12B`), `LAGENHETSNUMMER`
(`lgh 1203`) and `REGNUMMER` (`ABC 123`, currency amounts like `SEK 100`
excluded). They are format-based with no checksum to validate against, so
they stay out of `defaultDetectors`; enable them when free-text addresses and
plates matter more than the occasional over-redaction:

```ts
import { defaultDetectors, heuristicDetectors, redact } from "@maskera/core"

redact(text, { detectors: [...defaultDetectors, ...heuristicDetectors] })
```

Note: the model-hybrid `redactWithNer` in the `maskera` package enables
`adress` and `lagenhetsnummer` by default (its callers have free text by
definition); only the synchronous `redact()` here keeps the strictly
checksum-validated default set.

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

## More

Part of [maskera](https://github.com/joelhagvall/maskera); add the
[`maskera`](https://www.npmjs.com/package/maskera) package for free-text
names/places via the Swedish NER model. For DPOs, security teams and legal
reviewers there is a whitepaper covering architecture, privacy model,
training data and GDPR positioning:
[maskera.dev/whitepaper.pdf](https://maskera.dev/whitepaper.pdf).

## License

MIT
