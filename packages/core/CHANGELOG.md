# @maskera/core

## 0.3.4

### Patch Changes

- npm homepage now points at maskera.dev; drop the stale @maskera/ner rename note from the README

## 0.3.3

### Patch Changes

- README: link the whitepaper for DPOs/security teams, sync benchmark numbers with docs/BENCHMARKS.md (2026-07-04)

## 0.3.2

### Patch Changes

- A custom `placeholder()` that ignores the index could map two values to one
  token and silently corrupt `restore()`; the engine now throws a clear error
  instead.
- The plusgiro detector no longer matches single-digit bodies: one in nine
  digit-dash-digit pairs ("punkt 3-4", match scores) is Luhn-valid by chance
  and was over-masked. Minimum is now two digits before the dash.

## 0.3.1

### Patch Changes

- The phone detector matches the e-mail-signature style `+46(0)70-123 45 67`
  (parenthesized trunk zero after the country code), found leaking in an
  npm-user-input stress test. Negative guards unchanged: years, reference
  numbers and longer digit runs are still rejected.

## 0.3.0

### Minor Changes

- 42577d2: New opt-in Swedish heuristic detectors: `adress` (street addresses like "Sankt Eriksgatan 12B"), `lagenhetsnummer` ("lgh 1203") and `regnummer` (registration plates, with currency amounts like "SEK 100" excluded). Exported individually and as the `heuristicDetectors` bundle. They are format-based with no checksum, so `defaultDetectors` is unchanged; enable them with `detectors: [...defaultDetectors, ...heuristicDetectors]`. Previously these lived only in the demo app.

### Patch Changes

- 42577d2: Three detector fixes found by stress-testing with real user input: the `EMAIL` regex now matches addresses with å/ä/ö ("åsa.öberg@example.se" was previously split and partially leaked), the `PHONE` regex no longer starts matching inside a longer digit run ("kundnummer 100200-3000" fired a false phone match), and the `ADRESS` heuristic covers all-caps and all-lowercase addresses ("STORGATAN 12", "björkvägen 21") so the house number is no longer left exposed when the NER model only catches the street name.

## 0.2.1

### Patch Changes

- c5dfd98: Never hand out a placeholder token that already occurs literally in the input. Previously a crafted input containing e.g. `[NAMN_1]` could collide with a generated placeholder, letting `restore()` write the real value into positions chosen by the author of the input text.

## 0.2.0

### Minor Changes

- 7662737: Initial release: Swedish-first PII detectors (personnummer, samordningsnummer,
  organisationsnummer, phone, email, postnummer, bankgiro/plusgiro, IBAN, credit
  card, IP, URL) with checksum validation, plus a redact/restore engine with
  stable placeholders and deterministic overlap resolution.
- 385f4e9: Add opt-in `@maskera/ner` package: a Transformers.js NER layer for free-text
  names/places, with `createNerRecognizer()` and
  a `redactWithNer()` hybrid. Core gains `redactFromDetections()` so external
  detection sources reuse the stable-placeholder / overlap engine.

### Patch Changes

- d127450: `@maskera/ner`: maskera's own Swedish model (`joelhagvall/maskera-sv-ner`,
  MIT, 40 MB q4) is now the default. Span reconstruction is rebuilt piece by
  piece, fixing silent drops of hyphenated names ("Karl-Gustav"), ampersand orgs
  ("H&M") and title-attached subwords ("dr Svensson").

  `@maskera/core`: the plusgiro detector now tolerates space-grouped numbers
  ("90 19 50-6") and validates the mod-10 check digit, so partial matches no
  longer leak and look-alikes no longer fire.
