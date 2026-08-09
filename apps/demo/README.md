# @maskera/demo

Interactive live-redaction playground for [maskera](../../README.md).

```bash
pnpm install
pnpm demo        # from repo root, opens http://localhost:5180
```

## How it works

- **Rule layer (instant, always on):** `@maskera/core` redacts structured PII
  (personnummer, org-nr, phone, email, IBAN…), deterministic and instant.
- **Swedish NER model (always on, auto-loaded):** on page load the demo
  immediately starts loading **our distilled Swedish model** (~43 MB) in the
  browser via `maskera` + Transformers.js. There is **no toggle**; the model
  is part of the product, not an opt-in. While it loads (a few seconds, cached
  afterwards), the rule layer plus a small offline name gazetteer keep redacting,
  so the demo is usable immediately; once the model is ready it takes over name /
  place / org / address detection seamlessly. If the model fails to load, the
  gazetteer fallback keeps working.

This is the hybrid maskera is built on: **rules for structured PII, model for free
text**: both run, neither is a single source of truth, and rules win on overlap.

## The model files (not committed)

The model under `public/models/maskera-sv-ner-v19/` is ~43 MB and is **gitignored**.
The quickest way to populate it is to fetch the published model from the Hub:

```bash
hf download joelhagvall/maskera-sv-ner config.json tokenizer.json tokenizer_config.json \
  special_tokens_map.json vocab.txt onnx/model_q4.onnx \
  --local-dir public/models/maskera-sv-ner-v19
```

To reproduce the published privacy-clean artifact, use the attested
release runner. Do not invoke training/export stages independently: each stage
must verify and forward the same privacy attestation.

```bash
cd ../../training
MASKERA_SEED=1337 CANDIDATE=v19-privacy-precision2 ./run_v14.sh
```

The published demo directory is `maskera-sv-ner-v19`. Do not copy an
unattested local candidate into it; releases upload the attested artifact,
pin the resulting Hub revision and file hashes, and then fetch that exact
version into the versioned demo directory.

Historical model directories may remain under `public/models/` as local
benchmark caches. `pnpm build` keeps those caches intact but prunes every
non-current model from `dist/models/`, so a local or manual deployment cannot
accidentally ship old weights.

Without these files the demo still runs; the model load reports an error and the
gazetteer fallback keeps working.

### Or use the hosted model (single source)

Once the model is published to the Hugging Face Hub (see
[`../../training`](../../training) → "Publish to Hugging Face"), point the demo at
the hosted id instead of the local copy, and then no large file lives in the repo:

```ts
import { MASKERA_SV_NER_MODEL } from "maskera"

createNerRecognizer({ model: MASKERA_SV_NER_MODEL, dtype: "q4" })
// drop localModelPath / allowRemoteModels:false, it fetches from the Hub (browser-cached)
```

`MASKERA_SV_NER_MODEL` is the one canonical id the demo and any future
React/Node packages share.

## Verification

```bash
pnpm build
pnpm test
pnpm audit:a11y          # CI gate: fails on WCAG errors
pnpm audit:a11y:review   # manual review, also prints needs-review warnings
pnpm test:model          # real model in Chromium and WebKit
```
