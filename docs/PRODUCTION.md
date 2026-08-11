# Taking maskera to production

Everything you need to run maskera for real: wiring it up in the browser and
in Node, tuning, self-hosting, operational posture, and what the guarantees
actually are. For API details see the package READMEs
([core](../packages/core/README.md), [ner](../packages/ner/README.md)).

## The 30-second version

```bash
npm install @maskera/core                              # rules only
npm install maskera @huggingface/transformers          # + free-text names/places
```

Yarn 4 with strict Plug'n'Play also needs Transformers.js 4.2's undeclared
runtime import at the application level:

```bash
yarn add maskera @huggingface/transformers@4.2.0 onnxruntime-common@1.24.3
```

```ts
import { redact } from "@maskera/core"

const { text, restore } = redact(userInput)
const answer = await llm(text)      // the model never sees real PII
const result = restore(answer)      // placeholders -> real values, locally
```

That's production-usable as-is: `@maskera/core` is zero-dependency,
deterministic and synchronous. If you take the model path, `maskera`
pulls in `@maskera/core` automatically and **re-exports its entire API**, so
one import covers both layers; the `@maskera/core` imports below assume you
installed it directly. Everything else is about doing it *well*.

## Architecture: which package does what

| Layer | Package | Catches | Character |
| ----- | ------- | ------- | --------- |
| Rules | `@maskera/core` | personnummer, samordningsnummer, org-nr, phone, email, postnummer, bankgiro, plusgiro, IBAN, card, IP, URL | deterministic; format-aware with selective checksums; instant |
| Model | `maskera` | names, places, organisations, street addresses in free text | best-effort ML, ~ms per sentence once warm |

Use rules alone when your inputs are forms or structured-ish text. Add the
model when users type free text (chat, support tickets, journal notes),
because that's where "min granne Provnamn på våning 4" lives. In the hybrid,
**rules win on overlap**: a model detection that overlaps a rule detection is
dropped, so the deterministic layer is always authoritative.

## Wiring it up

### Server-side (Node), the most common shape

Redact before the LLM call and before anything is persisted:

```ts
import { createNerRecognizer, hybridDefaultDetectors, redact, redactWithNer } from "maskera"

// Module scope: create ONCE per process, not per request.
const recognizer = createNerRecognizer({ device: "cpu", dtype: "q8" })

export async function safeCompletion(userInput: string) {
  const { text, restore } = await redactWithNer(userInput, { recognizer })
  const answer = await llm(text)
  return restore(answer)
}
```

- The recognizer downloads the model (~43 MB) on first use and caches it. The
  download is pinned to an immutable Hub commit (`MASKERA_SV_NER_REVISION`), so
  a given maskera version always runs the weights it was benchmarked against and
  the Hub cannot change them underneath you. New weights arrive when you upgrade
  the package; `revision: "main"` opts into always-latest instead.
- All published benchmark numbers are measured on `q4`, the default. If you
  pin `q8` as above, validate accuracy and latency on your own data.
  Await `recognizer.ready` at startup if you want to pay that cost at boot
  instead of on the first request.
- Inference is CPU-bound and synchronous inside the ONNX runtime. At high
  concurrency, consider a small worker pool or accept the queueing; a warm
  call is single-digit milliseconds for chat-sized messages.
- If the model layer ever fails (network, runtime), **fall back to rules,
  never to raw text**:

```ts
let result
try {
  result = await redactWithNer(userInput, { recognizer })
} catch {
  // rules always work; hybridDefaultDetectors keeps the same rule set
  // (incl. the address heuristics) the hybrid was running
  result = redact(userInput, { detectors: hybridDefaultDetectors })
}
```

### Browser

Same API. The model runs on WebGPU when available, WASM otherwise. Load it in
the background at page load and run rules-only until it's ready; that's what
the [demo](../apps/demo) does, so there is never a blank wait:

```ts
const recognizer = createNerRecognizer({
  onProgress: (p) => updateLoadingBar(p), // ~43 MB, one time, then cached
})
```

Hub downloads forward native per-file and aggregate progress. A self-hosted
model defaults to coarse 0/100 events because Transformers.js 4.2 can otherwise
start an uncancelled full-file metadata GET beside the real ONNX download.

### Logging & analytics

```ts
logger.info(redact(message).text)
```

Rules-only is usually right for logs: synchronous, deterministic, no model
warm-up in the hot path. Never log the `map` (it contains the original
values), and never persist it next to the redacted text, or the redaction is
decorative.

## Tuning

### Placeholders

The default is `[LABEL_N]`. The same value always gets the same token within
a call, so an LLM can reason about `[NAMN_1]` consistently. Customize if
your downstream expects a different shape:

```ts
redact(input, { placeholder: (label, i) => `<pii type="${label.toLowerCase()}" id="${i}"/>` })
```

### Custom detectors

Anything you can regex (customer numbers, case ids, internal identifiers):

```ts
import { redact, regexDetector, defaultDetectors } from "@maskera/core"

const caseId = regexDetector("ARENDENUMMER", /\bAR-\d{6}\b/g)
redact(input, { detectors: [...defaultDetectors, caseId] })
```

Pass a `validate` function to kill false positives, the same way checksum-backed
built-ins such as bankgiro and plusgiro do. Personnummer detection deliberately
uses a real-date shape without requiring Luhn so a mistyped control digit is
still protected; strict validators remain available separately.

### Model threshold (`minScore`)

Default 0.5. For a privacy tool the asymmetry matters: a false positive
over-masks a word, a false negative leaks PII. Lean toward recall (lower
threshold) unless over-masking demonstrably hurts your UX. Measure before
changing: the eval harness (below) tells you what a threshold does to leaks.

### Clinical precision profile

Journal workflows can preserve common measurements, medication doses and
unambiguous care terms without changing model weights. The opt-in filter never
drops deterministic rule detections:

```ts
import { redactWithNer } from "maskera"

await redactWithNer(journalText, {
  recognizer,
  profile: "clinical",
})
```

Keep it domain-scoped. It deliberately trades some model recall for clinical
utility and is therefore not the global default.

### Word denylist (`denylist`)

The model can confidently tag a common word that sits where a name usually
sits ("Kund Provnamn ...", "Mail: ...", "betalning till bankgiro ..."), and a
score threshold does nothing against a 0.99 false positive. The recognizer
therefore drops any detection whose whole surface form (case-insensitive) is
on a denylist of Swedish role/contact/payment words and unambiguous generic
modifiers/service nouns. Multi-word entities are never affected. Extend it
with the vocabulary of your own domain:

```ts
createNerRecognizer({ denylist: [...DEFAULT_DENYLIST, "boende", "vårdnadshavare"] })
```

Pass `null` to disable the filter. Keep your additions to words that can
never be a name on their own; "Björk" is a real surname, "bankgiro" is not.

### Label filtering

Only care about people, not places? Drop labels in the recognizer:

```ts
createNerRecognizer({ labelMap: (g) => (g === "PER" ? "NAMN" : null) })
```

## Self-hosting the model (no Hub dependency)

The model is static files. For air-gapped or compliance-sensitive setups,
serve them from your own origin and forbid remote fetches:

```ts
createNerRecognizer({
  model: "maskera-sv-ner-v19", // version the folder name: the browser caches by URL
  localModelPath: "/models/",   // same-origin path (or a CDN reverse-proxied here)
  allowLocalModels: true,
  allowRemoteModels: false,
})
```

Copy `config.json`, `tokenizer.json`, `tokenizer_config.json`,
`special_tokens_map.json`, `vocab.txt` and `onnx/model_q4.onnx` from the
[Hub repo](https://huggingface.co/joelhagvall/maskera-sv-ner) into
`public/models/maskera-sv-ner-v19/`. Version the folder name; Transformers.js
caches by URL in the browser and never revalidates, so a renamed folder is
what gets returning visitors onto a new model. After that, nothing leaves your
infrastructure, which is the whole point of the tool. Keep `localModelPath`
same-origin; Transformers.js 4.2's tokenizer metadata path does not reliably
handle an absolute CDN base. Reverse-proxy a CDN below `/models/` instead.

The default coarse `onProgress` events keep this path safe in a stock npm
installation. Only set `nativeLocalProgress: true` when the installed
Transformers.js runtime includes a body-cancel fix for local metadata probes.

## Verifying it keeps working (the part people skip)

- **The repo's CI already gates the model**: every push runs the gold-corpus
  eval against the published Hub model with a span-F1 floor (0.90) and a
  leak-rate ceiling (0.08), and a weekly canary re-checks the live artifact
  against the latest Transformers.js and opens a GitHub issue on failure.
- **Grade it on YOUR text.** The packaged corpus is clean Swedish prose; your
  support tickets aren't. Copy
  [`packages/ner/eval/corpus-domain.template.mjs`](../packages/ner/eval/corpus-domain.template.mjs),
  fill it with a few dozen real (consented, internal) sentences, and run:

  ```bash
  CORPUS_FILE=./corpus-domain.mjs MASKERA_REMOTE=1 node packages/ner/eval/run-eval.mjs
  ```

  The number that matters is **leaks** (entities missed entirely), not F1.
- **Add misses to the corpus.** When the model misses something in real use,
  add the sentence to your domain corpus. Future model updates are then graded
  against your failure, and the CI gate catches regressions on it.

## Operational checklist

- [ ] Recognizer created once per process, `ready` awaited at boot
- [ ] Fallback to rules-only if the model layer throws
- [ ] `map` never logged, never persisted alongside redacted text
- [ ] Restore only happens client-side / on your infrastructure
- [ ] Self-hosted model files if the Hub is not an acceptable dependency
- [ ] A domain eval corpus with YOUR text, run in YOUR CI
- [ ] Human review for high-stakes flows (legal, medical, financial decisions)

## What maskera does NOT promise

maskera is **data minimisation, not a compliance guarantee**. The rule layer
is deterministic and reliable for structured Swedish PII. The model layer
catches free-text PII, but no model is perfect: unusual names, heavy
misspellings and OCR noise will sometimes get through. The current v19 release
scores 96.9% span F1 with 1/205 leaks on its curated release check and 0/53
leaks on the LinkedIn-style check. Those are synthetic or author-coupled
release gates, not an independent universal estimate; validate your own domain
locally before relying on them. Treat maskera as a strong first line, keep
server-side access controls, and don't market it as "GDPR compliance in one
line", it isn't, and I don't claim it is. See
[TRANSPARENCY.md](TRANSPARENCY.md) for exactly what runs where and what
network calls exist.

The current v19 q4 artifact was also re-run on 2026-08-11 against KBLab
lowermix fp32 on 121 hand-authored synthetic Swedish texts with 211 comparable
PER/LOC/ORG entities. Maskera masked 211/211 both with original casing and
lowercased; KBLab masked 205/211 and 187/211. KBLab led typed F1 on original
casing (89.4% vs 87.1%); Maskera led lowercase typed F1 (85.7% vs 83.2%). This
is author-coupled directional evidence, not an independent production claim.
