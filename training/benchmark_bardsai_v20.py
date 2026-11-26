"""
Reproducible comparison of bardsai/eu-pii-anonimization-multilang-v3 (INT8 ONNX)
on the exact same Swedish corpus and overlap scoring used in
training/benchmark_competitors.py (training/eval/gold.txt, 121 texts, 211 PER/LOC/ORG).

Run:
    cd training && .venv/bin/python benchmark_bardsai_v20.py
"""
import hashlib
import importlib.util
import json
import os
import platform
import re
from importlib.metadata import version
from pathlib import Path

import onnxruntime
import torch
import transformers
from huggingface_hub import hf_hub_download
from transformers import PreTrainedTokenizerFast

REPO = "bardsai/eu-pii-anonimization-multilang-v3"
REVISION = "091984b5fbce4c161abc4776ed0f4e3206e1b374"
ONNX_PATH = "onnx/model_quantized.onnx"
MEASURED_AT = os.environ.get("MASKERA_COMPETITOR_MEASURED_AT", "2026-11-26")
RESULT_FILE = os.environ.get(
    "MASKERA_BARDSAI_RESULT_FILE", "../docs/benchmark-bardsai-v20.json"
)

GOLD_RE = re.compile(r"\[(PER|LOC|ORG|ADR):([^\]]+)\]")
KEEP = {"PER", "LOC", "ORG"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_gold(path: str):
    docs = []
    for line in open(path, encoding="utf-8"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        text, pos, spans = "", 0, []
        for m in GOLD_RE.finditer(line):
            text += line[pos : m.start()]
            st = len(text)
            text += m.group(2)
            if m.group(1) in KEEP:
                spans.append((st, st + len(m.group(2)), m.group(1)))
            pos = m.end()
        text += line[pos:]
        docs.append((text.rstrip("\n"), spans))
    return docs


def norm(label: str):
    u = label.upper()
    if u in {"PERSON_NAME", "PERSON_ALIAS", "PROPER_NAME"}:
        return "PER"
    if u in {"LOCATION", "GEO_LOCATION", "POSTAL_ADDRESS"}:
        return "LOC"
    if u in {"ORGANIZATION_NAME"}:
        return "ORG"
    return None


def overlap(a, b) -> bool:
    return max(a[0], b[0]) < min(a[1], b[1])


def load_detector():
    helper_path = Path(hf_hub_download(REPO, "pii_detector.py", revision=REVISION))
    spec = importlib.util.spec_from_file_location("pii_detector", helper_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    tok_file = Path(hf_hub_download(REPO, "tokenizer.json", revision=REVISION))
    tok_cfg = json.load(
        open(hf_hub_download(REPO, "tokenizer_config.json", revision=REVISION), encoding="utf-8")
    )
    cfg = json.load(open(hf_hub_download(REPO, "config.json", revision=REVISION), encoding="utf-8"))
    onnx_file = Path(hf_hub_download(REPO, ONNX_PATH, revision=REVISION))

    det = object.__new__(mod.PIIDetector)
    det.device = "cpu"
    det.tok = PreTrainedTokenizerFast(
        tokenizer_file=str(tok_file),
        bos_token=tok_cfg.get("bos_token"),
        eos_token=tok_cfg.get("eos_token"),
        unk_token=tok_cfg.get("unk_token"),
        sep_token=tok_cfg.get("sep_token"),
        pad_token=tok_cfg.get("pad_token"),
        cls_token=tok_cfg.get("cls_token"),
        mask_token=tok_cfg.get("mask_token"),
    )
    det.sess = onnxruntime.InferenceSession(str(onnx_file), providers=["CPUExecutionProvider"])
    det.model = None
    det.id2label = {int(k): v for k, v in cfg["id2label"].items()}
    det.max_len, det.stride = 512, 128
    L = len(det.id2label)
    det.types = sorted({l.split("-", 1)[1] for l in det.id2label.values() if l != "O"})
    tix = {t: i for i, t in enumerate(det.types)}
    det.M = torch.zeros(L, len(det.types) + 1)
    for i in range(L):
        lab = det.id2label[i]
        det.M[i, len(det.types) if lab == "O" else tix[lab.split("-", 1)[1]]] = 1
    det.is_b = torch.tensor(
        [1.0 if det.id2label[i].startswith(("B-", "S-")) else 0.0 for i in range(L)]
    )
    return det, onnx_file, tok_file


def score(docs, det):
    g_total = red_hit = typ_hit = p_total = p_typed_hit = 0
    for text, gold in docs:
        preds = [(sp["start"], sp["end"], norm(sp["label"])) for sp in det.predict(text)]
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


def main():
    det, onnx_file, tok_file = load_detector()
    docs = load_gold("eval/gold.txt")
    runs = [
        ("synthetic hand-authored set", docs),
        ("synthetic hand-authored set LOWERCASED", [(t.lower(), s) for t, s in docs]),
    ]
    machine_runs = []
    for name, run_docs in runs:
        res = score(run_docs, det)
        entity_count = sum(len(s) for _, s in run_docs)
        print(
            f"{name:<40} {res['redactionHits']}/{res['goldEntities']} "
            f"({res['redactionRecall']*100:.1f}%) typed F1 {res['typedF1']*100:.1f}%"
        )
        machine_runs.append(
            {
                "name": name,
                "documents": len(run_docs),
                "entities": entity_count,
                "results": [
                    {
                        "label": "Bards AI EU PII v3 (int8)",
                        "model": REPO,
                        "revision": REVISION,
                        **res,
                    }
                ],
            }
        )

    payload = {
        "schemaVersion": 1,
        "measuredAt": MEASURED_AT,
        "matching": "overlap",
        "labels": sorted(KEEP),
        "corpus": {
            "path": "training/eval/gold.txt",
            "sha256": sha256_file(Path("eval/gold.txt")),
        },
        "artifacts": {
            REPO: {
                "revision": REVISION,
                "path": ONNX_PATH,
                "sha256": sha256_file(onnx_file),
                "bytes": onnx_file.stat().st_size,
                "tokenizerBytes": tok_file.stat().st_size,
            }
        },
        "runtime": {
            "python": platform.python_version(),
            "onnxruntime": version("onnxruntime"),
            "torch": torch.__version__,
            "transformers": transformers.__version__,
        },
        "runs": machine_runs,
    }
    out_path = Path(RESULT_FILE)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out_path}")


if __name__ == "__main__":
    main()
