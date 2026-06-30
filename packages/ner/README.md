# @maska/ner

> **Experimental / opt-in.** ONNX + Transformers.js NER layer for
> [maska](https://github.com/joelhagvall/maska).

The rule layer in `@maska/core` nails *structured* PII (personnummer, org-nr,
phone, …). This package adds the part regex can't do: **free-text names, places
and organisations** ("min granne Lars på våning 4"), using a small
token-classification model that runs **client-side** via Transformers.js
(WASM/WebGPU).

It's a separate package on purpose — `@maska/core` stays zero-dependency. The ML
runtime is an **optional peer dependency** you install only if you use this.

```bash
pnpm add @maska/ner @huggingface/transformers
```

## Usage

```ts
import { createNerRecognizer, redactWithNer } from "@maska/ner"

const recognizer = createNerRecognizer() // downloads the model on first use
await recognizer.ready

// Hybrid: rule detectors + NER, merged through core's placeholder engine.
const { text } = await redactWithNer("Min granne Lars bor på Kungsholmen.", {
  recognizer,
})
text // "Min granne [PERSON_1] bor på [LOCATION_1]."
```

Tune it:

```ts
createNerRecognizer({
  model: "nationaldesignstudio/rampart", // default
  device: "webgpu",                       // "wasm" | "webgpu" | "cpu" | "auto"
  minScore: 0.6,
  labelMap: (group) => (group === "AGE" ? null : group), // drop / remap entities
})
```

## Default model & attribution

The default model is **Rampart** by **National Design Studio**, a 14.7 MB 4-bit
quantized MiniLM token-classification model, licensed **CC BY 4.0**.

- ✅ Commercial use, redistribution and fine-tuning are permitted.
- ⚠️ **Attribution is required.** See [`NOTICE`](./NOTICE).

> **Swedish caveat:** Rampart is trained on Latin-script languages (EN, ES, FR,
> DE, IT, PT, NL) — **not Swedish specifically**. Swedish *names* often transfer
> well, but **measure recall on real Swedish text before relying on it**, and
> consider fine-tuning a Swedish head (CC BY 4.0 allows it). The rule layer is
> the dependable floor; this is best-effort on top.

## License

Code: MIT. Default model weights: CC BY 4.0 (see `NOTICE`).
