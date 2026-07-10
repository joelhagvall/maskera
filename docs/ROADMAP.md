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

## Next: v12, the ORG round (prepared, ready to run)

ORG is now the weakest type in both registers (70.9% recall cased, 54.6%
lowercased on the 2453-sentence set). The remaining leaks are consistent
across every eval: **startup/brand names** (Voi, Northmill on the curated
set) and **multiword authorities/institutions** (Inspektionen för vård och
omsorg, Försvarets materielverk). The v12 recipe:

- [ ] **Category-level gazetteer round**: add Swedish startups/scaleups,
      full-length authority names (Myndigheten för X, Inspektionen för Y,
      N:s materielverk patterns) and org-heavy templates to
      `training/generate_data.mjs`. NEVER add the eval entities themselves
      (Voi, Northmill, STIM, IFPI, Sveriges riksdag...): that trains on the
      gate. Category, not instances.
- [ ] **Mind the v5.1 lesson** while doing it: org names that are common
      Swedish words over-fire under lowercase augmentation. Keep the
      hard-negative counterweight (greetings, common nouns) in the same round.
- [ ] **Sweep the mix knobs against dev sets, not gold**: `SUCX_SHARE`
      (0.25 shipped; try 0.35 for more cased ORG signal), `MASSIVE_EMPTY_SHARE`,
      `LC_AUG`/`KLINTAN_LC_AUG`/`SUCX_LC_AUG` (all 0.35 shipped). Select on
      data/val.jsonl + klintan TRAIN-side dev, run gold gates ONCE on the
      winner (training/README.md documents the discipline).
- [ ] **Known misses to beat** (tracked in BENCHMARKS.md): "Klarna
      rekryterade..." (sentence-initial ORG), "VIKTIGT: RING LARS NORDSTRÖM
      OMGÅENDE IDAG." (long ALL CAPS), bare surname "Löfven".
- [ ] Ship criterion: klintan ORG recall toward 74%+ cased (v6 level) while
      holding the v11 lowercase and ADR wins, and gold-real recall >= 0.90 on
      the q4 artifact.

Verified data reserves if the gazetteer round is not enough (licenses checked
2026-07-09, converters exist for the first three sources):

- **MultiCoNER v2 sv**: 16k all-lowercase sentences, CC BY 4.0, fine-grained
  tags collapse to PER/LOC/ORG; directly targets lowercase ORG.
- **ai4privacy openpii-1.5m (sv slice)**: the only large Swedish
  STREET/ZIPCODE/CITY source, CC BY 4.0, synthetic and noisy (filter English
  dates); no ORG label.
- **Flashback/Familjeliv/Bloggmix (Språkbanken, CC BY 4.0)**: hundreds of
  millions of tokens of unannotated informal Swedish; the pseudo-labeling
  pool. Label with the teacher + the sbx PI-detection models (GPL-3.0,
  trained on SweLL gold) as an ensemble; keep only high-agreement sentences.
- Dead ends already checked, do not re-research: SweLL (research-only),
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
