# maskera: repo notes

## Releasing to npm (the part that always goes wrong)

NEVER run `npm publish` or `pnpm publish` in the repo root. The root package
(`maskera-monorepo`) is `private: true` exactly to block that; the error
`EPRIVATE This package has been marked as private` means you tried to publish
the whole monorepo instead of the packages.

The correct flow (changesets):

```bash
# 1. Describe the change and which packages bump
pnpm changeset                    # or write .changeset/<name>.md by hand

# 2. Bump versions + changelogs (consumes the changeset files)
pnpm changeset version

# 3. Verify, then commit the bump
pnpm build && pnpm test
git add -A && git commit -m "release: ..." && git push

# 4. Publish (builds first, then changeset publish per package)
pnpm release
```

Gotchas:

- Changesets are written in ENGLISH. They become CHANGELOG entries verbatim
  and the published changelogs are English; Swedish commit messages and demo
  copy do not extend to `.changeset/*.md`. Detector names (`postnummer`,
  `adress`, ...) stay as-is since they are code identifiers.
- `pnpm release` must run in an interactive terminal: npm 2FA opens a
  browser auth flow on publish. It fails from non-interactive shells,
  so the human runs this step, not the agent.
- A 404 on `PUT .../@maskera%2fcore` from npm means bad/expired auth,
  not a missing package. Check `npm whoami`; re-login with `npm login`.
- npm freezes README and package.json (homepage etc.) at publish time.
  Changes to them need a patch release to show on npmjs.com.
- `pnpm release` only publishes versions that are not already on npm.
  "No unpublished projects to publish" means you skipped step 1-2: without
  a new changeset and `pnpm changeset version`, there is nothing to release.

## Benchmark numbers

STANDING RULE: everything is always in sync, no number, date, version or
size may drift anywhere. `docs/BENCHMARKS.md` is the single source of truth.
Every other file carrying dated snapshots MUST be synced in the same commit
as a BENCHMARKS.md update. The full snapshot-carrier list: root README,
package READMEs (also what npmjs shows; needs a patch release to update
there), HF model card (`training/maskera-sv-ner-card/README.md`; needs
`hf upload` to go live), whitepaper (rebuild the PDF), and
`apps/demo/public/llms.txt`, `bench/README.md`, `docs/FORSTA_MODELLEN.md`.
They have drifted before (llms.txt sat on 2026-07-03 numbers until
2026-07-13; bench/README.md sat on pre-v13 numbers until 2026-07-18); grep
for the old numbers when updating. Also: if an eval corpus file changes
after a measurement, note the new counts in BENCHMARKS.md in that same
commit so reproduce runs match. When asked whether docs are synced, also
diff the LIVE npm READMEs (`npm view <pkg> readme`) and the LIVE HF card
against the repo sources.

## Whitepaper

- Source: `docs/whitepaper/whitepaper.tex` (LaTeX, English).
- Build: `node scripts/build-whitepaper.mjs` (needs `brew install tectonic`),
  outputs `apps/demo/public/whitepaper.pdf` -> maskera.dev/whitepaper.pdf.
- Rebuild the PDF in the same commit as any .tex or benchmark change.

## Hugging Face model card

The card source is `training/maskera-sv-ner-card/README.md`. Card-only
updates (no weight change) go live with:

```bash
hf upload joelhagvall/maskera-sv-ner training/maskera-sv-ner-card/README.md README.md \
  --repo-type model --commit-message "docs: ..."
```

Full model publishes use `scripts/publish-model.sh`.

## Misc

- `@huggingface/transformers` 4.2.0 is patched via `pnpm patch` (see
  `patches/`) with TWO fixes. (1) Upstream PR #1664 (duplicate model
  downloads with a progress callback) - merged upstream, drop this part when
  a release after 4.2.0 ships. (2) A body-cancel in `_get_file_metadata`'s
  local-path branch: their metadata probe is a full GET of the 43 MB model
  that is never read nor canceled, and the race with the real download
  breaks model loading in fresh/incognito Chrome profiles
  (net::ERR_CACHE_WRITE_FAILURE). NOT reported/fixed upstream - this part
  must be carried forward on every transformers bump until it is, and any
  bump must be smoke-tested in a fresh Chrome context against the deployed
  site (a normal profile with disk cache hides the bug).
- `docs/layers.svg` (the two-layer architecture diagram) has a served copy
  at `apps/demo/public/layers.svg` -> maskera.dev/layers.svg, which is what
  the npm `maskera` README and the HF model card embed. Keep the two files
  identical in the same commit; the external embeds update on deploy
  without a release.
- LinkedIn drafts (`docs/LINKEDIN_POST*.md`) are gitignored on purpose;
  don't try to commit them.
- Lint is biome: `pnpm lint`.
