# @maskera/core

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
