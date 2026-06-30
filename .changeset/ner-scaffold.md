---
"@maskera/ner": minor
"@maskera/core": minor
---

Add opt-in `@maskera/ner` package: a Transformers.js NER layer (default model
Rampart, CC BY 4.0) for free-text names/places, with `createNerRecognizer()` and
a `redactWithNer()` hybrid. Core gains `redactFromDetections()` so external
detection sources reuse the stable-placeholder / overlap engine.
