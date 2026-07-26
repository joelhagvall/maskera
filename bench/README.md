# Maskera Bench SV

Head-to-head grading of maskera and the closest alternatives on the same
Swedish gold sets, with the same scorer the maskera CI gates run
(`packages/ner/eval/score.mjs`): exact character-span matching, plus
**leaks** = gold entities with zero overlapping prediction, the
safety-critical number for redaction.

- **Measured:** 2026-07-19 (maskera rows; competitor rows 2026-07-18, their systems unchanged), Apple M4 Pro, all systems fully local.
- maskera's own rows are the currently published pipeline
  (`maskera@0.6.3` code, `joelhagvall/maskera-sv-ner` v18 weights, q4,
  ~43 MB; 0.6.4 and 0.6.5 are docs-only README patches, no code change),
  the same artifact [docs/BENCHMARKS.md](../docs/BENCHMARKS.md) describes.
  On the shared corpora the rows here reproduce BENCHMARKS.md exactly
  (gold-real 96.4 / 93.1 / 94.7, 2 leaks), the calibration check that the
  grading is identical.
- **Corpora note:** the curated and adr sets below are the repo eval
  corpora as of the 2026-07-16 v16-round extensions (curated 149 docs /
  205 entities, adr 41 docs / 60 entities incl. 35 street addresses),
  the same sets BENCHMARKS.md's 2026-07-19 tables are measured on. Every
  system in this file is graded on the same corpora, so the comparison is
  internally consistent.

## Systems

| system | version | what runs | model size |
| --- | --- | --- | --- |
| maskera | 0.6.3 code, maskera-sv-ner v18 q4 | rules + Swedish NER, Transformers.js/ONNX | 43 MB |
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
- **Azure AI Language** must be evaluated as both PII detection and general
  NER: PII has the privacy-specific categories while NER supplies Location and
  the general entity taxonomy. `run-azure.mjs` writes separate `azure-pii`,
  `azure-ner`, and deduplicated `azure-pii-ner` rows from two API calls per
  batch (up to five documents). It pins the GA `2024-11-01` API, Swedish
  input, UTF-16 offsets and
  `loggingOptOut: true`; unrelated entity categories are dropped to match the
  four-label gold space. The credentialed Azure run (measured 2026-07-22, GA
  API `2024-11-01`) is recorded in `out/*.azure-*.json` and published in the
  comparison tables on app.maskera.dev/accuracy; it is deliberately not
  duplicated in the tables above, so this file keeps one table set to
  maintain.

## Gold sets

Same provenance caveats as [docs/BENCHMARKS.md](../docs/BENCHMARKS.md):
**curated** (149 sentences, 205 entities) and **adr** (41 sentences, 60
entities incl. 35 street addresses) share an author with maskera's
training-data generator, so read them as upper bounds for maskera but as
neutral ground for the others; **gold-real** (22 Wikipedia sentences, 58
entities, written and labeled by others, held out from all training) is the
independent floor. A larger independent set is in progress
([docs/GOLD_SET_PLAN.md](../docs/GOLD_SET_PLAN.md)).

`osm-addresses` is a separate, generated stress test rather than part of the
published snapshot above. It samples 500 real address points across twelve
Swedish regions from OpenStreetMap, limits repeated street names, and inserts
them into new chat-style wrappers with normal, lowercase and uppercase forms.
The addresses are real; their surrounding conversations are synthetic and do
not contain people. The generated corpus and metadata are git-ignored, and the
metadata records source timestamps plus a corpus SHA-256 so a measured run can
be tied to one exact snapshot. Data: © OpenStreetMap contributors, available
under the Open Database License (ODbL) 1.0.

## Results

### curated (149 docs, 205 gold entities)

| system | precision | recall | span F1 | labeled F1 | leaks |
| --- | ---: | ---: | ---: | ---: | ---: |
| maskera | 99.5% | 100.0% | **99.8%** | 99.8% | **0 (0.0%)** |
| presidio-sv | 98.4% | 91.2% | 94.7% | 94.2% | 16 (7.8%) |
| eu-pii-safeguard | 81.5% | 21.5% | 34.0% | 34.0% | 151 (73.7%) |
| privacy-filter | 73.3% | 21.5% | 33.2% | 31.7% | 147 (71.7%) |
| blindfold-local | 100.0% | 0.0% | 0.0% | 0.0% | 205 (100.0%) |

### gold-real, independent (22 docs, 58 gold entities)

| system | precision | recall | span F1 | labeled F1 | leaks |
| --- | ---: | ---: | ---: | ---: | ---: |
| maskera | 96.4% | 93.1% | **94.7%** | 94.7% | **2 (3.4%)** |
| presidio-sv | 82.5% | 56.9% | 67.3% | 65.3% | 19 (32.8%) |
| eu-pii-safeguard | 77.8% | 12.1% | 20.9% | 20.9% | 49 (84.5%) |
| privacy-filter | 83.3% | 8.6% | 15.6% | 15.6% | 53 (91.4%) |
| blindfold-local | 100.0% | 0.0% | 0.0% | 0.0% | 58 (100.0%) |

### adr, street addresses (41 docs, 60 gold entities)

| system | precision | recall | span F1 | labeled F1 | leaks |
| --- | ---: | ---: | ---: | ---: | ---: |
| maskera | 100.0% | 100.0% | **100.0%** | 100.0% | **0 (0.0%)** |
| presidio-sv | 42.9% | 40.0% | 41.4% | 41.4% | 4 (6.7%) |
| eu-pii-safeguard | 63.9% | 38.3% | 47.9% | 47.9% | 24 (40.0%) |
| privacy-filter | 23.1% | 10.0% | 14.0% | 14.0% | 39 (65.0%) |
| blindfold-local | 100.0% | 0.0% | 0.0% | 0.0% | 60 (100.0%) |

Precision at 0% recall (blindfold-local) is vacuous: no predictions in the
gold label space at all, so nothing to be wrong about. The adr corpus
includes the v16 round's 14 harder sentences (nr-forms, detached house-number
letters, lowercase and ALL CAPS addresses); the v18 weights sweep the whole
extended corpus exact-span (the v15 row read 94.3% here, from the since-fixed
"Festen" over-flag and boundary slips); leaks stay **0 of 35 addresses**.

### Per-label highlights

Run `node bench/grade.mjs <corpus>` for the full breakdown. The load-bearing
rows:

- **Presidio ORG recall:** 64.6% curated, 37.0% gold-real. `sv_core_news_lg`
  misses Ericsson, Spotify, Klarna, Migrationsverket, Skanska,
  Polismyndigheten. It also has no address concept (0% exact ADDRESS recall
  on adr; its LOCATION tags cover most cased addresses, but "bondegatan 41",
  "drottninggatan 29" and "SANKT PAULSGATAN 8" leak entirely) and misses
  lowercase names ("astrid").
- **Privacy Filter on the class it does have:** PERSON recall 47.2% curated,
  27.8% gold-real; on adr its `private_address` leaves 26 of 35 Swedish
  street addresses with no overlapping prediction at all. Its model card
  says English-first and warns about regional naming conventions; on Swedish
  text that warning is the headline. Repeated Swedish first names ("Björn",
  "Sofia", "Anders") leak.
- **EU PII Safeguard:** PERSON recall is 25.8% curated and 5.6% gold-real;
  ORGANIZATION recall is 6.3% and 11.1%. It is more useful on the address set,
  where ADDRESS recall reaches 54.3%, but 7/35 addresses still have no
  overlapping prediction and overall precision is 63.9%.
- **Blindfold local vs cloud:** local mode found personnummer (checksum
  validated), IBAN and phone numbers once `locales` was set, and that tier
  is genuinely fast. But every free-text entity in every set leaked, because
  name/org/address detection is their cloud tier. The npm-install experience
  is exactly the part that cannot see a name.

## What this does and does not show

- It shows that on Swedish free text, the 43 MB maskera model beats the
  2.6 GB Privacy Filter by 79.1 span-F1 points, the 2.24 GB multilingual
  EU PII Safeguard by 73.8 points, and the standard open-source choice
  (Presidio) by 27.4 points on the independent set. Its leak rate is also far
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

# Microsoft Azure AI Language (Free F0 is sufficient; credentials stay local)
read "AZURE_LANGUAGE_ENDPOINT?Azure Language endpoint: "
read -s "AZURE_LANGUAGE_KEY?Azure Language key: " && echo
export AZURE_LANGUAGE_ENDPOINT AZURE_LANGUAGE_KEY
node run-azure.mjs
unset AZURE_LANGUAGE_ENDPOINT AZURE_LANGUAGE_KEY

# independent real-address stress test (live OSM snapshot, git-ignored)
node fetch-osm-addresses.mjs
node run-maskera.mjs osm-addresses
node run-azure.mjs osm-addresses
node grade.mjs osm-addresses
node analyze-address-coverage.mjs osm-addresses

# After a candidate is locked, make an address-disjoint final holdout. Record
# the random salt before fetching; do not tune after viewing this set.
OSM_CORPUS_NAME=osm-addresses-holdout \
OSM_ADDRESS_COUNT=1000 \
OSM_ADDRESS_SALT="$HOLDOUT_SALT" \
OSM_EXCLUDE_CORPUS=corpora/osm-addresses.json \
OSM_REFRESH=1 \
node fetch-osm-addresses.mjs

# grade everything
node grade.mjs curated && node grade.mjs gold-real && node grade.mjs adr
```

## Next

- Rerun on the larger independent gold set when it lands
  (docs/GOLD_SET_PLAN.md); these numbers get a real floor then.
- A lowercase/chat-register pass (LOWERCASE=1 style) per system: Presidio's
  spaCy model should collapse there, and that register is the target domain.
- A latency/memory column per system on identical hardware.
