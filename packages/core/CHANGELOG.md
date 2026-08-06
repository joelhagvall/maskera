# @maskera/core

## 0.7.4

### Patch Changes

- 46efc9a: Broaden personnummer and samordningsnummer detection to mask date-shaped values even when the Luhn control digit is mistyped, and recognize international phone numbers with an explicit country-code prefix. Prefer the phone label when a Swedish phone and samordningsnummer shape overlap. Preserve the strict checksum validators as public APIs.

## 0.7.3

### Patch Changes

- Harden structured-identifier redaction and replace the default Swedish NER
  weights with the attested v19 artifact trained on generator-produced task data.
  The release documents the separate KB-BERT pretraining boundary and keeps
  customer and partner text outside the training pipeline.

## 0.7.2

### Patch Changes

- Security fixes for detection bypasses and validator gaps:

  - canonicalize() now also strips C0/C1 control characters (except \t \n \f \r),
    enclosing combining marks (\p{Me}, e.g. keycap sequences), and blank-rendered
    characters that NFKC does not fold (U+2800 braille blank, U+115F/U+1160/U+3164/
    U+FFA0 hangul fillers). Each of these split a personnummer/card/IBAN into
    pieces the detectors could not see while rendering as the real thing. The
    ASCII fast path in the fold loop is restricted to printable ASCII so the new
    ranges cannot slip through it.
  - The email detector accepts any Unicode letter/number in both parts. A
    diacritic (andré, zoë, münchen) or a Cyrillic confusable next to the @ or in
    the domain previously left no match position and the address leaked.
  - isPersonnummer/isSamordningsnummer validate the date as a real calendar date
    (per-month days, leap years; exact Gregorian rule for the 12-digit form), and
    isOrganisationsnummer requires the "16" prefix on the 12-digit form.
  - maskera: fix a potential O(span^2) slice in the identifier-label-word trim in
    reconstruct() (exported API) by searching only the 25-character tail window
    the pattern can actually match, and count the single-character detection
    filter in code points rather than UTF-16 units.

## 0.7.1

### Patch Changes

- core: Fix a redaction bypass where a U+1680 OGHAM SPACE MARK inside a digit run hid personnummer/samordningsnummer from the detectors. The character renders as whitespace but is untouched by Unicode canonicalization, so `850601\u{1680}2387` passed through unredacted while the same number with any other space was masked. The digit-run gap class now covers it.

  ner: Fix a quadratic clipping loop in `redactWithNer` that re-walked the segment list once per rule detection for every model span, blocking the event loop for seconds on documents with thousands of rule hits (measured 3.3 s on a 79 KB input). Clipping now uses single-cursor interval subtraction against the rule spans sorted once, which is linear in practice (4 ms on the same input).

## 0.7.0

### Minor Changes

- Security: see through invisible-character and compatibility-character obfuscation, and reject detections that cannot be trusted.

  Detectors match ASCII-ish shapes, which made any character that renders as
  nothing, or renders as a digit without being one, a one-character bypass of the
  whole rule layer. A personnummer split by a zero-width space, a soft hyphen, a
  word joiner, a narrow no-break space or written in fullwidth digits was reported
  as clean, while a human and an LLM tokenizer both still read the number. This
  was not only reachable by an adversary: U+00AD is what PDF de-hyphenation leaves
  behind and U+202F is what Word and typographic number formatting insert.

  Detectors now run against a canonical view of the input (invisible characters
  removed, NFKC folded) and their spans are mapped back, so `restore()` still
  round trips the original text byte for byte and `value` is always the real
  substring. Ordinary text takes an identity fast path and is unaffected.

  - `canonicalize()` and `runDetectors()` are exported from `@maskera/core` for
    callers building their own detection pipeline.
  - `redactFromDetections()` now rejects a detection whose `value` disagrees with
    its own span. Such a detection did not fail, it silently rewrote the document
    on `restore()`.
  - `redactFromDetections()` now rejects a label containing `[` or `]` when using
    the default placeholder. Such a label nests one placeholder inside another
    ("[X] [PERSONNUMMER_1_1]"), which puts the literal text of a _different_
    token into the document an LLM sees; echoing that fragment back made
    `restore()` write the real value into it. `maskera`'s own `defaultLabelMap`
    already stripped this at the source.
  - Crafted placeholder collisions no longer take quadratic time. An input seeded
    with `[EPOST_1]`..`[EPOST_N]` forced the placeholder loop to probe N indices,
    and each probe walked the list of prefix positions, so 427 kB of seeded tokens
    spent 7.7 s of blocked event loop (24 kB took 37 ms, 101 kB took 521 ms). The
    positions are now indexed by token length, which answers each probe in O(1);
    the same input takes 22 ms. Re-redacting an already redacted document hits the
    same path.

## 0.6.0

### Minor Changes

- 977c524: Security hardening of the redaction core and the NER wrapper.

  - `personnummer` and `samordningsnummer` now also match the space-separated
    form ("900101 2385", "19900101 2385"). A space where the dash goes was a
    one-character bypass of the most sensitive identifier in the set. The space
    is only accepted where the identifier's own separator sits, four digits from
    the end, so two unrelated numbers in a table never fuse into a candidate;
    detections on the eval corpora are unchanged.
  - `regexDetector` reports the capture group's real position via match indices.
    It previously looked the group text up inside the whole match, which points
    at the wrong place whenever that text also occurs earlier in the match, so a
    custom detector could mask the wrong slice and leave the value in the clear.
  - `redact()` and `restore()` no longer cost O(values x text). The placeholder
    collision check is answered per label instead of per value, and `restore()`
    is a single pass over the tokens; 4k distinct values in a 150 KB document
    went from 237 ms to a few ms.
  - `restore()` no longer substitutes inside a value it just inserted, so a value
    that contains another placeholder token survives the round trip.
  - `redactFromDetections()` rejects malformed spans instead of silently
    duplicating text, and a crafted input seeded with placeholder-shaped strings
    no longer makes redaction throw.
  - `createNerRecognizer()` rejects a `minScore` that is not a finite number in
    [0, 1]. `NaN` silently dropped every model detection, which is fail-open.
  - `defaultLabelMap` constrains an unknown model group to a placeholder-safe
    character set, so a third-party model cannot smuggle bracket syntax into the
    redacted text.
  - The whitespace skipped between two pieces of one entity is bounded, which
    also removes a slow path on text extracted from PDFs.

## 0.5.0

### Minor Changes

- Detect personnummer and samordningsnummer without relying on a word boundary, closing a one-character bypass.

  `\b` was load-bearing for these detectors, and it was trivially defeated: appending a single digit to a personnummer dropped detection from 100% to 0% on every value tested, in both the 10- and 12-digit written forms. So did prepending one, or concatenating the next value straight after it. That is a reliable way to walk Sweden's most sensitive identifier past the filter, and it also happens on its own whenever text loses its spacing, which is what PDF and OCR extraction routinely do.

  Both detectors now slide a window over every digit run and let the checksum decide, with no boundary requirement. That is only safe where the format is selective enough: personnummer and samordningsnummer also constrain month and day, which rejects about 96% of candidates before Luhn runs. Widths are tried widest-first and a match consumes its window, so a 12-digit form is never also reported as the 10-digit form inside it.

  Organisationsnummer (only "third digit >= 2" plus Luhn) and card numbers (only Luhn) deliberately keep their boundaries: scanned the same way they fire on roughly 10% of window positions, which measured at 10 false positives per 100 sentences. IBAN is already anchored on its `SE` prefix.

  Measured cost. On the project's own 251 sentences of real Swedish prose, output is identical. On 20,000 sentences of deliberately number-dense business text containing no personal identifiers (order ids, invoice numbers, transaction ids, article numbers, timestamps), false positives per 100 sentences go from 0.13 to 0.39 for personnummer and from 0.00 to 0.77 for samordningsnummer. Those are over-maskings, the safe direction for a redaction tool. Recall on the bypass shapes goes from 0% to 97-100%. The gold-corpus eval is unchanged at 99.8 span-F1 with zero leaks, and scanning stays linear: 400 KB of digits in 114 ms.

## 0.4.6

### Patch Changes

- Fix a PII leak in overlap resolution: a detection that partially overlapped another was dropped whole, leaving its remainder in the clear.

  Detectors genuinely reach across each other. Digits and `.` are e-mail local-part characters, so `4242 4242 4242 4242.anna@example.com` produces a card span and an e-mail span that starts inside it. The card won on "earliest start", the e-mail was discarded, and the entire address stayed in the output unmasked. `Ring 070-174 06 58.anna@example.com` leaked the same way, as did the tail of a phone number that a preceding URL had partly swallowed.

  Overlapping detections are now clipped to the part no earlier detection claimed, then trimmed to something meaningful, instead of being discarded. A detection wholly inside a kept one is still dropped, so a full IBAN still wins over the postnummer inside it, and spans still never overlap each other. `redactWithNer` already clipped model spans against rule spans for this exact reason; the rule layer now does the same among its own detectors.

  Measured over 400,000 generated inputs that butt identifiers against each other: 30 distinct spans were left half-masked before, none are now. Output is unchanged on all 251 sentences of the Swedish eval corpora, and the gold-corpus eval is identical at 99.8 span-F1 with zero leaks.

## 0.4.5

### Patch Changes

- Fix a quadratic-backtracking (ReDoS) blowup in the `EPOST` detector. The local-part and domain quantifiers are now bounded to the RFC 5321 maxima (64, 255 and 63 characters) instead of being unbounded, which caps how far the pattern can backtrack.

  Any long unbroken run of `[A-Za-z0-9._%+-]` with no `@` after it forced the previous pattern to rescan the run from every start position: a hex digest, a base64url blob or a JWT segment is exactly that shape. A 250 KB input took roughly 57 seconds to scan and 512 KB took nearly four minutes, so a single pasted or submitted blob could stall a browser tab or a request handler. The same input now scans in tens of milliseconds. Ordinary text was never affected, in either direction.

  Detection behaviour is unchanged for real addresses (verified against 100,000 fuzzed inputs). Only a local part longer than 64 characters differs: its trailing 64 characters are matched rather than the whole run.

## 0.4.4

### Patch Changes

- 123c638: Declare Node.js 18 as the minimum supported runtime.

## 0.4.3

### Patch Changes

- 4e27289: Replace documentation identifiers with authority-published test values and add repository-level fixture safety checks.

## 0.4.2

### Patch Changes

- Docs: replace identifier examples with source-backed test values published by Skatteverket, PTS, Bankgirot, Nordea and Swedbank. No runtime code changes.

## 0.4.1

### Patch Changes

- The postnummer detector now requires context for the compact five-digit form (a following capitalized word as in "12345 Staden", or an SE- prefix). The spaced "NNN NN" form matches as before. This stops over-masking of case numbers, order numbers, and prices ("Ärende TEST-48213" was previously masked as a postal code).
- The url detector no longer swallows trailing sentence punctuation into the redacted value: "se www.foretaget.se." now masks `www.foretaget.se` and keeps the full stop in the text. Previously the stored value was the wrong URL (`...se.`) and the masked text lost its punctuation. Dots, commas and question marks inside a path or query string still match as before.
- The url detector now catches scheme-less www addresses (`www.foretaget.se`), common in email signatures where the domain would otherwise leak the organization. Bare domains without `https://` or `www.` are still not guessed.

## 0.4.0

### Minor Changes

- Swedish placeholder vocabulary throughout. The NER layer now maps model tags
  to the same Swedish labels the rule detectors use (`PER` -> `NAMN`,
  `LOC` -> `PLATS`, `ORG` -> `ORGANISATION`, `ADR` -> `ADRESS`), and the last
  English rule labels are renamed: `EMAIL` -> `EPOST`, `PHONE` -> `TELEFON`,
  `CREDIT_CARD` -> `KORTNUMMER`, `IP_ADDRESS` -> `IP_ADRESS`.

  Breaking if you match on placeholder tokens or `label` values: redacted text
  now reads `[NAMN_1]`, `[TELEFON_1]`, `[EPOST_1]` instead of `[PERSON_1]`,
  `[PHONE_1]`, `[EMAIL_1]`. Pass your own `labelMap` / `placeholder` to keep the
  old vocabulary.

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

- The phone detector matches the e-mail-signature style `+46(0)70-174 06 58`
  (parenthesized trunk zero after the country code), found leaking in an
  npm-user-input stress test. Negative guards unchanged: years, reference
  numbers and longer digit runs are still rejected.

## 0.3.0

### Minor Changes

- 42577d2: New opt-in Swedish heuristic detectors: `adress` (street addresses like "Påhittsgatan 12B"), `lagenhetsnummer` ("lgh 1203") and `regnummer` (registration plates, with currency amounts like "SEK 100" excluded). Exported individually and as the `heuristicDetectors` bundle. They are format-based with no checksum, so `defaultDetectors` is unchanged; enable them with `detectors: [...defaultDetectors, ...heuristicDetectors]`. Previously these lived only in the demo app.

### Patch Changes

- 42577d2: Three detector fixes found by stress-testing with real user input: the `EMAIL` regex now matches addresses with å/ä/ö ("åsa.öberg@example.com" was previously split and partially leaked), the `PHONE` regex no longer starts matching inside a longer digit run ("kundnummer TEST-100200-3000" fired a false phone match), and the `ADRESS` heuristic covers all-caps and all-lowercase addresses ("PÅHITTSGATAN 12", "påhittsvägen 21") so the house number is no longer left exposed when the NER model only catches the street name.

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
  ("92 01 00-5") and validates the mod-10 check digit, so partial matches no
  longer leak and look-alikes no longer fire.
