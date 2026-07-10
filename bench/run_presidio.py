#!/usr/bin/env python3
"""Microsoft Presidio predictions for the bench, configured for Swedish.

Presidio has no Swedish recognizers out of the box; the documented way to run
it on Swedish free text is a spaCy NLP engine with a Swedish pipeline
(sv_core_news_lg, the largest one) and an explicit entity mapping. That is
what this does, with ORGANIZATION detection enabled (Presidio ignores ORG by
default because spaCy ORG is noisy; leaving it off would be unfair here since
the gold sets contain organizations).

Run inside the bench venv:
  .venv-presidio/bin/python run_presidio.py
"""

import json
import os
import sys

from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider

HERE = os.path.dirname(os.path.abspath(__file__))
CORPORA = ["curated", "adr", "gold-real"]

NLP_CONF = {
    "nlp_engine_name": "spacy",
    "models": [{"lang_code": "sv", "model_name": "sv_core_news_lg"}],
    "ner_model_configuration": {
        "model_to_presidio_entity_mapping": {
            "PER": "PERSON",
            "PRS": "PERSON",
            "LOC": "LOCATION",
            "GPE": "LOCATION",
            "ORG": "ORGANIZATION",
        },
        "labels_to_ignore": [],
        "low_confidence_score_multiplier": 0.4,
        "low_score_entity_names": [],
    },
}

provider = NlpEngineProvider(nlp_configuration=NLP_CONF)
analyzer = AnalyzerEngine(nlp_engine=provider.create_engine(), supported_languages=["sv"])

# Keep only the labels the gold sets annotate.
KEEP = {"PERSON", "LOCATION", "ORGANIZATION"}

os.makedirs(os.path.join(HERE, "out"), exist_ok=True)

for name in CORPORA:
    with open(os.path.join(HERE, "corpora", f"{name}.json")) as f:
        gold = json.load(f)
    docs = []
    for doc in gold:
        results = analyzer.analyze(text=doc["text"], language="sv")
        spans = [
            {"start": r.start, "end": r.end, "label": r.entity_type}
            for r in results
            if r.entity_type in KEEP
        ]
        docs.append({"text": doc["text"], "spans": spans})
    out = os.path.join(HERE, "out", f"{name}.presidio-sv.json")
    with open(out, "w") as f:
        json.dump({"system": "presidio-sv", "corpus": name, "docs": docs}, f, indent=1)
    print(f"{name}: {len(docs)} docs -> {out}", file=sys.stderr)
