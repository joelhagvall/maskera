# Transparency & privacy

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
- **Network calls:** the NER **model file** is
  downloaded once (from the Hugging Face Hub, or your own host), and the
  Transformers.js **WASM runtime** loads from a CDN. Both are code/weights, fetched
  once and cached, **never your text.** Want zero external fetches? Self-host the
  model files and the WASM runtime; both are static assets.
- The **rule layer** (`@maskera/core`) has **no network dependency at all** and no
  model, pure functions.

## How the model was trained

- **Published v22 is the privacy-clean artifact.** Its task-specific training
  uses 176,600 generated rows and 12,440 disjoint validation rows (distilled from
  a 3-seed KB-BERT teacher ensemble into an 8-layer rank-256 student with a 24k
  WordPiece vocabulary). Historical v18
  used generated sentences plus documented, openly licensed public Swedish
  corpora; its dated comparison tables remain for transparency.
- **Structured identifiers fail closed.** Every row is rejected if it contains
  an IBAN/account-shaped value, identity or organisation number, phone, e-mail,
  URL, public IP, payment identifier, long account/card-like number, or postal
  code. Even officially reserved detector-test values are excluded from model
  training. The scanner reports categories, not the matched value.
- **Exact provenance is bound to published v22.** The data row
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
  all scripts in [`training/`](../training).

## Measured accuracy

- **Independent Swedish text (measured 2026-11-28, what maskera.dev shows):**
  across four corpora neither Maskera nor its developer wrote and absent from
  v22 training (SUC 3.0 test, SIC2 Swedish blogs, MultiCoNER v2 Swedish persons,
  and ai4privacy openpii Swedish rows; 23,980 texts), Maskera v22 q4 hid 95.3%
  of names (11,974/12,570), 91.1% of lowercase names, 96.2% of places, and 95.7%
  of street addresses and postcodes. Presidio with Swedish spaCy
  (`sv_core_news_lg`, trained on SUC 3.0) hid 72.3% / 71.4% / 97.1% / 47.0%,
  `swedish-pii` 1.2.0 hid 55.3% / 0.3% / 82.7% / 77.3%, and OpenAI Privacy
  Filter q4 ONNX hid 52.2% / 10.3% / 33.5% / 63.3%. Maskera triggered a
  detection in 5.6% of entity-free SUC + SIC2 sentences (-54.5% vs v21's 12.3%)
  versus Presidio's 2.5%. Machine results live in
  [`docs/benchmark-independent-v22.json`](benchmark-independent-v22.json).
- The public-comparison tables describe historical v18, while the current v22
  release snapshot records 100.0%
  span and labeled F1 with 0/57 leaks on the revised synthetic ADR set,
  99.3% span F1 and 1/205 leaks on curated, and 95.3% span F1 with 0/53
  leaks on the LinkedIn-style set. All defined gates pass, but these are
  synthetic or author-coupled checks, not independent universal estimates.
  A current v22 comparison re-run on 2026-11-28 against KBLab lowermix uses
  121 hand-authored synthetic Swedish texts with 211 comparable PER/LOC/ORG
  entities. Maskera q4 masked 211/211 with original casing and 211/211 lowercased;
  KBLab fp32 masked 205/211 and 187/211. Maskera led typed F1 on both original
  casing (91.6% vs 89.4%) and lowercase (89.9% vs 83.2%). The
  corpus shares Maskera's developer, so this is directional, not independent.
  A separate end-product comparison on 2026-11-28 used 258 synthetic Swedish
  domain texts with 952 annotated PII strings and one strict full-removal
  scorer. Maskera v22 fully removed 939/952 (98.6%); LogosGuard 2.4.4 in
  Chrome, Free/`Balanced`, removed 606/952 (63.7%). Partial/clear-text leaks
  were 5/8 and 49/297. This corpus is also author-coupled and not exhaustively
  annotated for precision; the canonical report records the file-encoding
  caveat, per-document outcomes and capture hashes.
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
  org-nr, …) is checked with deterministic format rules and selective
  checksums. Personnummer remains masked after a mistyped Luhn digit when its
  date shape is valid.
  Free-text names/places rely on a model and **will miss things.** Keep
  server-side controls; don't treat maskera as your only safeguard.

## FAQ

**Is my text sent away for redaction?**
No. Redaction is local. Only model weights and the runtime are fetched, never
your content.

**What was the model trained on?**
Published v22 uses only generated task sentences in Maskera's task-specific
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
