# Plan: a larger source-isolated synthetic evaluation set

The privacy-clean line needs a broader target-register evaluation without
retaining real messages, public prose, property addresses or record-linked
identifiers. This plan grows a 200+ sentence corpus written independently of
the training generator while keeping every scenario fictional.

## Requirements

1. **Written by other people.** Contributors receive scenario briefs, never
   generator templates or model output.
2. **Held out.** No sentence, name combination, organisation surface or
   address surface is copied into task training or vocabulary selection.
3. **Target registers.** Support/chat, legal/authority and
   healthcare-adjacent Swedish, including lowercase, typos and abbreviations.
4. **No real records.** No copied messages, public-figure prose, customer
   tickets, case facts, property designations or plausible record references.
5. **Marked addresses and sourced test identifiers.** Every address carries a
   conspicuous synthetic marker (`Maskera`, `Provdata`, `Fiktiv`, `Syntet`,
   `Testkorpus` or equivalent). Structured distractors may use only the
   owner-published values in `docs/TEST_DATA.md`.

This is independence from Maskera's task generator, not proof of independence
from KB-BERT pretraining.

## Stages

### Stage 1 (~100 sentences): fictional formal register

Three to five Swedish writers each author fictional authority, legal,
healthcare and organisation-heavy scenarios. They receive only domain prompts
such as “write a short fictional permit decision” or “write a fictional
referral note”. No source sentence may be paraphrased.

### Stage 2 (~100 sentences): fictional support/chat register

Writers create realistic lowercase support messages with invented name
combinations, explicitly synthetic addresses and, only when needed,
authority-published test identifiers. Include diverse name morphology and
typos, but do not copy anyone's support traffic. A reported miss may inspire a
category brief; the original message and values never enter the repository.

### Stage 3 (ongoing): private aggregate validation

Domain partners may run the fixed artifact inside their own environment and
share only aggregate counts. Their text, identifiers, examples and error values
remain private and never become training or repository data.

## Annotation protocol

- Annotate before running the model so labels are not anchored to predictions.
- Use PERSON / LOCATION / ORGANIZATION / ADDRESS with exact character spans.
- Run a second blind pass over at least 20%; adjudicate disagreements as
  category-level guideline changes.
- Store writer id, register, collection date and the declaration that the row
  is independently authored and fictional. Do not store source-entity links.
- Run `pnpm check:fixtures` and an address-marker check before accepting rows.

## Reporting

- Report each register separately and aggregate-only.
- Never print missed values or complete sentences in release logs.
- Freeze the corpus before candidate evaluation and do not tune after reading
  its results.
- Keep the historical v18 comparison tables separate from published v19's
  release-gate results.

## Explicitly out of scope

- Scraped forums, social media, news, Wikipedia or authority prose.
- Donated or consented real messages; consent does not make retention necessary.
- Real addresses or randomly composed ordinary street/number pairs.
- LLM-generated evaluation sentences, because they add another generator
  distribution rather than independent human authorship.
