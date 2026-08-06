# Guard API design (`@maskera/ai`)

Status: design proposal, nothing here is built yet.
Owner: Joel. Written 2026-07-10.

## Why this layer exists

Today maskera exposes one-shot primitives: `redact()` / `redactWithNer()`
return `{ text, redactions, map, restore }`. That is the right engine, but it
models a single string, not the thing customers actually buy: **the lifecycle
of an LLM call**. The gap between "library that finds spans" and "middleware
you build your AI app on" is exactly four features:

1. **protect/restore as a paired lifecycle**, not two functions the caller
   has to wire together correctly.
2. **Session-stable pseudonymization**: "Anna" must become the same
   `[NAMN_1]` in message 7 as in message 1, or the LLM loses the thread of
   a support conversation.
3. **Policies**: the same text needs different treatment depending on whether
   it is going to a chat model, an embedding index, or a log line.
4. **Adapters** for the SDKs people already use, so integration is one wrapper
   instead of a custom pipeline.

The positioning follows from this: detection quality is the moat we prove with
the bench; the guard API is what makes maskera infrastructure instead of a
utility. A developer should understand the whole product from one code block
in 20 seconds.

## Package layout

New package `@maskera/ai`, thin, depending on `maskera` (which already
re-exports `@maskera/core`). Rules-only mode must work without the model peer
dep installed, same trick `maskera` uses with `@huggingface/transformers` as
an optional peer. No new detection code lives here; this package only
composes the engine.

Why not fold it into `maskera`? Because the guard layer will grow adapter
surface (AI SDK versions, framework types) that should never bloat or
destabilize the detection package, and because "install `@maskera/ai`, wrap
your LLM call" is the story we want on npm.

## The core API

```ts
import { createGuard } from "@maskera/ai"

const guard = createGuard({
  locale: "sv-SE",              // reserved; only sv-SE at launch
  policy: "chat",               // preset name or inline Policy object
  mode: "hybrid",               // "rules" (no model) | "hybrid" (rules + NER)
})

// One-shot use, mirrors today's redactWithNer but pairs the lifecycle:
const p = await guard.protect(userInput)
p.text        // "Hej, jag heter [NAMN_1] och bor på [ADRESS_1]..."
p.entities    // Redaction[] (start/end/label/value/replacement), for audit/UI
const answer = await llm.generate(p.text)
p.restore(answer)  // placeholders back to real values, ONLY those in p's map
```

`protect()` is async even in rules mode so switching modes is never a
breaking change. `restore()` is sync (string replacement over a local map).

### Sessions: stable pseudonyms across a conversation

```ts
const session = guard.session()

const m1 = await session.protect("Hej, Provnamn Maskera här igen")
const m2 = await session.protect("Provnamn vill ändra sin adress")
// both messages: "Provnamn Maskera" -> [NAMN_1], and bare "Provnamn" in m2
// maps to the same [NAMN_1] because the session remembers values it has
// seen (exact match first, then case-insensitive prefix/subset match for
// name parts).

session.restore(llmOutput)  // restores against the whole session map
session.map                 // Record<placeholder, value>, serializable
guard.session({ map })      // rehydrate from storage to continue later
```

Design decisions:

- The session keeps a value-to-placeholder index so repeated entities get
  repeated placeholders. This is what "stabil pseudonymisering över en hel
  konversation" means concretely, and no competitor's local tier does it.
- The subset-matching rule (bare "Provnamn" after "Provnamn Maskera") ships behind
  `sessionMatching: "strict" | "names"` (default `"names"`) because it is a
  heuristic and must be switch-off-able.
- `session.map` is plain JSON on purpose: the caller decides where it lives
  (memory, redis, encrypted column). maskera never persists anything itself.

### Policies: decisions, not just detections

A policy answers "what happens to each label in this destination", which is
the layer between a model that finds spans and a company that needs decisions:

```ts
interface Policy {
  detect?: { include?: PiiLabel[]; exclude?: PiiLabel[] }  // default: all
  actions: Partial<Record<PiiLabel, "tokenize" | "mask" | "drop">> & {
    default: "tokenize" | "mask" | "drop"
  }
  allowlist?: Array<string | RegExp>   // never treat as PII (product names...)
  blocklist?: Array<string | RegExp>   // always mask, even if no detector fires
}
```

- `tokenize`: reversible placeholder, goes in the map, restorable.
- `mask`: irreversible label token, NOT in the map (for text that must never
  round-trip, like embeddings).
- `drop`: remove the span entirely.

Presets at launch, kept deliberately few and boring:

| preset | intent | default action |
| --- | --- | --- |
| `chat` | prompt to an external LLM, answer comes back | `tokenize` |
| `embeddings` | RAG indexing, one-way by definition | `mask` |
| `logs` | telemetry/log scrubbing | `mask` |

`guard.protect(text, { policy: "embeddings" })` overrides per call, so one
guard instance serves a whole app.

### Streaming restore

LLM output arrives in chunks and a placeholder like `[NAMN_1]` WILL be
split across chunk boundaries. The naive per-chunk `restore()` corrupts
output, so streaming support is not optional polish, it is correctness:

```ts
const stream = session.restoreStream()  // TransformStream<string, string>
llmTextStream.pipeThrough(stream)
```

Implementation: buffer only when the tail of the emitted text could be a
placeholder prefix (a partial match against `/\[[A-Z_]*$/` plus the known
placeholder alphabet), flush otherwise. Worst-case held-back text is one
placeholder length, so latency cost is invisible.

### Adapters

Ship exactly one at launch: **Vercel AI SDK middleware**, because it is the
largest TS AI surface and its middleware contract
(`wrapLanguageModel({ middleware })`) cleanly exposes both prompt transform
and stream transform:

```ts
import { maskeraMiddleware } from "@maskera/ai/ai-sdk"

const model = wrapLanguageModel({
  model: openai("gpt-5"),
  middleware: maskeraMiddleware({ policy: "chat" }),
})
// prompts are protected before leaving the process, streamed output is
// restored on the way back, tool-call arguments included.
```

Everything else (raw OpenAI/Anthropic SDKs, LangChain) is served by the
generic primitive and documented as recipes, not shipped as adapters, until a
design partner asks. Adapter code is a maintenance treadmill; recipes are not.

Tool calls and agent memory matter (a tool argument is a prompt too), and the
AI SDK middleware covers the tool-call path. A dedicated agent-memory story
is explicitly out of scope for v0.

## What this is NOT

- No network calls, ever, same as core. The guard is a local layer.
- No central PII vault: `tokenize` maps live with the caller.
- No "GDPR compliance" claims in API names or docs. The vocabulary is
  risk reduction, data minimisation, policy enforcement.

## Milestones

1. **v0 (one package week):** `createGuard`, `protect`/`restore`, sessions
   with serializable maps, the three presets, allow/blocklists. Rules +
   hybrid modes. Vitest suite incl. the session-stability cases.
2. **v0.1:** `restoreStream()` + the AI SDK middleware. Demo page update:
   a live "chat through maskera" pane is the 20-second pitch.
3. **v1 (design-partner driven):** inline custom policies hardened, audit
   event hook (`onRedaction` callback so customers can log label counts
   without raw PII), docs page with recipes for OpenAI/Anthropic SDKs.

The bench (bench/) stays the quality gate: guard-level changes must not touch
detection numbers, and the session heuristics get their own eval set of
multi-turn conversations before `"names"` matching defaults on.

## Open questions

- Placeholder format: keep `[NAMN_1]` (readable, survives LLM round-trips
  well) or switch to `<NAMN_1>`? Needs an empirical check on which format
  current models preserve most reliably in output; whichever wins, the
  `placeholder` option from core carries over.
- Should `protect()` accept AI-SDK message arrays directly (protect every
  user/assistant part, skip system)? Probably yes in v0.1 with the middleware.
- Does `embeddings` masking need entity-class-preserving fake values
  (synthesize) instead of label tokens for retrieval quality? Design-partner
  question, not a guess to make now.
