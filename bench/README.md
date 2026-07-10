# Maskera Bench SV

Head-to-head grading of maskera and the closest alternatives on the same
Swedish gold sets, with the same scorer the maskera CI gates run
(`packages/ner/eval/score.mjs`): exact character-span matching, plus
**leaks** = gold entities with zero overlapping prediction, the
safety-critical number for redaction.

- **Measured:** 2026-07-10, Apple M4 Pro, all systems fully local.
- maskera's own rows are the same artifact and pipeline as
  [docs/BENCHMARKS.md](../docs/BENCHMARKS.md) (`joelhagvall/maskera-sv-ner`,
  q4, `maskera@0.4.5`); this harness reproduces those numbers exactly, which
  is the calibration check that the grading is identical.

## Systems

| system | version | what runs | model size |
| --- | --- | --- | --- |
| maskera | 0.4.5, maskera-sv-ner q4 | rules + Swedish NER, Transformers.js/ONNX | 40 MB |
| Microsoft Presidio | presidio-analyzer 2.2.363 | spaCy `sv_core_news_lg` NLP engine | ~550 MB |
| OpenAI Privacy Filter | openai/privacy-filter, transformers 5.13 / torch 2.13 | 1.5B-param (50M active) token classifier | 2.6 GB |
| EU PII Safeguard | tabularisai/eu-pii-safeguard, revision `0edf0c8` | XLM-R-large token classifier | 2.24 GB |
| Blindfold | @blindfold/sdk 1.0.2 | LOCAL mode (regex/checksum scanner) | regex only |

Configuration notes (each system gets its best reasonable shot, see the
runner headers for full detail):

- **Presidio** has no Swedish support out of the box; it is configured the
  documented way with the largest Swedish spaCy pipeline and an explicit
  PER/LOC/GPE/ORG mapping, with ORG detection enabled (Presidio ignores ORG
  by default). `run_presidio.py`.
- **Privacy Filter** is decoded charitably: `aggregation_strategy="max"`
  (the default "simple" fragments Swedish words at subword boundaries) plus
  merging of adjacent same-label spans across whitespace. Its 8-class label
  space has no LOCATION or ORGANIZATION, so only `private_person` and
  `private_address` map into the gold space; every other class is dropped so
  it cannot count as a false positive. `run_privacy_filter.py`.
- **[EU PII Safeguard](https://huggingface.co/tabularisai/eu-pii-safeguard)**
  is also decoded with `aggregation_strategy="max"`.
  Its fine-grained name, location and address labels are mapped and adjacent
  components merged into the four gold labels; unmappable classes are dropped.
  The model card reports 97.09% Swedish F1, but that self-reported result uses
  a different dataset, label space and scoring setup. The model's custom
  [`commercial-evaluation` license](https://huggingface.co/tabularisai/eu-pii-safeguard/blob/main/LICENSE.md)
  allows a 30-day evaluation and free academic research; commercial deployment
  requires a paid license.
  `run_eu_pii_safeguard.py`.
- **Blindfold local** runs with `locales: ["se", "eu"]` (the default is
  `["us"]`, which misses even valid personnummer) and all entity types
  enabled. Its person/organization/address detection is cloud-API-only
  (paid, not tested here); local mode is regex/checksum. Note:
  @blindfold/sdk 1.0.2 ships without `dist/policies.json` and its ESM build
  references a bare `__dirname`, so the setup below patches the file in and
  the runner imports the CJS build. `run-blindfold.mjs`.

## Gold sets

Same provenance caveats as [docs/BENCHMARKS.md](../docs/BENCHMARKS.md):
**curated** (148 sentences, 204 entities) and **adr** (27 sentences, 44
entities incl. 21 street addresses) share an author with maskera's
training-data generator, so read them as upper bounds for maskera but as
neutral ground for the others; **gold-real** (22 Wikipedia sentences, 58
entities, written and labeled by others, held out from all training) is the
independent floor. A larger independent set is in progress
([docs/GOLD_SET_PLAN.md](../docs/GOLD_SET_PLAN.md)).

## Results

### curated (148 docs, 204 gold entities)

| system | precision | recall | span F1 | labeled F1 | leaks |
| --- | ---: | ---: | ---: | ---: | ---: |
| maskera | 97.6% | 98.5% | **98.0%** | 98.0% | **2 (1.0%)** |
| presidio-sv | 98.4% | 91.7% | 94.9% | 94.4% | 15 (7.4%) |
| eu-pii-safeguard | 81.5% | 21.6% | 34.1% | 34.1% | 150 (73.5%) |
| privacy-filter | 73.3% | 21.6% | 33.3% | 31.8% | 146 (71.6%) |
| blindfold-local | 100.0% | 0.0% | 0.0% | 0.0% | 204 (100.0%) |

### gold-real, independent (22 docs, 58 gold entities)

| system | precision | recall | span F1 | labeled F1 | leaks |
| --- | ---: | ---: | ---: | ---: | ---: |
| maskera | 86.7% | 89.7% | **88.1%** | 86.4% | **1 (1.7%)** |
| presidio-sv | 82.5% | 56.9% | 67.3% | 65.3% | 19 (32.8%) |
| eu-pii-safeguard | 77.8% | 12.1% | 20.9% | 20.9% | 49 (84.5%) |
| privacy-filter | 83.3% | 8.6% | 15.6% | 15.6% | 53 (91.4%) |
| blindfold-local | 100.0% | 0.0% | 0.0% | 0.0% | 58 (100.0%) |

### adr, street addresses (27 docs, 44 gold entities)

| system | precision | recall | span F1 | labeled F1 | leaks |
| --- | ---: | ---: | ---: | ---: | ---: |
| maskera | 97.8% | 100.0% | **98.9%** | 98.9% | **0 (0.0%)** |
| presidio-sv | 53.7% | 50.0% | 51.8% | 51.8% | 3 (6.8%) |
| eu-pii-safeguard | 60.0% | 34.1% | 43.5% | 43.5% | 19 (43.2%) |
| privacy-filter | 18.8% | 6.8% | 10.0% | 10.0% | 31 (70.5%) |
| blindfold-local | 100.0% | 0.0% | 0.0% | 0.0% | 44 (100.0%) |

Precision at 0% recall (blindfold-local) is vacuous: no predictions in the
gold label space at all, so nothing to be wrong about.

### Per-label highlights

Run `node bench/grade.mjs <corpus>` for the full breakdown. The load-bearing
rows:

- **Presidio ORG recall:** 66.0% curated, 37.0% gold-real. `sv_core_news_lg`
  misses Ericsson, Spotify, Klarna, Migrationsverket, Skanska,
  Polismyndigheten. It also has no address concept (0/21 on adr) and misses
  lowercase names ("astrid", "bondegatan 41").
- **Privacy Filter on the class it does have:** PERSON recall 47.2% curated,
  27.8% gold-real; on adr its `private_address` finds 1 of 21 Swedish street
  addresses. Its model card says English-first and warns about regional
  naming conventions; on Swedish text that warning is the headline. Repeated
  Swedish first names ("Björn", "Sofia", "Anders") leak.
- **EU PII Safeguard:** PERSON recall is 25.8% curated and 5.6% gold-real;
  ORGANIZATION recall is 6.4% and 11.1%. It is more useful on the address set,
  where ADDRESS recall reaches 52.4%, but 3/21 addresses still have no
  overlapping prediction and overall precision is 60.0%.
- **Blindfold local vs cloud:** local mode found personnummer (checksum
  validated), IBAN and phone numbers once `locales` was set, and that tier
  is genuinely fast. But every free-text entity in every set leaked, because
  name/org/address detection is their cloud tier. The npm-install experience
  is exactly the part that cannot see a name.

## What this does and does not show

- It shows that on Swedish free text, the shipped 40 MB maskera model beats
  the 2.6 GB Privacy Filter by 72.5 span-F1 points, the 2.24 GB multilingual
  EU PII Safeguard by 67.2 points, and the standard open-source choice
  (Presidio) by 20.8 points on the independent set. Its leak rate is also far
  lower. For redaction, the leak column is the product.
- It does NOT show general superiority: Privacy Filter targets English and
  eight categories by design; EU PII Safeguard targets 42 finer-grained PII
  types and its self-reported score is not directly comparable; Blindfold's
  cloud NLP was not tested; Presidio with a custom-trained Swedish model would
  be a different (and fairer to Presidio, but nonstandard) setup. Two of the
  three sets share an author with maskera's training generator; gold-real is
  small. Say all of this whenever these numbers are published.
- Structured identifiers (personnummer, IBAN...) are deliberately absent:
  the gold sets cover free text because that is where systems differ.
  Blindfold local and @maskera/core overlap heavily on regex+checksum work.

## Reproduce

```bash
# corpora + maskera (Node; dist must be built)
pnpm -C packages/ner build
node bench/export-corpora.mjs
node bench/run-maskera.mjs

# Blindfold local (patch the packaging bug first)
cd bench && npm install --ignore-scripts
curl -fsSL https://raw.githubusercontent.com/blindfold-dev/Blindfold/main/packages/js-sdk/src/policies.json \
  -o node_modules/@blindfold/sdk/dist/policies.json
node run-blindfold.mjs

# Presidio (Python 3.13 via uv)
uv venv --python 3.13 .venv-presidio
uv pip install --python .venv-presidio/bin/python presidio-analyzer \
  "sv_core_news_lg @ https://github.com/explosion/spacy-models/releases/download/sv_core_news_lg-3.8.0/sv_core_news_lg-3.8.0-py3-none-any.whl"
.venv-presidio/bin/python run_presidio.py

# OpenAI Privacy Filter (~2.6 GB download)
uv venv --python 3.13 .venv-pf
uv pip install --python .venv-pf/bin/python torch transformers
.venv-pf/bin/python run_privacy_filter.py

# EU PII Safeguard (~2.24 GB; read its commercial-evaluation license first)
.venv-pf/bin/python run_eu_pii_safeguard.py

# grade everything
node grade.mjs curated && node grade.mjs gold-real && node grade.mjs adr
```

## Next

- Rerun on the larger independent gold set when it lands
  (docs/GOLD_SET_PLAN.md); these numbers get a real floor then.
- A lowercase/chat-register pass (LOWERCASE=1 style) per system: Presidio's
  spaCy model should collapse there, and that register is the target domain.
- A latency/memory column per system on identical hardware.
