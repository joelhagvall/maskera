# Roadmap

The thesis: become **the default privacy layer for AI apps in the Nordics**,
not "a Swedish PII model". The model is a detail; the developer experience is
the product.

Forward-looking only. Current numbers live in [`BENCHMARKS.md`](BENCHMARKS.md),
the training journey in [`training/README.md`](../training/README.md), and
per-package history in the changelogs.

## Shipped

- **Rules layer** (`@maskera/core`): checksum-validated structured detectors,
  stable placeholders + restore map, deterministic overlap resolution, zero
  dependencies.
- **Hybrid model layer** (`maskera`): Transformers.js/ONNX, WASM + WebGPU,
  rules win on overlap, full `@maskera/core` re-export (one install, one import).
- **Own Swedish model** (`maskera-sv-ner`): KB-BERT fine-tuned, distilled and
  quantized to 40 MB, hosted on the Hugging Face Hub as the default.
- **Eval harness with teeth**: gold corpus + independent set, CI gates on every
  push (span-F1 floor, leak ceiling), weekly canary against the live Hub artifact.
- **Live demo** (`apps/demo`): fully client-side, self-hosted model/runtime/fonts,
  zero external requests, CSP-enforced.
- **Production guide**: [`PRODUCTION.md`](PRODUCTION.md).

## Next: data (the real lever)

Synthetic rounds have capped out; from here the gains are real text.

- [ ] **Larger independent gold set.** gold-real is ~22 sentences, and training
      on the Swedish NER Corpus made its test split in-distribution, so a fresh
      held-out set is needed just to measure honestly.
- [ ] **Real target-domain data** (support / healthcare / legal), the domains
      maskera targets and that news/wiki sets don't reach. Legal, GDPR-safe
      starting points: public court rulings (domstol.se), municipal records and
      agency decisions.
- [ ] **A messier eval** to match: tickets, email, chat, OCR noise, lowercase,
      slang, misspellings, so the numbers reflect the target domain, not clean prose.
- [ ] **Model-assisted annotation** to make the above affordable: pre-label with
      the current model or an LLM, human-correct (5-10x faster than from scratch).
      `training/convert_klintan.mjs` is the reusable CoNLL-to-BIO ingestion path.
- [ ] **Design-partner data** under a DPA (pseudonymised) once a pilot exists.

## Next: coverage & DX

- [ ] Deploy the demo publicly (the launch CTA).
- [ ] More structured detectors: bank account (clearing + number), IBAN mod-97
      validation, VAT numbers, IPv6.
- [ ] `confidence` scores per detection.
- [ ] `redactStream()` for chat-as-you-type.
- [ ] Smaller model (fewer layers / MiniLM, toward ~15 MB) if a use case
      demands it; quality starts to cost below 40 MB.

## Framework wrappers: when demand exists

`@maskera/core` already works in React and Node today (it's just functions), so
wrappers are DX conveniences, not capability. Built when real users ask, not
speculatively:

- **`@maskera/node` first** (most LLM calls are server-side): Express middleware
  `app.use(maskera())`, AI-SDK wrappers like `withPrivacyGuard(openai)`.
- **`@maskera/react`** if there's pull: `usePrivacyGuard()` and a
  `<RedactedInput />` showing "3 känsliga uppgifter skyddades".
