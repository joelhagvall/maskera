# Plan: a larger independent gold set

The project's top measurement priority (see BENCHMARKS.md "Known gaps"): the
independent eval is 22 sentences, which gives a direction, not a grade. This
plan gets it to 200+ sentences across the target domains without poisoning
its independence. Deliberately staged; each stage produces a usable corpus.

## Requirements (what "independent" means here)

1. **Written by others.** No sentence authored by the training-data
   generator's author. The curated corpus already covers that style.
2. **Held out.** Nothing from datasets the model trained on (synthetic
   templates, Swedish NER Corpus train split) or their close derivatives.
3. **Target domains.** Support/chat, legal/authority, healthcare-adjacent.
   Wikipedia prose (the current 22) is the wrong register: encyclopedic,
   well-cased, third person.
4. **License- and GDPR-clean to publish.** This is the hard constraint most
   plans miss: a public gold corpus containing real private persons' names
   is itself a publication of personal data. Sources must be either already
   lawfully public (authority decisions about public figures, published
   texts), consented, or realistic-but-not-real (see stage 2).

## Stages

### Stage 1 (~100 sentences): public authority and news register

Verbatim sentences from already-public Swedish sources where the personal
data is lawfully published and about public figures or organisations:
government/authority press releases and decisions, published court summaries,
news agency prose. Covers the formal end (legal/authority register),
including ORG-heavy and ADR-containing sentences that the current 22 lack.

- Collect verbatim, note the source per sentence.
- Annotate in the `corpus-domain.template.mjs` format (value + label + nth),
  so the existing harness grades it unchanged.

### Stage 2 (~100 sentences): support/chat register, donated

The register that matters most in production (lowercase, typos, first
person) and can't be scraped legally. Two channels:

- **Donated paraphrases:** 3 to 5 Swedish speakers each write 20 to 30
  realistic support/chat messages with invented but plausible PII (invented
  names, real street names with invented numbers, valid-checksum test
  personnummer). The invented names must span many name origins, not only
  Swedish ones: the rare-surname chat gate (BENCHMARKS.md) exists because
  lowercase text interacts with name rarity, so name-origin robustness is exactly
  what this register has to measure. They must never see the training
  generator's templates; give them scenario prompts only ("write an angry
  delivery complaint", "reschedule a medical appointment").
- **Own consented traffic:** any real user-reported miss (like the two npm
  stress-test cases already in the curated corpus) goes here when consent
  allows, otherwise into the private CI corpus.

### Stage 3 (ongoing): healthcare/legal free text

Hardest to source lawfully; do not block stages 1-2 on it. Candidates:
published anonymised case descriptions (IVO/JO decisions), medical-Swedish
teaching materials, or a domain partner running the private-corpus flow from
`docs/PRODUCTION.md` who can share aggregate metrics even if not sentences.

## Annotation protocol

- Annotate **before** running the model on the text, so gold isn't anchored
  to model output. One annotation pass, then a second blind pass on a 20%
  sample; disagreements adjudicated and written down as guideline rules.
- Labels and span rules identical to the curated corpus (PERSON / LOCATION /
  ORGANIZATION / ADDRESS, exact spans, genitive-s outside the span).
- Every sentence keeps provenance metadata: source, register, collection
  date, license basis.

## Reporting

- New BENCHMARKS.md section per register (formal / chat / healthcare-legal),
  not one blended number: the registers differ too much for an average to
  mean anything (see the cased vs lowercased gap in the comparison tables).
- The whitepaper's "honest floor" section switches to this corpus once
  stage 1 lands; the 22-sentence set is retired into it.
- Re-run `training/benchmark_competitors.py` on the new set in the same
  commit, so the cross-model claim always references the current corpus.

## Explicitly out of scope

- Scraping forums or social media (no lawful basis to republish).
- Using the Swedish NER Corpus test split (in-distribution; see
  BENCHMARKS.md "What the model was trained on").
- LLM-generated sentences (that's a second synthetic distribution, not
  independence).
