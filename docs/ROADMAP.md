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

### v0.3 — `@maska/react`
- [ ] `usePrivacyGuard()` hook
- [ ] `<RedactedInput />` showing "3 känsliga uppgifter skyddades"
- [ ] Restore on the client only

### v0.4 — `@maska/node`
- [ ] Express middleware: `app.use(maska())`
- [ ] Vercel AI SDK middleware + Anthropic/OpenAI client wrappers
      (`beforeLLM`, `beforeLogging`, `beforeAnalytics`)

### v0.5 — `@maska/ner` (opt-in ML)
- [ ] Transformers.js loader for an ONNX token-classification model
- [ ] Evaluate [Rampart](https://huggingface.co/nationaldesignstudio/rampart)
      as a fallback recognizer; fine-tune a Swedish NER head when we have data
- [ ] WASM + WebGPU backends, lazy model fetch

