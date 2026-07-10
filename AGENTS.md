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

`docs/BENCHMARKS.md` is the single source of truth. Every other file (root
README, package READMEs, HF model card, whitepaper) carries dated snapshots
that MUST be synced in the same commit as a BENCHMARKS.md update. They have
drifted before; grep for the old numbers when updating.

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

- LinkedIn drafts (`docs/LINKEDIN_POST*.md`) are gitignored on purpose;
  don't try to commit them.
- Lint is biome: `pnpm lint`.
