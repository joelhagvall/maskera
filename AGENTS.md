# maskera: repo notes

## Git workflow

ALWAYS work directly on `main` in this repository. NEVER create `codex/`,
`agent/`, feature or other task branches unless the user explicitly reverses
this rule. When asked to commit and push, commit on `main` and push to
`origin/main`. Do not open a PR as a substitute for pushing `main`.

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

# 3. Verify, then commit and push the bump BEFORE publishing
pnpm build && pnpm test
git add -A && git commit -m "release: ..." && git push

# 4. Publish (builds first, then changeset publish per package)
pnpm release

# 5. Verify that every generated tag points at the committed version bump,
#    then push the tags
git show <tag>:packages/<package>/package.json
git push origin --tags
```

Gotchas:

- Changesets are written in ENGLISH. They become CHANGELOG entries verbatim
  and the published changelogs are English; Swedish commit messages and demo
  copy do not extend to `.changeset/*.md`. Detector names (`postnummer`,
  `adress`, ...) stay as-is since they are code identifiers.
- `pnpm release` must run in an interactive terminal: npm 2FA opens a
  browser auth flow on publish. It fails from non-interactive shells,
  so the human runs this step, not the agent.
- Never publish an uncommitted version bump. Changesets creates tags from the
  current commit; publishing first can leave a release tag pointing at the
  preceding package version. Push release tags only after checking the tagged
  package.json contains the version named by the tag.
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
`apps/demo/public/llms.txt`, `bench/README.md`, and `docs/FORSTA_MODELLEN.md`
(gitignored, so it only exists in a local checkout; sync it there when you
have it).
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

IMPORTANT: any commit to the Hub repo, including a card-only `hf upload`,
moves its head sha, and npm consumers are pinned to a sha. A model publish is
therefore not done until BOTH pins are updated in the same sitting, or users
keep downloading the old weights (or, worse, a sha that no longer resolves):

- `MASKERA_SV_NER_REVISION` in `packages/ner/src/index.ts` (the Hub commit
  sha; read the new one from
  `curl -s https://huggingface.co/api/models/joelhagvall/maskera-sv-ner | jq -r .sha`).
  This one only reaches users through an npm release, so a weight change means
  a changeset and `pnpm release`, not just an upload.
- The per-file sha256 map in `apps/demo/scripts/fetch-model.mjs` (what the
  demo build verifies), plus `onnxBytes` in `apps/demo/src/model-meta.json`.

## Copy coupling with app.maskera.dev

app.maskera.dev is built from the sibling repo `maskera-cloud` (private,
checked out next to this one at `../maskera-cloud`). The two are coupled in
both directions: this repo quotes prices, claims and self-service status that
maskera-cloud owns, and maskera-cloud quotes this repo's benchmark numbers,
model size and CPU baseline. So a change to either side is only half done
until the other repo is grepped and updated in the same sitting. maskera-cloud
has its own CLAUDE.md with the standing rules for that side; read it before
touching anything that crosses the two.

The "För företag" page (`apps/demo/src/components/Services.tsx`) repeats
Gateway prices, the model size, the CPU baseline and the self-hosted data-flow
claims that app.maskera.dev owns. When prices or claims change on either side,
update the other in the same sitting. Do not reintroduce hosted masking as a
future, dormant or fallback offer.

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
  without a release. The demo site itself shows the Swedish pair
  `apps/demo/public/layers-sv.svg` / `layers-sv-dark.svg` (light/dark,
  swapped on the theme toggle's data-theme attribute); both are DERIVED
  from layers.svg and must be re-derived when layers.svg changes.
- LinkedIn drafts (`docs/LINKEDIN_POST*.md`) are gitignored on purpose;
  don't try to commit them.
- Lint is biome: `pnpm lint`.
