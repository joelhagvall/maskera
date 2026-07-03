# @maskera/ner

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
