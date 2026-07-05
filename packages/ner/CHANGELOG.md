# maskera

## 0.4.3

### Patch Changes

- README: link the whitepaper for DPOs/security teams, sync benchmark numbers with docs/BENCHMARKS.md (2026-07-04)
- Updated dependencies
  - @maskera/core@0.3.3

## 0.4.2

### Patch Changes

- Leak/crash fix: inputs past BERT's 512-token positional limit crashed the
  ONNX runtime and failed the whole redaction. `detect()` now splits long
  input at whitespace with an overlap, re-offsets the detections and dedupes
  the seam; verified against the real model up to 20k characters.
- Leak fix: `toLowerCase()` can change string length (Turkish İ), which made
  every position drift and silently dropped entities ("İlker Aydın" leaked).
  Matching now uses position-stable lowercasing.
- Leak fix: a model span that merely touched a rule span was dropped
  wholesale, so a name glued to an e-mail local-part leaked. `redactWithNer`
  now clips the rule intervals out of the span and keeps the remnants
  (keyword remnants like "IBAN" are denylist-filtered).
- Single-character model detections are dropped (the model tags "Q" in "Q3"
  as ORG, mangling the word).
- `DEFAULT_DENYLIST` gains time words and transport/tech nouns (imorgon,
  idag, buss, ip, ...) observed as false positives in stress tests.
- Updated dependencies: @maskera/core@0.3.2.

## 0.4.1

### Patch Changes

- Leak fix: `reconstruct()` widens a span over a trailing possessive s, so a
  capitalized full-name genitive ("Anna Karlssons journal") is masked instead
  of dropped. The vocab-trimmed model stops one character short of the s and
  the whole-word guard used to reject the whole span. Prefixes of genuinely
  different words ("Lars" inside "Larssons") are still rejected.
- `DEFAULT_DENYLIST` gains greetings and sign-offs (hej, hejhej, hejsan,
  tjena, tjenare, halloj, goddag, mvh, hälsningar): chat text puts them in
  name position and the model can tag them as PERSON.
- Updated dependencies: @maskera/core@0.3.1 (the +46(0) phone format).

## 0.4.0

### Minor Changes

- 42577d2: New opt-in Swedish heuristic detectors: `adress` (street addresses like "Sankt Eriksgatan 12B"), `lagenhetsnummer` ("lgh 1203") and `regnummer` (registration plates, with currency amounts like "SEK 100" excluded). Exported individually and as the `heuristicDetectors` bundle. They are format-based with no checksum, so `defaultDetectors` is unchanged; enable them with `detectors: [...defaultDetectors, ...heuristicDetectors]`. Previously these lived only in the demo app.

### Patch Changes

- 42577d2: Three detector fixes found by stress-testing with real user input: the `EMAIL` regex now matches addresses with å/ä/ö ("åsa.öberg@example.se" was previously split and partially leaked), the `PHONE` regex no longer starts matching inside a longer digit run ("kundnummer 100200-3000" fired a false phone match), and the `ADRESS` heuristic covers all-caps and all-lowercase addresses ("STORGATAN 12", "björkvägen 21") so the house number is no longer left exposed when the NER model only catches the street name.
- Updated dependencies [42577d2]
- Updated dependencies [42577d2]
  - @maskera/core@0.3.0

## 0.3.0

### Minor Changes

- Package renamed from `@maskera/ner` to `maskera`. Same code, same API, same
  model: only the install and import name change. `@maskera/ner` is deprecated
  on npm with a pointer here; `@maskera/core` (the zero-dependency rule layer)
  keeps its name and remains fully re-exported from this package.
- New `denylist` option on `createNerRecognizer` (default: `DEFAULT_DENYLIST`):
  drops detections whose whole surface form is a common Swedish
  role/contact/payment word ("kund", "mail", "maila", "bankgiro", ...), which
  the model can otherwise tag as PER/ORG with high confidence in name-like
  positions. Pass your own list to extend it or `null` to disable.

## 0.2.1

### Patch Changes

- dd4da3c: Docs refresh: the README now states that `@maskera/core` comes along automatically and is fully re-exported (one install, one import), and quotes the canonical exact-span benchmark numbers with a link to docs/BENCHMARKS.md.
- Updated dependencies [c5dfd98]
  - @maskera/core@0.2.1

## 0.2.0

### Minor Changes

- 5169dca: Re-export the entire `@maskera/core` API from `@maskera/ner`. One install and one import is now enough for the full setup: `redact`, `restore`, all detectors and validators are importable directly from `@maskera/ner`, and `@maskera/core` is pulled in automatically as a dependency. Installing `@maskera/core` on its own remains the zero-dependency, rules-only path.

## 0.1.0

### Minor Changes

- 385f4e9: Add opt-in `@maskera/ner` package: a Transformers.js NER layer for free-text
  names/places, with `createNerRecognizer()` and
  a `redactWithNer()` hybrid. Core gains `redactFromDetections()` so external
  detection sources reuse the stable-placeholder / overlap engine.
- d127450: `@maskera/ner`: maskera's own Swedish model (`joelhagvall/maskera-sv-ner`,
  MIT, 40 MB q4) is now the default. Span reconstruction is rebuilt piece by
  piece, fixing silent drops of hyphenated names ("Karl-Gustav"), ampersand orgs
  ("H&M") and title-attached subwords ("dr Svensson").

  `@maskera/core`: the plusgiro detector now tolerates space-grouped numbers
  ("90 19 50-6") and validates the mod-10 check digit, so partial matches no
  longer leak and look-alikes no longer fire.

### Patch Changes

- Updated dependencies [7662737]
- Updated dependencies [385f4e9]
- Updated dependencies [d127450]
  - @maskera/core@0.2.0
