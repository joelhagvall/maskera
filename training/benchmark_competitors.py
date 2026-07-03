"""
Honest hard benchmark: maskera vs the real Swedish competitors.

Models compared on the SAME gold sets, mapped to PER/LOC/ORG:
  - maskera      : our distilled student (student-v4, fp32 safetensors)
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
import re
import sys

from transformers import pipeline

GOLD_RE = re.compile(r"\[(PER|LOC|ORG|ADR):([^\]]+)\]")
KEEP = {"PER", "LOC", "ORG"}  # cross-model comparable types (skip ADR)

# Map each model's raw entity group to PER/LOC/ORG (or None to ignore).
def norm(label: str):
    u = label.upper().lstrip("BI-").replace("_", "").replace("-", "")
    if u.startswith("PER") or u.startswith("PRS") or "NAME" in u or u in {"PERSON", "FIRSTNAME", "SURNAME", "FULLNAME"}:
        return "PER"
    if u.startswith("LOC") or u.startswith("GPE") or u.startswith("PLC") or "PLACE" in u or "GEO" in u or "CITY" in u or "ADDRESS" in u or "ADR" in u:
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
    return red_rec, typ_prec, typ_rec, typ_f1


MODELS = [
    ("maskera (student-v4, fp32)", "student-v4"),
    ("KB-NER (full BERT)", "KB/bert-base-swedish-cased-ner"),
    ("sbx PII general", "sbx/KB-bert-swedish_PI-detection-general-iob"),
    ("sbx PII detailed", "sbx/KB-bert-swedish_PI-detection-detailed-iob"),
]
SETS = [("gold-real (independent)", "eval/gold-real.txt"), ("our set (maskera-favouring)", "eval/gold.txt")]

for set_name, path in SETS:
    docs = load_gold(path)
    print(f"\n=== {set_name}: {len(docs)} sentences, {sum(len(s) for _, s in docs)} PER/LOC/ORG entities ===")
    print(f"{'model':<30} {'redaction recall':>16} {'typed P':>9} {'typed R':>9} {'typed F1':>9}")
    for label, model_id in MODELS:
        try:
            nlp = pipeline("token-classification", model=model_id, aggregation_strategy="simple", device=-1)
            rr, tp, tr, tf = score(docs, nlp)
            print(f"{label:<30} {rr:>15.2f}  {tp:>8.2f} {tr:>8.2f} {tf:>8.2f}")
        except Exception as e:
            print(f"{label:<30}  FAILED: {str(e).splitlines()[0][:60]}", file=sys.stderr)
