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

- **No collected personal data in training.** The Swedish NER model was trained
  on template-generated synthetic sentences (`training/generate_data.mjs`) plus
  six public, openly licensed (CC BY 4.0) corpora of already-published text:
  the [Swedish NER Corpus](https://github.com/klintan/swedish-ner-corpus)
  (news), [SUCX 3.0 NER](https://huggingface.co/datasets/KBLab/sucx3_ner)
  (balanced genres),
  [MASSIVE sv-SE](https://huggingface.co/datasets/AmazonScience/massive)
  (chat-register utterances),
  [SIC2](https://spraakbanken.gu.se/resurser/sic2) (informal blog text),
  [MultiCoNER v2 sv](https://huggingface.co/datasets/MultiCoNER/multiconer_v2)
  (lowercase wiki sentences) and a pseudo-labeled sample of Flashback /
  Familjeliv forum text ([Språkbanken](https://spraakbanken.gu.se/resurser)
  research corpora): **no user data, nothing scraped by us, nothing collected
  for this project.** All corpus text was previously published under an open
  license; the synthetic generator is in the repo, so you can read exactly
  what it produces.
- **Base model:** `KBLab/bert-base-swedish-cased` (National Library of Sweden),
  public domain (CC0). Fine-tuned, then distilled to a smaller student.
- **The whole pipeline is reproducible**: data → train → distill → ONNX → eval are
  all scripts in [`training/`](../training). Nothing is hidden.

## How good is it, really

- Benchmarked openly on a hand-authored set **and** independent real text.
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
Template-generated synthetic sentences (`training/generate_data.mjs`) plus six
public, openly licensed (CC BY 4.0) corpora of already-published text: news,
balanced genres, chat-register utterances, blog and forum text (see the full
sourced list above and on the
[model card](https://huggingface.co/joelhagvall/maskera-sv-ner)). No user
data, nothing collected for this project.

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
