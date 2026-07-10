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
- **v11 real-register round** (2026-07-10): trained on real informal Swedish
  (SUCX 3.0 sample, MASSIVE sv-SE chat register, SIC2 blogs; all CC BY 4.0).
  Lowercase leaks down 24.8% to 20.5%, the tracked chat misses ("fatima")
  fixed at the weight level, ADR eval a clean sweep (21/21 exact, 0 leaks,
  100% precision), and the lowercase gap to KBLab's lowermix closed at a
  tenth of its size. Journal: [training/README.md](../training/README.md).
- **Eval harness with teeth**: gold corpus + independent set, CI gates on every
  push (span-F1 floor, leak ceiling), weekly canary against the live Hub artifact.
- **Live demo** (`apps/demo`): fully client-side, self-hosted model/runtime/fonts,
  zero external requests, CSP-enforced.
- **Production guide**: [`PRODUCTION.md`](PRODUCTION.md).

## Done: v12, the ORG round (2026-07-10, trained, publish HELD)

The category-level gazetteer round + MultiCoNER v2 sv. Full journal with the
four takes AND the publish-hold decision in
[training/README.md](../training/README.md). The candidate
`training/student-v12-onnx` (q4, 42.7 MB) passes every gate, but a
pre-publish probe found it leaks rare decomposed surnames in the target
register where v11 masks them ("hej jag heter tjulander..." unmasked;
gold-real full leaks 1 -> 4 of 58). v11 stays live; v12's data work carries
into v13.

- [x] Category-level gazetteer (startups, multiword authorities, small-biz
      builder), eval entities excluded; MultiCoNER v2 sv converter with class
      audit (`training/convert_multiconer.mjs`).
- [x] Both v11 authority leaks fixed at the weight level (Inspektionen för
      vård och omsorg, Försvarets materielverk); lowercase probes for the
      leak categories all pass.
- [x] Best model so far on gold-real (94.7 F1), curated (97.0), klintan
      lowercase (80.6 F1, leaks 20.5% -> 19.2%).
- [x] **Root-cause find of the round**: `trim_vocab.py` at 16k cut the
      rare-name tail (bare "Löfven" regression); fixed by trimming at 20k
      (+3.1 MB). Data-level fixes were tried and measurably rejected.
- [ ] **Missed the round's cased-ORG aspiration**: klintan cased ORG recall
      fell 70.9% -> 67.7% (leaks 11.3% -> 12.5%), the third straight release
      where cased-news leaks crept up (8.4 -> 11.3 -> 12.5). Carry to v13.

## Next: v13 (hypotheses, not yet started)

- [ ] **Decomposed-surname robustness, the publish blocker: do this FIRST.**
      v12 leaks rare surnames ("hej jag heter tjulander") that v11 catches;
      the robustness was luck-of-the-mix, never designed. Plan: (1) build a
      rare-surname chat-register eval (a few hundred generated sentences,
      surnames verified to decompose, NOT reused in training) to quantify
      both models; (2) subword-dropout during distillation so the student
      trains on decomposed variants of ALL names; (3) publish gate: v13 must
      beat v11 on that eval, not just tie.
- [ ] **Short brand names** (Voi, Northmill, Knowit still leak): a LENGTH
      problem, not a category problem; more gazetteer entries will not fix
      2-4-letter brands. Needs its own idea (context weighting, or a rules
      assist in `@maskera/core`).
- [ ] **Municipal "-avdelningen" suffix** (Bygglovsavdelningen leaks): the
      AUTHORITIES list covers -nämnden/-förvaltningen/-kontoret but not
      -avdelningen; five-minute gazetteer fix, take it in any next round.
- [ ] **Reverse the cased-news ORG slide** (see above) while holding the
      lowercase wins; sweep `SUCX_SHARE` 0.35 for more cased ORG signal.
- [ ] **Flashback/Familjeliv pseudo-labeling** (Språkbanken, CC BY 4.0):
      hundreds of millions of informal tokens; label with the improved v12
      teacher + the sbx PI-detection models (GPL-3.0) as an ensemble, keep
      high-agreement sentences only. Biggest lever now that the teacher is
      stronger.
- [ ] Remaining data reserves: **ai4privacy openpii-1.5m (sv)** for ADR only
      (no ORG label: poison for ORG rounds, see the v12 notes). Dead ends
      already checked, do not re-research: SweLL (research-only),
      MultiNERD/WikiNEuRal (no Swedish), polyglot_ner (unknown license),
      Twittermix (no full-text download). No public Swedish chat/support NER
      dataset exists.

## Next: data beyond v12 (the real lever)

- [ ] **Larger independent gold set.** gold-real is ~22 sentences, and training
      on the Swedish NER Corpus made its test split in-distribution, so a fresh
      held-out set is needed just to measure honestly. Plan +
      writer brief ready: [GOLD_SET_PLAN.md](GOLD_SET_PLAN.md),
      [GOLD_SET_STAGE2_PROMPTS.md](GOLD_SET_STAGE2_PROMPTS.md).
- [ ] **Real target-domain data** (support / healthcare / legal): 300-500
      annotated support/chat messages beats any public corpus from here. The
      ingestion path is ready and validated
      (`training/convert_domain_jsonl.mjs` + `training/audit_data.mjs`,
      format in `training/domain-data.example.jsonl`); what is missing is the
      text itself. Legal, GDPR-safe starting points: donated/invented
      messages, public court rulings (Domstolsverket open data since 2025-03,
      pre-anonymized so weak for PER), municipal records.
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
