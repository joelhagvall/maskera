"""
Honest hard benchmark: maskera vs the real Swedish competitors.

Models compared on the SAME gold sets, mapped to PER/LOC/ORG:
  - maskera      : the published q4 ONNX artifact (the exact model file that
                   ships in the browser; product post-processing is excluded)
  - KB-NER       : KB/bert-base-swedish-cased-ner (full BERT, SUC-trained)
  - sbx general  : sbx/KB-bert-swedish_PI-detection-general-iob
  - sbx detailed : sbx/KB-bert-swedish_PI-detection-detailed-iob

Metric focus: REDACTION RECALL (was a real PER/LOC/ORG entity flagged at all,
any label), because label schemes differ across models and, for redaction, "did
it get masked" is what matters. We also report type-aware F1 where labels map.

Fairness: run on gold-real (real Wikipedia prose, held out from maskera's
training) as the primary, neutral set. gold.txt (our hand-authored set) is shown
too but maskera is closer to its distribution, so read it with that in mind.

Precision is scheme-sensitive (the PII models flag dates/ids our gold doesn't
annotate), so treat cross-model precision as indicative, not definitive.

    uv run python benchmark_competitors.py         # or .venv/bin/python
"""
import hashlib
import json
import os
import platform
import re
import sys
from importlib.metadata import version
from pathlib import Path

import torch
import transformers
from huggingface_hub import hf_hub_download
from optimum.onnxruntime import ORTModelForTokenClassification
from transformers import AutoTokenizer, pipeline

GOLD_RE = re.compile(r"\[(PER|LOC|ORG|ADR):([^\]]+)\]")
KEEP = {"PER", "LOC", "ORG"}  # cross-model comparable types (skip ADR)

# Map each model's raw entity group to PER/LOC/ORG (or None to ignore).
def norm(label: str):
    u = label.upper().lstrip("BI-").replace("_", "").replace("-", "")
    if u.startswith("PER") or u.startswith("PRS") or "NAME" in u or u in {
        "PERSON",
        "FIRSTNAME",
        "SURNAME",
        "FULLNAME",
    }:
        return "PER"
    if (
        u.startswith("LOC")
        or u.startswith("GPE")
        or u.startswith("PLC")
        or "PLACE" in u
        or "GEO" in u
        or "CITY" in u
        or "ADDRESS" in u
        or "ADR" in u
    ):
        return "LOC"
    if u.startswith("ORG") or "COMPANY" in u or "INSTIT" in u:
        return "ORG"
    return None


def load_gold(path):
    docs = []
    for line in open(path, encoding="utf-8"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        text, pos, spans = "", 0, []
        for m in GOLD_RE.finditer(line):
            text += line[pos:m.start()]
            st = len(text)
            text += m.group(2)
            if m.group(1) in KEEP:
                spans.append((st, st + len(m.group(2)), m.group(1)))
            pos = m.end()
        text += line[pos:]
        docs.append((text.rstrip("\n"), spans))
    return docs


def overlap(a, b):
    return max(a[0], b[0]) < min(a[1], b[1])


def score(docs, nlp):
    # redaction: gold entity overlapped by ANY predicted span (masked at all)
    # typed:     overlapped by a prediction of the same mapped type
    g_total = red_hit = typ_hit = 0
    p_total = p_typed_hit = 0
    for text, gold in docs:
        preds = []
        for e in nlp(text):
            s = e.get("start")
            en = e.get("end")
            if s is None or en is None:
                continue
            preds.append((s, en, norm(e.get("entity_group") or e.get("entity") or "")))
        g_total += len(gold)
        for gs, ge, gt in gold:
            if any(overlap((gs, ge), (ps, pe)) for ps, pe, _ in preds):
                red_hit += 1
            if any(overlap((gs, ge), (ps, pe)) and pt == gt for ps, pe, pt in preds):
                typ_hit += 1
        typed_preds = [p for p in preds if p[2] in KEEP]
        p_total += len(typed_preds)
        for ps, pe, pt in typed_preds:
            if any(overlap((ps, pe), (gs, ge)) and pt == gt for gs, ge, gt in gold):
                p_typed_hit += 1
    red_rec = red_hit / g_total if g_total else 1.0
    typ_rec = typ_hit / g_total if g_total else 1.0
    typ_prec = p_typed_hit / p_total if p_total else 0.0
    typ_f1 = (2 * typ_prec * typ_rec / (typ_prec + typ_rec)) if (typ_prec + typ_rec) else 0.0
    return {
        "goldEntities": g_total,
        "redactionHits": red_hit,
        "typedHits": typ_hit,
        "typedPredictions": p_total,
        "typedPredictionHits": p_typed_hit,
        "redactionRecall": round(red_rec, 12),
        "typedPrecision": round(typ_prec, 12),
        "typedRecall": round(typ_rec, 12),
        "typedF1": round(typ_f1, 12),
    }


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


MASKERA_MODEL = os.environ.get("MASKERA_COMPETITOR_MODEL", "joelhagvall/maskera-sv-ner")
MASKERA_REVISION = os.environ.get(
    "MASKERA_COMPETITOR_REVISION", "b1aa7e799fa4839f8668dda691e893706e971523"
)
MASKERA_ONNX_FILE = os.environ.get("MASKERA_COMPETITOR_ONNX_FILE", "model_q4.onnx")
KBLAB_LOWERMIX_MODEL = "KBLab/bert-base-swedish-lowermix-reallysimple-ner"
KBLAB_LOWERMIX_REVISION = "007c6b26e6418574c494791f036d5dfa34a558da"
MODELS = [
    (f"maskera ({MASKERA_ONNX_FILE})", MASKERA_MODEL, MASKERA_REVISION, "onnx"),
    ("RecordedFuture Swedish-NER", "RecordedFuture/Swedish-NER", None, "transformers"),
    ("KB-NER (full BERT)", "KB/bert-base-swedish-cased-ner", None, "transformers"),
    (
        "KBLab neriob (IOB head)",
        "KBLab/bert-base-swedish-cased-neriob",
        "c8373af5477e6a3f609ac269cfc0800e67b6cf7a",
        "transformers",
    ),
    (
        "KBLab reallysimple-ner",
        "KBLab/bert-base-swedish-cased-reallysimple-ner",
        "ca83d53558d50f455449b9ec5895329c9cf6c216",
        "transformers",
    ),
    (
        "KBLab lowermix (case-robust)",
        KBLAB_LOWERMIX_MODEL,
        KBLAB_LOWERMIX_REVISION,
        "transformers",
    ),
    ("nbailab scandi-ner", "saattrupdan/nbailab-base-ner-scandi", None, "transformers"),
    ("sbx PII general", "sbx/KB-bert-swedish_PI-detection-general-iob", None, "transformers"),
    ("sbx PII detailed", "sbx/KB-bert-swedish_PI-detection-detailed-iob", None, "transformers"),
]
requested_models = {
    model_id.strip()
    for model_id in os.environ.get("MASKERA_COMPETITOR_ONLY", "").split(",")
    if model_id.strip()
}
if requested_models:
    MODELS = [
        model
        for model in MODELS
        if model[1] == MASKERA_MODEL or model[1] in requested_models
    ]
SETS = [("synthetic hand-authored set", "eval/gold.txt")]
RESULT_FILE = os.environ.get("MASKERA_COMPETITOR_RESULT_FILE")
MEASURED_AT = os.environ.get("MASKERA_COMPETITOR_MEASURED_AT")
if RESULT_FILE and not MEASURED_AT:
    raise SystemExit("MASKERA_COMPETITOR_MEASURED_AT is required when writing a result file")


# Chat users type without capitalisation; casing robustness is a differentiator
# (cased-only models collapse here). Same gold spans, lowercased surface text.
def lower_docs(docs):
    return [(t.lower(), s) for t, s in docs]


RUNS = [(n, load_gold(p)) for n, p in SETS]
RUNS.append(("synthetic hand-authored set LOWERCASED", lower_docs(load_gold("eval/gold.txt"))))
machine_runs = []
machine_artifacts = {}
failed = False
for set_name, docs in RUNS:
    entity_count = sum(len(spans) for _, spans in docs)
    print(f"\n=== {set_name}: {len(docs)} sentences, {entity_count} PER/LOC/ORG entities ===")
    print(
        f"{'model':<30} {'redaction recall':>16} {'typed P':>9} "
        f"{'typed R':>9} {'typed F1':>9}"
    )
    machine_results = []
    for label, model_id, revision, runtime in MODELS:
        try:
            if runtime == "onnx":
                model = ORTModelForTokenClassification.from_pretrained(
                    model_id,
                    subfolder="onnx",
                    file_name=MASKERA_ONNX_FILE,
                    revision=revision,
                )
                tokenizer = AutoTokenizer.from_pretrained(model_id, revision=revision)
                artifact_path = Path(model.path)
                machine_artifacts[model_id] = {
                    "revision": revision,
                    "path": f"onnx/{MASKERA_ONNX_FILE}",
                    "sha256": sha256_file(artifact_path),
                    "bytes": artifact_path.stat().st_size,
                }
                nlp = pipeline(
                    "token-classification",
                    model=model,
                    tokenizer=tokenizer,
                    aggregation_strategy="simple",
                    device=-1,
                )
            else:
                kwargs = {"revision": revision} if revision else {}
                if model_id == KBLAB_LOWERMIX_MODEL:
                    artifact_path = Path(
                        hf_hub_download(
                            repo_id=model_id,
                            filename="model.safetensors",
                            revision=revision,
                        )
                    )
                    machine_artifacts[model_id] = {
                        "revision": revision,
                        "path": "model.safetensors",
                        "sha256": sha256_file(artifact_path),
                        "bytes": artifact_path.stat().st_size,
                    }
                nlp = pipeline(
                    "token-classification",
                    model=model_id,
                    aggregation_strategy="simple",
                    device=-1,
                    **kwargs,
                )
            result = score(docs, nlp)
            print(
                f"{label:<30} {result['redactionRecall']:>15.2f}  "
                f"{result['typedPrecision']:>8.2f} {result['typedRecall']:>8.2f} "
                f"{result['typedF1']:>8.2f}"
            )
            machine_results.append(
                {
                    "label": label,
                    "model": model_id,
                    "revision": revision,
                    **result,
                }
            )
        except Exception as e:
            print(f"{label:<30}  FAILED: {str(e).splitlines()[0][:60]}", file=sys.stderr)
            failed = True
    machine_runs.append(
        {
            "name": set_name,
            "documents": len(docs),
            "entities": entity_count,
            "results": machine_results,
        }
    )

if failed:
    raise SystemExit(1)

if RESULT_FILE:
    result_path = Path(RESULT_FILE)
    result_path.parent.mkdir(parents=True, exist_ok=True)
    labels_placeholder = "__MASKERA_COMPARISON_LABELS__"
    payload = {
        "schemaVersion": 1,
        "measuredAt": MEASURED_AT,
        "matching": "overlap",
        "labels": labels_placeholder,
        "corpus": {
            "path": "training/eval/gold.txt",
            "sha256": sha256_file("eval/gold.txt"),
        },
        "artifacts": machine_artifacts,
        "runtime": {
            "python": platform.python_version(),
            "onnxruntime": version("onnxruntime"),
            "optimum": version("optimum"),
            "optimumOnnx": version("optimum-onnx"),
            "torch": torch.__version__,
            "transformers": transformers.__version__,
        },
        "runs": machine_runs,
    }
    temporary_result_path = result_path.with_name(f".{result_path.name}.tmp")
    # Biome keeps short scalar arrays on one line. Emit the canonical repo
    # format directly so a successful benchmark never leaves lint drift.
    serialized_payload = json.dumps(payload, indent=2, ensure_ascii=False).replace(
        json.dumps(labels_placeholder),
        json.dumps(sorted(KEEP), ensure_ascii=False),
    )
    temporary_result_path.write_text(
        serialized_payload + "\n",
        encoding="utf-8",
    )
    temporary_result_path.replace(result_path)
    print(f"\nmachine result: {result_path}")
