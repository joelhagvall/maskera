# Roadmap

The thesis: become **the default privacy layer for AI apps in the Nordics** —
not "a Swedish PII model". The model is a detail; the developer experience is the
product.

## Strategy: hybrid, rules-first

```
1. Deterministic layer (shipped)   regex + checksums for structured PII
2. NER layer (planned, opt-in)     ONNX token-classification via Transformers.js
                                   for free-text names / places / orgs
```

The rules layer is fast, explainable, and offline. The ML layer fills the gap
regex can't: "Min granne Lars på våning 4". We keep ML **opt-in** so the base
package stays tiny and dependency-free.

## Milestones

### v0.1 — core (done)
- [x] Swedish structured detectors with checksum validation
- [x] Stable placeholders + restore map
- [x] Deterministic overlap resolution
- [x] ESM/CJS/types, tests

### v0.2 — coverage & DX
- [ ] More structured detectors: bank account (clearing + number), VAT, IBAN
      mod-97, coordinates, IP v6
- [ ] `confidence` scores per detection
- [ ] `redactStream()` for chat-as-you-type
- [ ] Benchmark suite + a labelled Swedish test corpus

### Framework wrappers — when demand exists (not built speculatively)

`@maskera/core` already works in React and Node today (it's just functions), so
these are **DX conveniences, not capability**. We'll build them when real users
ask — adapters for frameworks nobody uses yet is wasted surface area. If/when:

- **`@maskera/node` first** (highest real-world value — most LLM calls are
  server-side): Express middleware `app.use(maskera())`, and AI-SDK wrappers like
  `withPrivacyGuard(openai)` / `beforeLLM` / `beforeLogging`.
- **`@maskera/react`** if there's pull: `usePrivacyGuard()` hook and a
  `<RedactedInput />` showing "3 känsliga uppgifter skyddades".

### v0.5 — `@maskera/ner` (opt-in ML) — done 🧪
- [x] Transformers.js loader for an ONNX token-classification model
- [x] `createNerRecognizer()` + `redactWithNer()` hybrid (rules win on overlap)
- [x] WASM + WebGPU backends, lazy model fetch
- [x] Span reconstruction from subword tokens

### v0.6 — Swedish NER model (`training/`) — done ✅
- [x] Synthetic Swedish data generator (BIO, GDPR-safe)
- [x] Fine-tune KB-BERT (PER/LOC/ORG/ADR); structured PII stays with rules
- [x] Distill to a smaller student (DistilBERT-style, teacher-init)
- [x] ONNX export + quantization (497 MB → 82 MB int8 → 56 MB vocab-trim → 40 MB +q4)
- [x] Hand-authored Swedish eval set + benchmark harness
- [x] **Result: student 0.874 F1** (overlap, out-of-template)
- [x] **Honest benchmark vs the strong baseline** (`benchmark_competitors.py`):
      maskera matches `KB/bert-base-swedish-cased-ner` on independent text (0.92
      vs 0.92 type-aware F1) at 1/10th the size; Språkbanken PII models target a
      different task and barely fire on general PER/LOC/ORG
- [x] Grow the training set with real (non-authored) text: Swedish NER Corpus
      news split via `convert_klintan.mjs` (v6, independent gold F1 0.85 to 0.89,
      precision and recall both up where synthetic data could only trade them)
- [x] Vocab trim 50k→16k (82→56 MB) + combined q4-matmul/int8-embed (56→40 MB)
- [x] Host the model on the Hugging Face Hub (`joelhagvall/maskera-sv-ner`)
- [ ] Smaller architecture (fewer layers / MiniLM) toward ~15 MB if needed
- [x] Wire the hosted model as the Swedish default in `@maskera/ner`
      (`DEFAULT_NER_MODEL` = `joelhagvall/maskera-sv-ner`)

#### Data next steps (the real lever now)

Synthetic rounds have capped out on precision; the gains from here are data.

- [x] **Casing & morphology augmentation.** A 2026-07-03 stress test (hard
      cases now in `packages/ner/eval/corpus.mjs`) showed the model largely
      fails on all-lowercase chat text ("hej jag heter anna karlsson"), ALL
      CAPS, and genitive ("Annas"). The generator only lowercases the first
      O-token; add whole-sentence lowercase (~10-15%), occasional ALL CAPS,
      and genitive name templates. Chat-to-LLM is the core use case, and chat
      users type lowercase. Shipped in v5 (2026-07-03): gold-corpus leaks
      7 to 2, independent gold F1 0.89 to 0.94, lowercase/CAPS now handled.
- [ ] **Larger independent gold set.** gold-real is only ~22 sentences, and
      training on the Swedish NER Corpus made its test split in-distribution, so
      we need a fresh held-out gold set just to measure honestly.
- [ ] **Real target-domain data** (support / healthcare / legal), the domains
      maskera actually targets and that public news/wiki sets don't reach. Legal,
      GDPR-safe starting points: public court rulings (domstol.se), municipal
      records and agency decisions (already public documents with real entities).
- [ ] **Model-assisted annotation** to make the above affordable: pre-label with
      the current model or an LLM, then human-correct (5-10x faster than from
      scratch). `convert_klintan.mjs` is the reusable CoNLL-to-BIO ingestion path.
- [ ] **Design-partner data** under a DPA (pseudonymised) for true target-domain
      text once a pilot exists.

#### Credibility & DX (make it trustable, not just good)

The model is competitive; these turn "impressive release" into "a team can adopt
it". Do them after the eval work above, since a demo does not answer the
credibility question that a benchmark does.

- [ ] **Live demo Space** with a text box and before/after redaction, and 5 short
      examples up top (personnummer + name + company + place) so the value lands
      in 5 seconds.
- [ ] **"Why not just regex?"** section: regex nails structured PII (personnummer,
      IBAN, phone) but cannot catch free-text names/places/orgs, which is exactly
      the model's job. Spell out the split.
- [x] **Production checklist**: shipped as `docs/PRODUCTION.md` (thresholds,
      self-hosting, fallback patterns, what to log, domain eval, ops checklist).
- [ ] **Larger, messier eval** (support tickets, BRF, agency text, email, chat,
      OCR noise, lowercase, slang, misspellings) so the numbers reflect the real
      target domain, not clean prose.
