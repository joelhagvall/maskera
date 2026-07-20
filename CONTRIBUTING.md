# Contributing to maskera

Thanks for helping! Issues and PRs are welcome. For security reports, see
[SECURITY.md](SECURITY.md) instead.

## Setup

Requires Node >= 18 and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm build && pnpm test
pnpm lint          # biome
pnpm demo          # live demo at http://localhost:5180
```

Before opening a PR, also run what CI runs:

```bash
pnpm smoke         # pack tarballs, install fresh, test ESM+CJS
pnpm eval          # grade the published model against the gold corpus
```

## Repo layout

- `packages/core`: zero-dependency rule detectors + redact/restore engine
- `packages/ner`: the `maskera` package (hybrid rules + Swedish NER model)
- `apps/demo`: maskera.dev
- `training/`: the model training pipeline (reproducible, round by round)
- `docs/`: benchmarks, production guide, transparency, whitepaper source

## Pull requests

- Add a changeset for anything that should be released:
  `pnpm changeset` (or write `.changeset/<name>.md` by hand). Changesets are
  written in **English**; they become CHANGELOG entries verbatim.
- New detectors need tests, including negative cases (look-alikes that must
  NOT fire); checksum-validate where a checksum exists.
- Follow the [safe test-data policy](docs/TEST_DATA.md). Positive identifier
  fixtures must come from an authority-published test or fictional-use set;
  `pnpm check:fixtures` enforces the approved values.
- `docs/BENCHMARKS.md` is the single source of truth for numbers. If your
  change touches benchmark results, sync every dated snapshot (root README,
  package READMEs, HF model card, whitepaper, `apps/demo/public/llms.txt`,
  `bench/README.md`) and any maintainer-only carrier named in the repo notes
  in the same commit.

## Reporting detection misses

The most valuable contribution: a Swedish sentence where maskera leaks PII.
Open an issue with the sentence (use fake but realistic data, never real
personal data) and what should have been masked. It becomes part of the eval
corpus so the regression is gated in CI forever.
