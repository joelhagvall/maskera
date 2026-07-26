# Security policy

maskera is a privacy tool, so we treat security reports seriously and
appreciate them.

## Supported versions

Only the latest published versions of `maskera` and `@maskera/core` on npm
receive security fixes. Please update before reporting.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately via GitHub's vulnerability reporting:
[github.com/joelhagvall/maskera/security/advisories/new](https://github.com/joelhagvall/maskera/security/advisories/new).

You can expect an acknowledgement within a few days. If the report is valid,
a fix ships as a patch release and the advisory is published once users have
had a reasonable window to update.

## Scope

In scope (examples):

- The `restore` map or original values leaking anywhere they shouldn't
  (network, storage, logs) contrary to the on-device promise in
  [docs/TRANSPARENCY.md](docs/TRANSPARENCY.md)
- Unexpected network calls from the packages beyond the documented one-time
  model/runtime fetches
- XSS or injection in the demo app at maskera.dev
- Supply-chain issues in the published npm packages or the Hugging Face
  model artifacts

Out of scope:

- **Detection quality**: the model missing a name or a rule missing an edge
  case is a quality issue, not a vulnerability. Open a regular
  [issue](https://github.com/joelhagvall/maskera/issues) instead, ideally
  with a sentence for the eval corpus (see
  [docs/PRODUCTION.md](docs/PRODUCTION.md)). maskera is documented as
  defense in depth, not a guarantee.

  A deliberate **bypass** is different and IS in scope: a construction that
  hides PII from the detectors while a human or an LLM still reads it, such as
  splitting an identifier with characters that render as nothing. Detectors run
  against a folded view of the input (invisible characters removed, NFKC
  applied) for exactly this reason. If you find a construction that survives
  that, report it privately.
- Vulnerabilities in dependencies with no exploitable path through maskera
  (report those upstream)

## Known design limits

`restore()` re-inserts real values wherever a placeholder token appears, and
the tokens are deterministic (`[PERSONNUMMER_1]`). That is the whole point of
it, but it means restoring text you do not control is a re-insertion primitive:
a prompt injection in the source document can ask the model to emit
`[PERSONNUMMER_1]` inside a URL, and `restore()` will fill in the real value.
Do not run `restore()` on output that is then fetched, rendered as HTML or
logged. Redaction protects what you send; it does not sanitise what comes back.

A placeholder that already occurs in the input is never handed out again, so
seeding `[PERSONNUMMER_1]` in the source cannot capture a real value.
