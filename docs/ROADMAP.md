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

## Done: v13 decomposed-surname round (PUBLISHED 2026-07-11)

Full journal incl. the pre-publish battery and the accepted
lowercase-encyclopedic trade in [training/README.md](../training/README.md)
(v13 section). Live artifact: take 4 (`student-v13d-onnx`, sha256 7505b72d).

Carried to v14: lowercase declarative-prose name frames (the accepted
regression), PER-typing of rare names in unseen frames, rotate the
rare-surname gate eval's frames + re-baseline, short brand names,
the municipal "-avdelningen" suffix (still not generalising).

- [x] **Decomposed-surname robustness, the publish blocker.**
  - [x] (1) rare-surname chat-register eval built and baselined:
        `training/eval/rare-surnames.txt` (294 sentences, 98 decomposing
        out-of-training surnames) + `packages/ner/eval/benchmark-rare-surnames.mjs`.
        Masked-at-all: v11 94.9% (15 leaks), v12 90.5% (28): confirms the hold.
  - [x] (2) subword replacement during distillation (`MASKERA_SUBWORD_DROPOUT`),
        student on trimmed-vocab tokenizations, teacher on full, word-aligned
        KL. Take 1 alone scored 84.0% (unsupervised continuation subtokens
        gave incoherent B/I chains that reconstruct() rejects); take 2 added
        continuation I- labels: 92.9%, "tjulander" caught in q4, ALL-CAPS
        leaks 8 -> 2, and record gold sets (our 97.9, gold-real 96.6 F1).
  - [x] (3) publish gate v13 > v11: **PASSED by take 4** (96.6% vs 94.9%,
        10 vs 15 leaks) after take 3's support-register frames (94.2%) and
        take 4's eval-near frames. Best model so far on everything else too:
        gold-real 98.3 F1 / 0.98 recall, klintan cased 91.2 span F1 with the
        three-release leak slide broken (8.7%), lowercase 86.3 / 15.5%
        leaks, cased ORG recall 72.5% (v11: 70.9%).
  - [x] Fresh-frame check run (2026-07-11): `--fresh` variant with 18
        disjoint frames confirms the margin is real off-frame (v13d 94.9%
        vs v11 92.2% masked). Carry-over for the next round: rotate the
        PRIMARY gate eval's frames, and fix PER-TYPING of rare names in
        unseen frames (v13d 68.7% vs v11 74.5% fresh-frame typed; masking
        is ahead, labeling lags).
- [ ] **Short brand names** (Voi, Northmill, Knowit still leak): a LENGTH
      problem, not a category problem; more gazetteer entries will not fix
      2-4-letter brands. Needs its own idea (context weighting, or a rules
      assist in `@maskera/core`).
- [ ] **Municipal "-avdelningen" suffix** (Bygglovsavdelningen leaks):
      gazetteer entries added in v13 (10 category instances), but the
      lowercase probe still misses in takes 1-2, so the suffix category has
      not generalised yet; re-check after take 3.
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
