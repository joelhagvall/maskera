"""
Evaluate Swedish NER models on the hand-authored gold set (eval/gold.txt).

Compares the teacher (KB-BERT) and the distilled student on
span-level precision / recall / F1 (type-aware), overall and per entity type.

    uv run python evaluate.py
"""
import re
import sys

import torch
from transformers import pipeline

TYPES = ["PER", "LOC", "ORG", "ADR"]
MARKUP = re.compile(r"\[(PER|LOC|ORG|ADR):([^\]]+)\]")


def normalize(group):
    return re.sub(r"^[BI]-", "", group).replace("_", "").replace(" ", "").upper()


def parse_gold(path):
    examples = []
    seen_labels = set()
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        text, spans, cursor = "", [], 0
        pos = 0
        for m in MARKUP.finditer(line):
            text += line[pos:m.start()]
            cursor = len(text)
            val = m.group(2)
            text += val
            spans.append((cursor, cursor + len(val), m.group(1)))
            pos = m.end()
        text += line[pos:]
        examples.append({"text": text, "spans": spans})
        seen_labels.update(t for *_, t in [(s,) for s in spans])
    return examples


def merge_spans(spans):
    """Merge adjacent same-type spans, mirroring @maskera/ner's reconstruct():
    the HF pipeline can split one entity across subword fragments."""
    out = []
    for s in sorted(spans):
        if out and s[2] == out[-1][2] and s[0] - out[-1][1] <= 1:
            out[-1] = (out[-1][0], max(out[-1][1], s[1]), s[2])
        else:
            out.append(list(s))
    return [tuple(s) for s in out]


def get_preds(nlp, text, mapper):
    out = []
    for e in nlp(text):
        if e.get("start") is None or e.get("end") is None:
            continue
        t = mapper(e["entity_group"])
        if t in TYPES:
            out.append((e["start"], e["end"], t))
    return merge_spans(out)


def overlaps(a, b):
    return max(a[0], b[0]) < min(a[1], b[1])


def score(gold, pred, exact):
    """Greedy one-to-one, type-aware matching. Returns (tp, fp, fn)."""
    used = set()
    tp = 0
    for g in gold:
        for i, p in enumerate(pred):
            if i in used or p[2] != g[2]:
                continue
            ok = (p[0] == g[0] and p[1] == g[1]) if exact else overlaps(p, g)
            if ok:
                tp += 1
                used.add(i)
                break
    return tp, len(pred) - tp, len(gold) - tp


def prf(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return p, r, f


def evaluate(name, nlp, mapper, examples, exact=False):
    agg = {t: [0, 0, 0] for t in TYPES}
    total = [0, 0, 0]
    for ex in examples:
        pred = get_preds(nlp, ex["text"], mapper)
        for t in TYPES:
            g = [s for s in ex["spans"] if s[2] == t]
            p = [s for s in pred if s[2] == t]
            tp, fp, fn = score(g, p, exact)
            agg[t][0] += tp
            agg[t][1] += fp
            agg[t][2] += fn
        tp, fp, fn = score(ex["spans"], pred, exact)
        total[0] += tp
        total[1] += fp
        total[2] += fn

    print(f"\n=== {name} ({'exact' if exact else 'overlap'} span match) ===")
    print(f"{'type':6} {'P':>6} {'R':>6} {'F1':>6}  {'tp/fp/fn'}")
    for t in TYPES:
        p, r, f = prf(*agg[t])
        print(f"{t:6} {p:6.2f} {r:6.2f} {f:6.2f}  {agg[t][0]}/{agg[t][1]}/{agg[t][2]}")
    p, r, f = prf(*total)
    print(f"{'ALL':6} {p:6.2f} {r:6.2f} {f:6.2f}  {total[0]}/{total[1]}/{total[2]}")
    return f


def main():
    examples = parse_gold("eval/gold.txt")
    n_ent = sum(len(e["spans"]) for e in examples)
    print(f"Gold set: {len(examples)} sentences, {n_ent} entities")

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    ours = lambda g: normalize(g) if normalize(g) in TYPES else None

    def load_local(path):
        return pipeline("token-classification", model=path, tokenizer=path,
                        aggregation_strategy="simple", device=device)

    def load_q4():
        from optimum.onnxruntime import ORTModelForTokenClassification
        from transformers import AutoTokenizer
        m = ORTModelForTokenClassification.from_pretrained(
            "student-trimmed-onnx", file_name="onnx/model_q4.onnx"
        )
        return pipeline("token-classification", model=m,
                        tokenizer=AutoTokenizer.from_pretrained("student-trimmed-onnx"),
                        aggregation_strategy="simple")

    models = [
        ("teacher (KB-BERT)", load_local, "model", ours),
        ("student (distilled)", load_local, "student-model", ours),
        ("student (trimmed 56MB)", load_local, "student-trimmed", ours),
        ("student (q4 combo 40MB)", lambda _: load_q4(), None, ours),
    ]
    summary = {}
    for name, loader, path, mapper in models:
        try:
            nlp = loader(path)
        except Exception as e:  # noqa: BLE001
            print(f"\n!! could not load {name}: {e}", file=sys.stderr)
            continue
        f_overlap = evaluate(name, nlp, mapper, examples, exact=False)
        f_exact = evaluate(name, nlp, mapper, examples, exact=True)
        summary[name] = (f_overlap, f_exact)

    print("\n================ SUMMARY (overall F1) ================")
    print(f"{'model':22} {'overlap':>8} {'exact':>8}")
    for name, (fo, fe) in summary.items():
        print(f"{name:22} {fo:8.3f} {fe:8.3f}")


if __name__ == "__main__":
    main()
