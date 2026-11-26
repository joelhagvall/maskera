"""
Build the independent Swedish test corpora in one shared format.

No corpus text is checked into git: every source is downloaded on demand from
Hugging Face at a pinned revision, and the files land in tmp/indep/corpora/.
None of these sources is part of Maskera's training data (v20 trains only on
text from training/generate_data.mjs; see the model card).

Output, one JSONL file per corpus variant:
  {"id": str, "text": str, "gold": [{"start", "end", "type"}], "clean": bool}
`clean` is true only for sentences with no annotated entity of any kind, so
the over-masking measure never counts a sentence that holds, say, an
unscored work title.

Corpora:
  suc3-test-cased / -lower   KBLab/sucx3_ner, SUC 3.0 test split, every
                             sentence with at least 4 tokens. PRS->PER,
                             LOC->LOC, ORG->ORG. CC BY 4.0.
  multiconer-sv              MultiCoNER v2 Swedish test split (all lowercase),
                             seed-42 sample of 2,000 sentences with a person.
                             Only person tags are scored: its place and
                             organisation labels mark common words ("ort",
                             "flygplats", "svensk") and the split injects
                             typos, so those types are too noisy. CC BY 4.0.
  ai4privacy-sv              ai4privacy/pii-masking-openpii-1.5m validation
                             split, every row tagged Swedish whose text is in
                             fact Swedish (some are English). Names, street addresses,
                             postcodes, cities and e-mail are scored; phone,
                             personnummer and card are kept for a separate,
                             caveated table because many values are not valid
                             Swedish formats. CC BY 4.0.
  sic2-sv                    Stockholm Internet Corpus v2 (Språkbanken Text,
                             DOI 10.23695/se5f-d274), informal Swedish blog text
                             with manual <name> annotation (person->PER,
                             place->LOC, inst->ORG). CC BY 4.0.

Run with the bench venv:  bench/.venv/bin/python bench/independent/build_corpora.py
"""

import bz2
import hashlib
import json
import random
import sys
import tarfile
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

from huggingface_hub import hf_hub_download

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "training"))
from benchmark_suc3_external_v20 import SUC_REPO, SUC_REV, detokenize_with_spans  # noqa: E402

OUT = Path("tmp/indep/corpora")
CACHE = Path("tmp/indep/cache")
MULTICONER_REPO = "MultiCoNER/multiconer_v2"
MULTICONER_REV = "4be2d62c912977ee26ed14d2553a4fe17ca3d980"
AI4P_REPO = "ai4privacy/pii-masking-openpii-1.5m"
AI4P_REV = "a785eb528e28be2693c3718a27e066970de5dadb"
SIC2_URL = "https://spraakbanken.gu.se/resurser/meningsmangder/sic2.xml.bz2"
SIC2_BZ2_SHA256 = "fbd11cfb96c00123c45e7238c4b46d030ecac49fdd5b0226746e86106828e204"
SIC2_TYPES = {"person": "PER", "place": "LOC", "inst": "ORG"}

SUC_TYPES = {"PRS": "PER", "LOC": "LOC", "ORG": "ORG"}
MULTICONER_TYPES = {
    t: "PER" for t in ["Artist", "Athlete", "Politician", "Scientist", "Cleric", "SportsManager", "OtherPER"]
}
SV_WORDS = {"och", "att", "är", "för", "på", "med", "som", "det", "en", "ett", "till", "av", "har", "vi", "du", "din", "ditt", "om", "vid", "eller"}
EN_WORDS = {"the", "and", "of", "to", "is", "for", "with", "your", "you", "are", "on", "by", "at", "this", "that"}


def is_swedish(text):
    words = [w.strip(".,:;!?()\"'").lower() for w in text.split()]
    return sum(w in SV_WORDS for w in words) > sum(w in EN_WORDS for w in words)
AI4P_TYPES = {
    "GIVENNAME": "PER",
    "SURNAME": "PER",
    "STREET": "ADDRESS",
    "BUILDINGNUM": "ADDRESS",
    "ZIPCODE": "ZIPCODE",
    "CITY": "LOC",
    "EMAIL": "EMAIL",
    "TELEPHONENUM": "PHONE*",
    "SOCIALNUM": "PERSONNUMMER*",
    "CREDITCARDNUMBER": "CARD*",
}


def write(name, rows):
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / f"{name}.jsonl", "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print(f"{name}: {len(rows)} texts, {sum(len(r['gold']) for r in rows)} gold spans")


def merge_adjacent(text, spans):
    """Join same-type spans separated only by spaces or a comma (a given name
    and a surname, a street and its number) into one span."""
    spans = sorted(spans, key=lambda s: s["start"])
    out = []
    for s in spans:
        if out and out[-1]["type"] == s["type"] and text[out[-1]["end"] : s["start"]].strip(" ,") == "":
            out[-1]["end"] = s["end"]
        else:
            out.append(dict(s))
    return out


def build_suc3():
    archive = hf_hub_download(SUC_REPO, "data/simple_tags/cased.tar.gz", repo_type="dataset", revision=SUC_REV)
    cased = []
    with tarfile.open(archive, "r:gz") as tf:
        for line in tf.extractfile("cased/test.jsonl").read().decode("utf-8").splitlines():
            row = json.loads(line)
            if len(row["tokens"]) < 4:
                continue
            text, spans = detokenize_with_spans(row["tokens"], row["ner_tags"])
            gold = [
                {"start": s["start"], "end": s["end"], "type": SUC_TYPES[s["type"]]}
                for s in spans
                if s["type"] in SUC_TYPES
            ]
            cased.append({"id": row["id"], "text": text, "gold": gold, "clean": len(spans) == 0})
    write("suc3-test-cased", cased)
    write("suc3-test-lower", [{**r, "text": r["text"].lower()} for r in cased])


def build_multiconer():
    path = hf_hub_download(MULTICONER_REPO, "SV-Swedish/sv_test.conll", repo_type="dataset", revision=MULTICONER_REV)
    with_entities = []
    for block in open(path, encoding="utf-8").read().strip().split("\n\n"):
        lines = [l for l in block.split("\n") if l.strip()]
        if not lines or not lines[0].startswith("# id"):
            continue
        sid = lines[0].split()[-1]
        tokens = [l.split()[0] for l in lines[1:]]
        tags = [l.split()[-1] for l in lines[1:]]
        if len(tokens) < 4:
            continue
        text, spans = detokenize_with_spans(tokens, tags)
        gold = [
            {"start": s["start"], "end": s["end"], "type": MULTICONER_TYPES[s["type"]]}
            for s in spans
            if s["type"] in MULTICONER_TYPES
        ]
        if gold:
            with_entities.append({"id": sid, "text": text, "gold": gold, "clean": False})
    rng = random.Random(42)
    rng.shuffle(with_entities)
    write("multiconer-sv", with_entities[:2000])


def build_ai4privacy():
    path = hf_hub_download(AI4P_REPO, "data/validation.jsonl", repo_type="dataset", revision=AI4P_REV)
    rows = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            r = json.loads(line)
            text = r["source_text"]
            if r["language"] != "sv" or not is_swedish(text):
                continue
            spans = [
                {"start": m["start"], "end": m["end"], "type": AI4P_TYPES[m["label"]]}
                for m in r["privacy_mask"]
                if m["label"] in AI4P_TYPES
            ]
            rows.append({"id": str(r["uid"]), "text": text, "gold": merge_adjacent(text, spans), "clean": False})
    write("ai4privacy-sv", rows)


def build_sic2():
    CACHE.mkdir(parents=True, exist_ok=True)
    archive = CACHE / "sic2.xml.bz2"
    if not archive.exists():
        urllib.request.urlretrieve(SIC2_URL, archive)
    raw_bz2 = archive.read_bytes()
    actual_sha = hashlib.sha256(raw_bz2).hexdigest()
    if actual_sha != SIC2_BZ2_SHA256:
        raise RuntimeError(f"SIC2 archive sha256 mismatch: expected {SIC2_BZ2_SHA256}, got {actual_sha}")

    xml_text = bz2.decompress(raw_bz2).decode("utf-8")
    # Språkbanken's wrapper puts an outer <corpus id="sic2"> before the <?xml?> declaration.
    cleaned = "\n".join(line for line in xml_text.splitlines() if not line.lstrip().startswith("<?xml"))
    root = ET.fromstring(f"<root>\n{cleaned}\n</root>")

    rows = []
    for index, sent in enumerate(root.findall(".//sentence")):
        tokens = []
        tags = []
        has_any_name = False

        def walk(node, active_label, started):
            nonlocal has_any_name
            for child in node:
                if child.tag == "name":
                    has_any_name = True
                    mapped = SIC2_TYPES.get(child.attrib.get("type", ""))
                    walk(child, mapped, [False])
                elif child.tag == "token":
                    tok = child.text or ""
                    if not tok:
                        continue
                    tokens.append(tok)
                    if active_label:
                        tags.append(f"{'I' if started[0] else 'B'}-{active_label}")
                        started[0] = True
                    else:
                        tags.append("O")
                else:
                    walk(child, active_label, started)

        walk(sent, None, [False])
        if len(tokens) < 4:
            continue
        text, spans = detokenize_with_spans(tokens, tags)
        gold = [{"start": s["start"], "end": s["end"], "type": s["type"]} for s in spans]
        rows.append({"id": f"sic2-{index}", "text": text, "gold": gold, "clean": not has_any_name})
    write("sic2-sv", rows)


if __name__ == "__main__":
    build_suc3()
    build_multiconer()
    build_ai4privacy()
    build_sic2()
