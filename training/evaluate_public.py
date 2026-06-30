"""
Independent benchmark: evaluate the maskera models vs Rampart on a PUBLIC,
third-party-labeled Swedish NER dataset (no shared author with our data).

Restricted to PER / LOC / ORG — the types public NER sets share with us
(they don't annotate street addresses or structured PII).

    uv run python evaluate_public.py
"""
import sys

import torch
from datasets import load_dataset
from transformers import pipeline

TYPES = ["PER", "LOC", "ORG"]

RAMPART_MAP = {
    "GIVENNAME": "PER", "SURNAME": "PER", "MIDDLENAME": "PER",
    "FIRSTNAME": "PER", "LASTNAME": "PER", "NAME": "PER", "FULLNAME": "PER",
    "CITY": "LOC", "STATE": "LOC", "COUNTY": "LOC", "COUNTRY": "LOC",
    "ORGANIZATION": "ORG", "COMPANYNAME": "ORG",
}

import re  # noqa: E402


def norm(group):
    return re.sub(r"^[BI]-", "", group).replace("_", "").replace(" ", "").upper()


def gold_type(name):
    k = norm(name)
    if k in ("PER", "PRS", "PERSON"):
        return "PER"
    if k in ("LOC", "GPE", "PLACE"):
        return "LOC"
    if k in ("ORG", "ORGANIZATION"):
        return "ORG"
    return None


def merge_spans(spans):
    out = []
    for s in sorted(spans):
        if out and s[2] == out[-1][2] and s[0] - out[-1][1] <= 1:
            out[-1] = (out[-1][0], max(out[-1][1], s[1]), s[2])
        else:
            out.append(list(s))
    return [tuple(s) for s in out]


def overlaps(a, b):
    return max(a[0], b[0]) < min(a[1], b[1])


def score(gold, pred, exact):
    used, tp = set(), 0
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


def load_public(limit):
    """Try several public Swedish NER datasets; use the first that loads."""
    candidates = [
        ("KBLab/sucx3_ner", "simple_tags", "test"),
        ("swedish_ner_corpus", None, "test"),
        ("wikiann", "sv", "test"),
    ]
    for repo, cfg, split in candidates:
        try:
            ds = load_dataset(repo, cfg, split=split) if cfg else load_dataset(repo, split=split)
            tag_col = "ner_tags" if "ner_tags" in ds.column_names else "tags"
            names = ds.features[tag_col].feature.names
            print(f"== using {repo}" + (f" ({cfg})" if cfg else "") + f" / {split} ==")
            return ds.select(range(min(limit, len(ds)))), tag_col, names
        except Exception as e:  # noqa: BLE001
            print(f"   skip {repo}: {str(e)[:90]}", file=sys.stderr)
    raise SystemExit("No public Swedish NER dataset could be loaded.")


def example_to_text_spans(tokens, tag_ids, names):
    """Join tokens into text and turn BIO word-tags into char spans."""
    text, offsets = "", []
    for i, t in enumerate(tokens):
        if i:
            text += " "
        offsets.append(len(text))
        text += t
    spans, cur = [], None
    for i, tid in enumerate(tag_ids):
        name = names[tid]
        typ = gold_type(name)
        start = name.startswith("B-") or (cur and cur[2] != typ)
        if typ is None:
            cur = None
            continue
        s0 = offsets[i]
        e0 = offsets[i] + len(tokens[i])
        if cur and cur[2] == typ and not name.startswith("B-"):
            cur = (cur[0], e0, typ)
            spans[-1] = cur
        else:
            cur = (s0, e0, typ)
            spans.append(cur)
    return text, spans


def get_preds(nlp, text, mapper):
    out = []
    for e in nlp(text):
        if e.get("start") is None or e.get("end") is None:
            continue
        t = mapper(e["entity_group"])
        if t in TYPES:
            out.append((e["start"], e["end"], t))
    return merge_spans(out)


def evaluate(name, nlp, mapper, examples, exact=False):
    agg = {t: [0, 0, 0] for t in TYPES}
    total = [0, 0, 0]
    for text, gold in examples:
        pred = get_preds(nlp, text, mapper)
        for t in TYPES:
            g = [s for s in gold if s[2] == t]
            p = [s for s in pred if s[2] == t]
            tp, fp, fn = score(g, p, exact)
            agg[t][0] += tp
            agg[t][1] += fp
            agg[t][2] += fn
        tp, fp, fn = score(gold, pred, exact)
        total = [total[0] + tp, total[1] + fp, total[2] + fn]
    label = "exact" if exact else "overlap"
    print(f"\n=== {name} ({label}) ===")
    for t in TYPES:
        p, r, f = prf(*agg[t])
        print(f"{t:4} P {p:.2f} R {r:.2f} F1 {f:.2f}  ({agg[t][0]}/{agg[t][1]}/{agg[t][2]})")
    p, r, f = prf(*total)
    print(f"ALL  P {p:.2f} R {r:.2f} F1 {f:.2f}  ({total[0]}/{total[1]}/{total[2]})")
    return f


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 500
    ds, tag_col, names = load_public(limit)
    examples = []
    n_ent = 0
    for row in ds:
        text, spans = example_to_text_spans(row["tokens"], row[tag_col], names)
        if spans:
            examples.append((text, spans))
            n_ent += len(spans)
    print(f"Eval: {len(examples)} sentences with entities, {n_ent} PER/LOC/ORG spans")

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    ours = lambda g: norm(g) if norm(g) in TYPES else None
    rampart = lambda g: RAMPART_MAP.get(norm(g))

    def load_local(path):
        return pipeline("token-classification", model=path, tokenizer=path,
                        aggregation_strategy="simple", device=device)

    def load_rampart():
        from optimum.onnxruntime import ORTModelForTokenClassification
        from transformers import AutoTokenizer
        repo = "nationaldesignstudio/rampart"
        m = ORTModelForTokenClassification.from_pretrained(repo, subfolder="onnx", file_name="model_q4.onnx")
        return pipeline("token-classification", model=m,
                        tokenizer=AutoTokenizer.from_pretrained(repo),
                        aggregation_strategy="simple")

    models = [
        ("teacher v3 (KB-BERT)", lambda: load_local("model-v3"), ours),
        ("student v3 (shipped)", lambda: load_local("student-v3-trimmed"), ours),
        ("Rampart", load_rampart, rampart),
    ]
    summary = {}
    for name, loader, mapper in models:
        try:
            nlp = loader()
        except Exception as e:  # noqa: BLE001
            print(f"\n!! could not load {name}: {e}", file=sys.stderr)
            continue
        fo = evaluate(name, nlp, mapper, examples, exact=False)
        summary[name] = fo

    print("\n===== SUMMARY (overall overlap F1, PER/LOC/ORG) =====")
    for name, f in summary.items():
        print(f"  {name:22} {f:.3f}")


if __name__ == "__main__":
    main()
