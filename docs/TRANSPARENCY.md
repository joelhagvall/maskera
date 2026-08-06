# Transparency & privacy

maskera is a privacy tool, so it should be honest about its own workings. This is
the short version of what it does, how the model was made, and where the limits
are.

## How your text is processed

- **Redaction runs entirely on your device**: in the browser (WASM/WebGPU) or in
  your Node process. Your text and restore map are not sent to Maskera or
  another service for redaction.
- **No telemetry in the packages, no phone-home.** maskera makes no network
  calls with your content. The demo counts anonymous, cookieless page views
  through Vercel Analytics. Analytics requests never contain anything you
  typed.
- **Hosting request data is separate from your text.** Vercel may process
  technical request data such as an IP address to deliver and protect the
  website. Your text and restore map are not included.
- **The network calls that *do* exist** (full honesty): the NER **model file** is
  downloaded once (from the Hugging Face Hub, or your own host), and the
  Transformers.js **WASM runtime** loads from a CDN. Both are code/weights, fetched
  once and cached, **never your text.** Want zero external fetches? Self-host the
  model files and the WASM runtime; both are static assets.
- The **rule layer** (`@maskera/core`) has **no network dependency at all** and no
  model, pure functions.

## How the model was trained (honestly)

- **Published v19 is the privacy-clean artifact.** Its task-specific training
  uses 64,000 generated rows and 4,760 disjoint validation rows. Historical v18
  used generated sentences plus documented, openly licensed public Swedish
  corpora; its dated comparison tables remain for transparency.
- **Structured identifiers fail closed.** Every row is rejected if it contains
  an IBAN/account-shaped value, identity or organisation number, phone, e-mail,
  URL, public IP, payment identifier, long account/card-like number, or postal
  code. Even officially reserved detector-test values are excluded from model
  training. The scanner reports categories, not the matched value.
- **Exact provenance is bound to published v19.** The data row
  counts and SHA-256 hashes are bound to the generator's code hash. Training, trimming,
  distillation, ONNX export, and publication require the resulting
  `privacy-attestation.json`; a converter append or manual edit breaks the
  manifest. See the full
  [training-data protection policy](TRAINING_DATA_PROTECTION.md).
- **Base model:** `KBLab/bert-base-swedish-cased` (National Library of Sweden),
  published under CC0. The privacy attestation covers Maskera's task-specific
  data, not the third-party checkpoint's earlier pretraining corpus. CC0 grants
  copyright permissions; it is not a GDPR determination.
- **The whole pipeline is reproducible**: data → train → distill → ONNX → eval are
  all scripts in [`training/`](../training). Nothing is hidden.

## How good is it, really

- The public-comparison tables describe historical v18, while the current v19
  release snapshot records 100.0%
  label-agnostic span F1 and 0/57 leaks on the revised synthetic ADR set,
  96.9% span F1 and 1/205 leaks on curated, and 81.0% span F1 with 0/53
  leaks on the LinkedIn-style set. All defined gates pass, but these are
  synthetic or author-coupled checks, not independent universal estimates.
  The canonical, dated numbers live in [`docs/BENCHMARKS.md`](BENCHMARKS.md);
  the round-by-round training journey and its caveats are in
  [`training/README.md`](../training/README.md), including that synthetic-eval F1
  is near-meaningless and that quality drops on out-of-domain text.
- **Known weak spots**, verified against the live pipeline: table-like dumps
  (e.g. scanned lists with surname-first columns) can leak names, and numbers
  spelled out in words ("noll sju noll …") are not caught at all, since the
  rule detectors look for digits. ALL CAPS, lowercase text, misspellings,
  chat-speak and sloppy number formats are handled.
- **It is defense in depth, not a guarantee.** Structured PII (personnummer,
  org-nr, …) is checked with patterns and, where available, checksums.
  Free-text names/places rely on a model and **will miss things.** Keep
  server-side controls; don't treat maskera as your only safeguard.

## FAQ

**Is my text sent away for redaction?**
No. Redaction is local. Only model weights and the runtime are fetched, never
your content.

**What was the model trained on?**
Published v19 uses only generated task sentences in Maskera's task-specific
training and ships exact data/audit-code hashes with its weights. The separate
KB-BERT pretraining boundary is documented in the
[training-data protection policy](TRAINING_DATA_PROTECTION.md).

**Is this GDPR-compliant?**
maskera is a **data-minimisation tool** that helps you avoid sending PII to third
parties, which supports GDPR/EU AI Act goals. But compliance is about *your* whole
system and you remain the data controller. maskera is not a compliance guarantee and
makes no legal claims.

**Can I self-host / audit everything?**
Yes. Code is MIT and open. The model is CC0-derived and can be self-hosted. The
training pipeline is reproducible.

**Can I turn the model off and use only rules?**
Yes: `@maskera/core` works standalone with zero dependencies and zero model.

**What does it not catch?**
Non-Swedish PII, unusual free-text formulations, and anything outside its four
entity types (PER/LOC/ORG/ADR). Structured IDs are handled by rules, not the model.

**Do you collect anything from the demo?**
The demo uses anonymous, cookieless page-view counts through Vercel Analytics.
Vercel may also process technical request data to deliver and protect the site.
Neither receives the text or restore map from the masking tool.
