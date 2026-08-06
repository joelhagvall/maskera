"""v15 balanced-replay teacher-only dose screen.

Runs a fixed probe set through a teacher checkpoint (PyTorch, pre-distillation)
and prints entity predictions. The probes are exactly the regressions the v15
bare-surname data round introduced (documented in training/README.md, v15 data
round) plus the intended gain:

  GAIN  bare lowercase "Provnamn" in declarative prose should tag PER
  KEEP  "Provhuset" stays LOC, "Fiktivpartiet" / "Fiktivbolaget" stay ORG
  GUARD ordinary capitalised words ("Festen", ...) stay non-entity

The target surname and ordinary-word guard are absent from the balanced-replay
family, while the organisation probes are retention checks. Run it against the
candidate and the seed-2024 baseline and diff by eye / by the SUMMARY line.

    uv run python screen_balanced.py <model_dir>
"""

import os
import sys

import torch
from transformers import pipeline

model_dir = sys.argv[1] if len(sys.argv) > 1 else "model-v15-balanced"
device = os.environ.get("MASKERA_DEVICE") or (
    "mps" if torch.backends.mps.is_available() else "cpu"
)
nlp = pipeline(
    "token-classification",
    model=model_dir,
    tokenizer=model_dir,
    aggregation_strategy="simple",
    device=device,
)

# (label, text, expectation). expectation is (surface, type) that MUST be
# covered, or (surface, None) that must NOT be tagged as any entity.
PROBES = [
    # --- the intended gain: bare lowercase surname, declarative prose ---
    ("GAIN", "provnamn har varit engagerad i partiet sedan länge.", ("provnamn", "PER")),
    ("GAIN", "provnamn lämnade posten efter valet.", ("provnamn", "PER")),
    ("GAIN", "Provnamn har varit engagerad i partiet sedan länge.", ("Provnamn", "PER")),
    # --- KEEP: the LOC/ORG spans the bare-only dose pushed the boundary off ---
    ("KEEP", "provhuset kommenterade beslutet i går.", ("provhuset", "LOC")),
    ("KEEP", "Provhuset kommenterade beslutet i går.", ("Provhuset", "LOC")),
    ("KEEP", "fiktivpartiet höll kongress i helgen.", ("fiktivpartiet", "ORG")),
    ("KEEP", "Fiktivpartiet höll kongress i helgen.", ("Fiktivpartiet", "ORG")),
    ("KEEP", "Fiktivbolaget lanserade en ny betaltjänst.", ("Fiktivbolaget", "ORG")),
    ("KEEP", "klarna lanserade en ny betaltjänst.", ("klarna", "ORG")),
    # --- GUARD: ordinary capitalised words must NOT become entities ---
    ("GUARD", "Festen började sent på kvällen.", ("Festen", None)),
    ("GUARD", "festen började sent på kvällen.", ("festen", None)),
    ("GUARD", "Mötet drog ut på tiden.", ("Mötet", None)),
    ("GUARD", "Beslutet väckte stor debatt.", ("Beslutet", None)),
    # --- ADR: the street span must keep its house number (the v15-balanced v1
    # regression: a street span dropped its number. Teacher already holds this;
    # the decisive check is the q4 ADR gate, this just catches teacher drift. ---
    ("ADR", "Cykeln stod olåst utanför Testbolaget på Maskeragatan 10 hela natten.", ("Maskeragatan 10", "ADR")),
]


def covers(ents, surface):
    lo = surface.lower()
    for e in ents:
        w = e["word"].replace(" ##", "").replace("##", "").strip().lower()
        if lo in w or w in lo:
            return e
    return None


passes = 0
for label, text, (surface, want_type) in PROBES:
    ents = nlp(text)
    hit = covers(ents, surface)
    if want_type is None:
        ok = hit is None
    else:
        ok = hit is not None and hit["entity_group"] == want_type
    passes += ok
    got = "(none)" if hit is None else f"{hit['entity_group']} {hit['score']:.2f}"
    want = "NON-ENTITY" if want_type is None else want_type
    print(f"[{label:5}] {'ok ' if ok else 'MISS'} want {want:10} got {got:14} | {text}")

print(f"SUMMARY {model_dir}: {passes}/{len(PROBES)} probes as intended")
