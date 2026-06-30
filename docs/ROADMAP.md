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
- [x] Rampart confirmed CC BY 4.0 (commercial + redistribution + fine-tune OK)
- [x] WASM + WebGPU backends, lazy model fetch
- [x] Span reconstruction from subword tokens

### v0.6 — Swedish NER model (`training/`) — done ✅
- [x] Synthetic Swedish data generator (BIO, GDPR-safe)
- [x] Fine-tune KB-BERT (PER/LOC/ORG/ADR); structured PII stays with rules
- [x] Distill to a smaller student (DistilBERT-style, teacher-init)
- [x] ONNX export + quantization (497 MB → 82 MB int8 → 56 MB vocab-trim → 40 MB +q4)
- [x] Hand-authored Swedish eval set + benchmark harness
- [x] **Result: student 0.874 F1 vs Rampart 0.621** (overlap, out-of-template)
- [ ] Grow the eval set + second annotator + real (non-authored) text
- [x] Vocab trim 50k→16k (82→56 MB) + combined q4-matmul/int8-embed (56→40 MB)
- [ ] Smaller architecture (fewer layers / MiniLM) toward ~15 MB if needed
- [ ] Host the model and wire it as the Swedish default in `@maskera/ner`

