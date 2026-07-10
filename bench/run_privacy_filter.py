#!/usr/bin/env python3
"""OpenAI Privacy Filter (openai/privacy-filter) predictions for the bench.

Runs the HF token-classification pipeline as the model card shows, decoded
charitably: aggregation_strategy="max" (word-level, the cleanest of the HF
strategies on Swedish; "simple" fragments entities at subword boundaries) plus
a post-pass that merges adjacent same-label spans separated by whitespace
only, so "Erik" + "Johansson" grades as one entity the way the gold sets
annotate names. Boundary errors beyond that are the model's own.

Label space (8 classes) has no LOCATION/ORGANIZATION equivalent, so on
PER/LOC/ORG gold sets it can only compete on PERSON (private_person) and, on
the ADR set, ADDRESS (private_address). Other classes (email, phone, date...)
are dropped before scoring so they cannot count as false positives against
gold sets that do not annotate them.

Run inside the bench venv:
  .venv-pf/bin/python run_privacy_filter.py
"""

import json
import os
import sys

from transformers import pipeline

HERE = os.path.dirname(os.path.abspath(__file__))
CORPORA = ["curated", "adr", "gold-real"]

LABEL_MAP = {
    "private_person": "PERSON",
    "private_address": "ADDRESS",
}

print("loading openai/privacy-filter ...", file=sys.stderr)
clf = pipeline(
    "token-classification",
    model="openai/privacy-filter",
    aggregation_strategy="max",
)


def merge_adjacent(spans, text):
    """Merge same-label spans with only whitespace between them."""
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
            # The fast tokenizer's offsets can include leading whitespace on
            # aggregated spans; trim to the actual text like a user would.
            value = doc["text"][start:end]
            trimmed = value.strip()
            if trimmed != value:
                start += value.index(trimmed)
                end = start + len(trimmed)
            spans.append({"start": start, "end": end, "label": label})
        docs.append({"text": doc["text"], "spans": merge_adjacent(spans, doc["text"])})
    out = os.path.join(HERE, "out", f"{name}.privacy-filter.json")
    with open(out, "w") as f:
        json.dump({"system": "privacy-filter", "corpus": name, "docs": docs}, f, indent=1)
    print(f"{name}: {len(docs)} docs -> {out}", file=sys.stderr)
