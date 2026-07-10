#!/usr/bin/env python3
"""EU PII Safeguard (tabularisai/eu-pii-safeguard) predictions for the bench.

XLM-RoBERTa-large token classifier, 42 entity types, license
"commercial-evaluation" (benchmarking is evaluation). Its label space splits
entities finer than the gold sets annotate, so the charitable decode maps and
merges:

  FIRSTNAME / MIDDLENAME / LASTNAME        -> PERSON   (merged when adjacent)
  CITY / STATE / COUNTRY                   -> LOCATION (merged when adjacent)
  COMPANY_NAME                             -> ORGANIZATION
  STREET / BUILDING_NUMBER / ADDRESS       -> ADDRESS  (merged when adjacent)

PREFIX (titles like "Professor") is deliberately NOT mapped: the gold spans
exclude titles. There is no label for public authorities or non-company
organizations; that shows up as ORG recall, honestly.

Run inside the bench venv:
  .venv-pf/bin/python run_eu_pii_safeguard.py
"""

import json
import os
import sys

from transformers import pipeline

HERE = os.path.dirname(os.path.abspath(__file__))
CORPORA = ["curated", "adr", "gold-real"]
MODEL_REVISION = "0edf0c82c3cb9684f8bb04e51a1e505f28e87137"

LABEL_MAP = {
    "FIRSTNAME": "PERSON",
    "MIDDLENAME": "PERSON",
    "LASTNAME": "PERSON",
    "CITY": "LOCATION",
    "STATE": "LOCATION",
    "COUNTRY": "LOCATION",
    "COMPANY_NAME": "ORGANIZATION",
    "STREET": "ADDRESS",
    "BUILDING_NUMBER": "ADDRESS",
    "ADDRESS": "ADDRESS",
}

print("loading tabularisai/eu-pii-safeguard ...", file=sys.stderr)
clf = pipeline(
    "token-classification",
    model="tabularisai/eu-pii-safeguard",
    revision=MODEL_REVISION,
    aggregation_strategy="max",
)


def merge_adjacent(spans, text):
    """Merge same-(mapped)-label spans with only whitespace between them."""
    out = []
    for s in sorted(spans, key=lambda x: x["start"]):
        if (
            out
            and out[-1]["label"] == s["label"]
            and text[out[-1]["end"] : s["start"]].strip() == ""
        ):
            out[-1]["end"] = s["end"]
        else:
            out.append(dict(s))
    return out


os.makedirs(os.path.join(HERE, "out"), exist_ok=True)

for name in CORPORA:
    with open(os.path.join(HERE, "corpora", f"{name}.json")) as f:
        gold = json.load(f)
    docs = []
    for doc in gold:
        preds = clf(doc["text"])
        spans = []
        for p in preds:
            label = LABEL_MAP.get(p["entity_group"])
            if not label:
                continue
            start, end = int(p["start"]), int(p["end"])
            value = doc["text"][start:end]
            trimmed = value.strip()
            if not trimmed:
                continue
            if trimmed != value:
                start += value.index(trimmed)
                end = start + len(trimmed)
            spans.append({"start": start, "end": end, "label": label})
        docs.append({"text": doc["text"], "spans": merge_adjacent(spans, doc["text"])})
    out = os.path.join(HERE, "out", f"{name}.eu-pii-safeguard.json")
    with open(out, "w") as f:
        json.dump({"system": "eu-pii-safeguard", "corpus": name, "docs": docs}, f, indent=1)
    print(f"{name}: {len(docs)} docs -> {out}", file=sys.stderr)
