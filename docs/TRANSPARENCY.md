# Transparency & privacy

maskera is a privacy tool, so it should be honest about its own workings. This is
the short version of what it does, how the model was made, and where the limits
are.

## Where your data goes: nowhere

- **Redaction runs entirely on your device** — in the browser (WASM/WebGPU) or in
  your Node process. Your text is **never sent anywhere** for redaction.
- **No telemetry, no analytics, no phone-home.** maskera makes no network calls
  with your content. You can verify this in the browser DevTools → Network tab:
  type into the demo and watch — your text triggers zero requests.
- **The network calls that *do* exist** (full honesty): the NER **model file** is
  downloaded once (from the Hugging Face Hub, or your own host), and the
  Transformers.js **WASM runtime** loads from a CDN. Both are code/weights, fetched
  once and cached — **never your text.** Want zero external fetches? Self-host the
  model files and the WASM runtime; both are static assets.
- The **rule layer** (`@maskera/core`) has **no network dependency at all** and no
  model — pure functions.

## How the model was trained (honestly)

- **100% synthetic training data.** The Swedish NER model was trained on
  template-generated sentences (`training/generate_data.mjs`) — **no real personal
  data, no scraped text, no user data.** We didn't harvest anyone's data to build a
  privacy tool. The generator is in the repo; you can read exactly what it produces.
- **Base model:** `KBLab/bert-base-swedish-cased` (National Library of Sweden),
  public domain (CC0). Fine-tuned, then distilled to a smaller student.
- **The whole pipeline is reproducible** — data → train → distill → ONNX → eval are
  all scripts in [`training/`](../training). Nothing is hidden.

## How good is it, really

- Benchmarked openly on a hand-authored set **and** an independent
  public dataset (WikiANN). Numbers and caveats are in
  [`training/README.md`](../training/README.md) — including that synthetic-eval F1
  is near-meaningless and that quality drops on out-of-domain text.
- **It is defense in depth, not a guarantee.** Structured PII (personnummer,
  org-nr, …) is caught deterministically by regex+checksum and is very reliable.
  Free-text names/places rely on a model and **will miss things.** Keep
  server-side controls; don't treat maskera as your only safeguard.

## FAQ

**Does my text leave my device?**
No. Redaction is local. Only model weights/runtime are fetched (once), never your
content.

**What was the model trained on?**
Synthetic Swedish text only — no real PII. See `training/generate_data.mjs`.

**Is this GDPR-compliant?**
maskera is a **data-minimisation tool** that helps you avoid sending PII to third
parties — that supports GDPR/EU AI Act goals. But compliance is about *your* whole
system and you remain the data controller. maskera is not a compliance guarantee and
makes no legal claims.

**Can I self-host / audit everything?**
Yes. Code is MIT and open. The model is CC0-derived and can be self-hosted. The
training pipeline is reproducible.

**Can I turn the model off and use only rules?**
Yes — `@maskera/core` works standalone with zero dependencies and zero model.

**What does it not catch?**
Non-Swedish PII, unusual free-text formulations, and anything outside its four
entity types (PER/LOC/ORG/ADR). Structured IDs are handled by rules, not the model.

**Do you collect anything from the demo?**
No. The demo is a static site with no backend and no analytics.
