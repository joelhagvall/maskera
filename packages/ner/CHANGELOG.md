# maskera

## 0.7.2

### Patch Changes

- Fix a PII leak at the chunk seam: the dedupe could drop the head of a detected entity.

  Long input is split into overlapping chunks, so the same entity is scored twice with the model seeing different context each time, and the two spans can differ at both edges. That is what the overlap is for. The dedupe kept whichever span was longer and discarded the other wholesale, but the list is sorted by ascending start, so a longer span can still begin later. Replacing the earlier span then dropped its head.

  A name cut by a seam is exactly that shape: the left chunk tags `Anna Karlsson`, the right one tags the longer `Karlsson Bergström`, and the first name was left in the output unmasked.

  Overlapping spans are now merged to cover their union instead of one replacing the other, which is safe because they touch by definition. Gold-corpus eval is unchanged at 99.8 span-F1 with zero leaks.

## 0.7.1

### Patch Changes

- Fix an infinite recursion that made `detect()` hang forever on a 500-character input.

  `detect()` splits input that exceeds the model's token limit, preferring a whitespace position found by scanning up to 200 characters down from the middle. That preference was taken unconditionally. On a chunk that is short but token-dense, the search could land near the start, `mid - overlap` clamped to 0, and the right-hand slice came back as the whole input: the recursion had a fixed point and never returned.

  Reaching it needs no unusual size, only about 1 token per character, which is what the tokenizer produces for CJK and for long symbol runs (measured: 500 CJK characters is 502 tokens, against a 480 limit). Ordinary Latin prose runs about 4 characters per token and never gets near it.

  The failure mode is worse than a slow call. The runaway recursion floods the microtask queue, so timers never fire: nothing times out, `Promise.race` guards do not help, and a server process that hits this stops serving everything else and does not recover without a restart.

  Splitting now falls back to the exact middle whenever the whitespace position would not leave both halves strictly shorter. The split point is exported as `splitPoint` and its termination and coverage invariants are verified exhaustively across every length and whitespace layout the search can reach.

- Fix a quadratic-backtracking blowup in the NER identifier-label trim. The separator run in the pattern that strips a trailing `org.nr` / `pnr` / `nr` from a model span is now bounded to 16 characters instead of being an unbounded `+`.

  `locateGroup` skips whitespace between two pieces of one entity without a bound, so a wide gap produces a detection span that is almost entirely separators. The unanchored `[\s,;:(]+…$` then rescanned that span from every start position: `"Anna"` followed by 200,000 spaces and `"Andersson"` cost 18 seconds, essentially all of it in this one match. Text extracted from PDFs produces whitespace runs like that without anyone crafting them. The same span is now handled in well under a millisecond.

  Trimming behaviour is unchanged, including labels separated by several spaces and a comma.

## 0.7.0

### Minor Changes

- Pin the Hugging Face model download to an immutable commit and expose it as a new `revision` option.

  Transformers.js resolves `main` by default, so an already-released version of maskera ran whatever weights sat on the Hub at download time. That let a compromised Hub account swap the weights of a redaction model under every installed consumer with no npm release to notice, and meant two runs of the same maskera version could grade differently. `createNerRecognizer()` now requests the exact commit exported as `MASKERA_SV_NER_REVISION`.

  New weights therefore arrive with a maskera release rather than on their own. Pass `revision: "main"` to opt back into tracking the Hub, or any commit, tag or branch to pin elsewhere. A third-party `model` keeps the Transformers.js default, since maskera's commit sha says nothing about another repo, and the option is ignored when loading from `localModelPath`.

  Transformers.js includes the revision in its cache key, so the first run after upgrading re-downloads the model once even though the weights are identical.

### Patch Changes

- 621a502: Default Node.js NER inference to the native CPU provider while retaining automatic device selection in browsers, avoiding macOS CoreML warnings and potential resource leaks.
- Updated dependencies
  - @maskera/core@0.4.5

## 0.6.6

### Patch Changes

- 123c638: Make self-hosted model loading safe with the published Transformers.js runtime, route Yarn Plug'n'Play caches to a writable path, document the strict-PnP runtime install, report model failures accurately, and declare the supported Node.js version.
- Updated dependencies [123c638]
  - @maskera/core@0.4.4

## 0.6.5

### Patch Changes

- Docs-only patch for the maskera-sv-ner v18 model release: README benchmark
  snapshot updated to the 2026-07-19 numbers (curated 99.8% span F1 with zero
  leaks, independent real text 94.7% / 3.4% leak rate) and the self-hosting
  example now points at the `maskera-sv-ner-v18` model folder. No code change;
  the published Hub model (`joelhagvall/maskera-sv-ner`) serves the new weights
  to existing installs automatically.

## 0.6.4

### Patch Changes

- Docs-only patch: the README now embeds the two-layer architecture diagram (rules + model, maskera.dev/layers.svg). npm freezes the README at publish time, so the diagram added after 0.6.3 needs this release to show on npmjs.com. No code changes.

## 0.6.3

### Patch Changes

- Two model-independent `reconstruct()` fixes from the v16 address round:

  - Trim trailing identifier-label words (`org`, `orgnr`, `pnr`, `personnr`, `nr`)
    and their separators from entity spans: the model's ORG span could swallow
    the `org` of a following `org.nr`, leaving a dangling `.nr` outside the
    placeholder ("Kommun A, org.nr 202100-4748"). Entities that ARE such a word
    ("Org") stay intact, and spans ending in a digit never match.
  - Widen an ADDRESS span that stops at the street words to cover a bare house
    number right after it ("Anna Lindhs plats 1" previously left the "1"
    exposed), including the `nr` form and a detached A-D staircase letter.

  Verified against the shipped v15 model: extended ADR eval 35/35 masked with
  0 leaks; retention and curated numbers unchanged. Also refreshes the README's
  self-hosting example to the `maskera-sv-ner-v15` model folder.

## 0.6.2

### Patch Changes

- Documentation snapshot for the v15 model release (balanced-replay round). The published `maskera-sv-ner` weights move to the v15 artifact: gold-real forced-lowercase coverage back at the v11 level (51/58, retiring v14's documented exception), best-measured rare-surname masking (99.3%, 2/294 leaks) and PER-typing (71.4%), first zero-leak curated run (the sentence-initial "Klarna" classic fixed), and klintan-lowercase leak rate down to 13.8%. One documented exception: a single harmless over-redaction ("Festen" tagged as a person name in one distractor sentence; nothing leaks). README numbers re-synced with docs/BENCHMARKS.md (measured 2026-07-16).
- Updated dependencies [4e27289]
  - @maskera/core@0.4.3

## 0.6.1

### Patch Changes

- Refresh the README benchmark snapshot for the v14 model release (curated
  99.5% span F1, independent 95.7%, measured 2026-07-14). Weights ship via the
  Hugging Face Hub, so this is a docs-only bump to update npmjs.com.

## 0.6.0

### Minor Changes

- `redactWithNer` now defaults to `hybridDefaultDetectors` (new export): all checksum-validated rule detectors plus the free-text heuristics `adress` and `lagenhetsnummer`. Anyone calling the hybrid has free text about people by definition, and the address rule guarantees the house number ends up inside the mask even when the model's span splits it. `regnummer` stays opt-in even in the hybrid (three letters + three digits is also the shape of booking and case codes). The synchronous `redact()` in `@maskera/core` keeps the strictly checksum-validated defaults. Pass `detectors: defaultDetectors` to restore the old hybrid behavior.
- `defaultLabelMap` is now exported, and the `labelMap` contract is documented: a custom map receives the RAW model group with the BIO prefix stripped ("PER", "LOC", "ORG", "ADR") and replaces the default Swedish rename entirely. Delegate to `defaultLabelMap` to keep the `[NAMN_1]` style placeholders while remapping or dropping a group. `onProgress` is also properly typed via the new `NerProgressEvent` interface (previously `unknown`), with the event stream documented in the README, including the v4 `progress_total` events that carry the aggregate download percentage a loading bar wants.

### Patch Changes

- Updated dependencies
- Updated dependencies
- Updated dependencies
  - @maskera/core@0.4.1

## 0.5.2

### Patch Changes

- Docs-only: the self-hosting example in the README pointed at the old
  `maskera-sv-ner-v11` model folder; it now matches the shipped v13 artifact.
  npm freezes the README at publish time, so this patch release is what gets
  the fix onto npmjs.com.

## 0.5.1

### Patch Changes

- New model weights on the Hub: the v13 decomposed-surname training round
  (sha256 7505b72d). Rare out-of-training surnames in the chat register are now
  masked by design instead of by luck (96.6% vs 94.9% on the new gating eval),
  gold-real hits 93.1 labeled F1 with 1 leak of 58, the cased news leak slide is
  broken (8.7%), and ADR stays a clean sweep. The q4 download grows ~3 MB
  (20k vocabulary trim). One documented trade: lowercased encyclopedic prose
  regressed slightly (see docs/BENCHMARKS.md). README benchmark snapshots
  refreshed to the 2026-07-11 tables.

## 0.5.0

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

### Patch Changes

- Updated dependencies
  - @maskera/core@0.4.0

## 0.4.5

### Patch Changes

- 5246c2d: New v11 model weights on the Hub (real informal-register training round:
  SUCX 3.0, MASSIVE sv-SE, SIC2) and smarter span reconstruction: ADR spans now
  widen over a trailing house number ("Sveavägen 44", not just "Sveavägen") and
  PER spans over a trailing possessive s. Address eval is now a clean sweep
  (21/21 exact spans, 100% precision, 0 leaks), lowercase chat text leaks 4.3pp
  less, and the previously known "fatima" lowercase miss is fixed. Measured
  tables in docs/BENCHMARKS.md.

## 0.4.4

### Patch Changes

- npm homepage now points at maskera.dev; drop the stale @maskera/ner rename note from the README
- Updated dependencies
  - @maskera/core@0.3.4

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

- 42577d2: New opt-in Swedish heuristic detectors: `adress` (street addresses like "Påhittsgatan 12B"), `lagenhetsnummer` ("lgh 1203") and `regnummer` (registration plates, with currency amounts like "SEK 100" excluded). Exported individually and as the `heuristicDetectors` bundle. They are format-based with no checksum, so `defaultDetectors` is unchanged; enable them with `detectors: [...defaultDetectors, ...heuristicDetectors]`. Previously these lived only in the demo app.

### Patch Changes

- 42577d2: Three detector fixes found by stress-testing with real user input: the `EMAIL` regex now matches addresses with å/ä/ö ("åsa.öberg@example.com" was previously split and partially leaked), the `PHONE` regex no longer starts matching inside a longer digit run ("kundnummer 100200-3000" fired a false phone match), and the `ADRESS` heuristic covers all-caps and all-lowercase addresses ("PÅHITTSGATAN 12", "påhittsvägen 21") so the house number is no longer left exposed when the NER model only catches the street name.
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
  ("92 01 00-5") and validates the mod-10 check digit, so partial matches no
  longer leak and look-alikes no longer fire.

### Patch Changes

- Updated dependencies [7662737]
- Updated dependencies [385f4e9]
- Updated dependencies [d127450]
  - @maskera/core@0.2.0
