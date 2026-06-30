# @maska/core

Swedish-first, **zero-dependency** PII detection & redaction. Runs in the
browser, Node, and edge runtimes. Part of [maska](https://github.com/joelhagvall/maska).

```bash
pnpm add @maska/core
```

```ts
import { redact } from "@maska/core"

const { text, restore } = redact("Personnummer 19900101-0017, tel 070-123 45 67.")
text // "Personnummer [PERSONNUMMER_1], tel [PHONE_1]."
```

## Highlights

- **Swedish-first**: personnummer, samordningsnummer, organisationsnummer —
  date- and Luhn-validated, so `123456-0000` is *not* mistaken for a person.
- **Stable placeholders**: the same value reuses its token within a call.
- **Restore map**: map LLM output back to real values, locally.
- **Zero dependencies**, tree-shakeable, ESM + CJS + types.

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

Re-inserts originals into any string containing the placeholder tokens — safe on
LLM output that reorders or quotes them.

### `regexDetector(label, globalRegex, validate?) => Detector`

Build a detector. If the regex has a capture group, group 1 is treated as the
value to redact. `validate` can reject false positives (e.g. failing a checksum).

### Validators

`luhnValid`, `isPersonnummer`, `isSamordningsnummer`, `isOrganisationsnummer`.

## License

MIT
