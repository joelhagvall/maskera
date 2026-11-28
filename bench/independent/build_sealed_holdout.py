"""
Build the untouched Swedish sealed-holdout corpora in the shared JSONL format.

STRICT SEALED PROTOCOL:
  - Every source is downloaded at a pinned revision / commit SHA.
  - Output lands in tmp/indep/sealed_corpora/ (gitignored).
  - Never inspect rows or errors from these corpora to tune any model.
  - Evaluate frozen release candidates and external baselines once, identically.

Corpora:
  uner-sv-talbanken-cased / -lower   UniversalNER Swedish Talbanken UD test split
                                     (informative prose, gold PER/LOC/ORG + clean sentences)
  uner-sv-pud-cased / -lower         UniversalNER Swedish PUD UD test split
                                     (parallel news/Wikipedia, gold PER/LOC/ORG + clean sentences)
  wikiann-sv                         unimelb-nlp/wikiann Swedish test split (10,000 texts, PER/LOC/ORG)
  swedish-medical-1177               community-datasets/swedish_medical_ner 1177 Vårdguiden (927 texts,
                                     real clinical/medical prose; clean=True for false-flag measurement)
  swener-1800                        Riksarkivet/swener_1800 eval split (170 archival letters/protocols,
                                     2,488 PER / 1,356 LOC / 455 ORG)
"""

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

import pyarrow.parquet as pq
from huggingface_hub import hf_hub_download

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "training"))
from benchmark_suc3_external_v20 import detokenize_with_spans  # noqa: E402

OUT = Path("tmp/indep/sealed_corpora")

UNER_TALBANKEN_SHA = "dbb692085267da83a35d1e1d2c111671b3c7c46b"
UNER_PUD_SHA = "7fed5e267858a295f53083051a16d73c76f60f07"
WIKIANN_REV = "f0a3be6dc5564c0cc4150bb660144800a1f539d4"
MED_REV = "637834ee9f899513f6d1382b8057c03a724f2fc8"
SWENER1800_REV = "eec7d239d7e4bd3e7961680739c0dbcb9cb8b55d"

WIKIANN_NAMES = ["O", "B-PER", "I-PER", "B-ORG", "I-ORG", "B-LOC", "I-LOC"]
SWENER1800_MAP = {
    "PER": "PER",
    "LOC": "LOC",
    "ORG-INST": "ORG",
    "ORG-COMP": "ORG",
    "ORG-OTH": "ORG",
}


def write_jsonl(name, rows):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{name}.jsonl"
    body = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows)
    path.write_text(body, encoding="utf-8")
    digest = hashlib.sha256(body.encode("utf-8")).hexdigest()[:16]
    n_clean = sum(1 for r in rows if r.get("clean"))
    n_gold = sum(len(r["gold"]) for r in rows)
    print(f"{name:28s}: {len(rows):5d} texts, {n_gold:5d} gold spans, {n_clean:4d} clean  sha256={digest}")


def parse_uner_iob2(url, prefix):
    req = urllib.request.Request(url, headers={"User-Agent": "maskera-sealed-holdout"})
    raw = urllib.request.urlopen(req, timeout=30).read().decode("utf-8")
    cased, lower = [], []
    sent_id = None
    tokens, tags = [], []

    def flush():
        if len(tokens) < 4:
            return
        # Map UNER tags (B-PER/I-PER/B-LOC/I-LOC/B-ORG/I-ORG/O)
        norm_tags = [t if t.split("-")[-1] in ("PER", "LOC", "ORG") else "O" for t in tags]
        text, spans = detokenize_with_spans(tokens, norm_tags)
        gold = [{"start": s["start"], "end": s["end"], "type": s["type"]} for s in spans]
        is_clean = all(t == "O" for t in tags)
        rid = sent_id or f"{prefix}-{len(cased)}"
        cased.append({"id": rid, "text": text, "gold": gold, "clean": is_clean})
        lower.append({"id": f"{rid}-lower", "text": text.lower(), "gold": gold, "clean": is_clean})

    for line in raw.splitlines():
        if line.startswith("# sent_id = "):
            sent_id = line.split("=", 1)[1].strip()
        elif not line.strip():
            flush()
            sent_id, tokens, tags = None, [], []
        elif line.startswith("#"):
            continue
        else:
            parts = line.split("\t")
            if len(parts) >= 3 and "-" not in parts[0] and "." not in parts[0]:
                tokens.append(parts[1])
                tags.append(parts[2])
    flush()
    write_jsonl(f"{prefix}-cased", cased)
    write_jsonl(f"{prefix}-lower", lower)


def build_wikiann():
    local = hf_hub_download(
        "unimelb-nlp/wikiann",
        "sv/test-00000-of-00001.parquet",
        repo_type="dataset",
        revision=WIKIANN_REV,
    )
    t = pq.read_table(local)
    rows = []
    for idx, (toks, tag_ids) in enumerate(zip(t["tokens"].to_pylist(), t["ner_tags"].to_pylist())):
        if len(toks) < 3:
            continue
        tags = [WIKIANN_NAMES[i] for i in tag_ids]
        text, spans = detokenize_with_spans(toks, tags)
        gold = [{"start": s["start"], "end": s["end"], "type": s["type"]} for s in spans]
        rows.append({"id": f"wikiann-sv-{idx}", "text": text, "gold": gold, "clean": len(gold) == 0})
    write_jsonl("wikiann-sv", rows)


def build_medical_1177():
    local = hf_hub_download(
        "community-datasets/swedish_medical_ner",
        "1177/train-00000-of-00001.parquet",
        repo_type="dataset",
        revision=MED_REV,
    )
    t = pq.read_table(local)
    rows = []
    for idx, (sid, sent) in enumerate(zip(t["sid"].to_pylist(), t["sentence"].to_pylist())):
        text = (sent or "").strip()
        if len(text.split()) < 4:
            continue
        rows.append({"id": f"med1177-{sid or idx}", "text": text, "gold": [], "clean": True})
    write_jsonl("swedish-medical-1177", rows)


def build_swener_1800():
    local = hf_hub_download(
        "Riksarkivet/swener_1800",
        "data/eval-00000-of-00001.parquet",
        repo_type="dataset",
        revision=SWENER1800_REV,
    )
    t = pq.read_table(local)
    rows = []
    for rid, text, types, starts, ends in zip(
        t["id"].to_pylist(),
        t["text"].to_pylist(),
        t["entity_types"].to_pylist(),
        t["entity_start_chars"].to_pylist(),
        t["entity_end_chars"].to_pylist(),
    ):
        gold = []
        for et, s, e in zip(types, starts, ends):
            mapped = SWENER1800_MAP.get(et)
            if mapped and 0 <= s < e <= len(text):
                gold.append({"start": int(s), "end": int(e), "type": mapped})
        # Deduplicate exact nested spans of same type
        seen = set()
        dedup = []
        for g in sorted(gold, key=lambda x: (x["start"], x["end"], x["type"])):
            key = (g["start"], g["end"], g["type"])
            if key not in seen:
                seen.add(key)
                dedup.append(g)
        rows.append({"id": f"swener1800-{rid}", "text": text, "gold": dedup, "clean": False})
    write_jsonl("swener-1800", rows)


if __name__ == "__main__":
    parse_uner_iob2(
        f"https://raw.githubusercontent.com/UniversalNER/UNER_Swedish-Talbanken/{UNER_TALBANKEN_SHA}/sv_talbanken-ud-test.iob2",
        "uner-sv-talbanken",
    )
    parse_uner_iob2(
        f"https://raw.githubusercontent.com/UniversalNER/UNER_Swedish-PUD/{UNER_PUD_SHA}/sv_pud-ud-test.iob2",
        "uner-sv-pud",
    )
    build_wikiann()
    build_medical_1177()
    build_swener_1800()
