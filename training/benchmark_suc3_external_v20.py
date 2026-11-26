"""
Reproducible external Swedish benchmark on KBLab/sucx3_ner (SUC 3.0 test.jsonl,
seed 42: 500 PRS sentences with 627 person entities + 500 clean 0-entity sentences)
plus lowercase homograph-name recall and word-use false-positive checks.

Downloads KBLab/sucx3_ner on demand from Hugging Face so zero external corpus
sentences are checked into git.

Evaluates:
  - OpenAI Privacy Filter (openai/privacy-filter q4 ONNX + constrained Viterbi)
  - Microsoft Presidio (sv_core_news_lg + PRS->PERSON + Swedish ID recognizers)

Writes the prepared sample JSONs to --out-dir so a Node runner can evaluate
Maskera v20 and swedish-pii on the exact same sentences.
"""

import argparse
import json
import random
import re
import tarfile
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer

SUC_REPO = "KBLab/sucx3_ner"
SUC_REV = "96acc4fd6dad"
OPENAI_REPO = "openai/privacy-filter"
OPENAI_REV = "7ffa9a043d54d1be65afb281eddf0ffbe629385b"
NO_SPACE_BEFORE = {".", ",", "?", "!", ":", ";", ")", "]", "}", "%", "...", "”", "’"}
NO_SPACE_AFTER = {"(", "[", "{", "“", "‘"}


def detokenize_with_spans(tokens, ner_tags):
    text = ""
    tok_offsets = []
    for i, tok in enumerate(tokens):
        if i > 0:
            prev = tokens[i - 1]
            if tok not in NO_SPACE_BEFORE and prev not in NO_SPACE_AFTER:
                text += " "
        start = len(text)
        text += tok
        end = len(text)
        tok_offsets.append((start, end))

    spans = []
    cur_s = cur_e = cur_type = None
    for (s, e), tag in zip(tok_offsets, ner_tags):
        if tag.startswith("B-"):
            if cur_type is not None:
                spans.append({"start": cur_s, "end": cur_e, "type": cur_type, "text": text[cur_s:cur_e]})
            cur_s, cur_e, cur_type = s, e, tag[2:]
        elif tag.startswith("I-") and cur_type == tag[2:]:
            cur_e = e
        else:
            if cur_type is not None:
                spans.append({"start": cur_s, "end": cur_e, "type": cur_type, "text": text[cur_s:cur_e]})
                cur_type = None
    if cur_type is not None:
        spans.append({"start": cur_s, "end": cur_e, "type": cur_type, "text": text[cur_s:cur_e]})
    return text, spans


def build_suc3_sample(seed: int = 42, n_prs: int = 500, n_clean: int = 500):
    archive = hf_hub_download(SUC_REPO, "data/simple_tags/cased.tar.gz", repo_type="dataset", revision=SUC_REV)
    prs_docs, clean_docs = [], []
    with tarfile.open(archive, "r:gz") as tf:
        for line in tf.extractfile("cased/test.jsonl").read().decode("utf-8").splitlines():
            row = json.loads(line)
            if len(row["tokens"]) < 4:
                continue
            text, spans = detokenize_with_spans(row["tokens"], row["ner_tags"])
            prs_spans = [s for s in spans if s["type"] == "PRS"]
            if prs_spans:
                prs_docs.append({"id": row["id"], "text": text, "prs": prs_spans})
            elif len(spans) == 0:
                clean_docs.append({"id": row["id"], "text": text, "prs": []})
    rng = random.Random(seed)
    rng.shuffle(prs_docs)
    rng.shuffle(clean_docs)
    return {"prs500": prs_docs[:n_prs], "clean500": clean_docs[:n_clean]}


def load_homograph_suite(homo_path: Path):
    tag_re = re.compile(r"\[(PER|WORD):([^\]]+)\]")
    names, words = [], []
    for raw in homo_path.read_text(encoding="utf-8").splitlines():
        if not raw.strip() or raw.startswith("#"):
            continue
        m = re.match(r"^<([^>]+)>\s+(.*)$", raw)
        if not m:
            continue
        meta, body = m.group(1), m.group(2)
        text, pos, target = "", 0, None
        for tm in tag_re.finditer(body):
            text += body[pos : tm.start()]
            st = len(text)
            text += tm.group(2)
            target = {"kind": tm.group(1), "start": st, "end": st + len(tm.group(2)), "text": tm.group(2)}
            pos = tm.end()
        text += body[pos:]
        if "use=name" in meta:
            names.append({"meta": meta, "text": text, "target": target})
        elif "use=word" in meta:
            words.append({"meta": meta, "text": text, "target": target})
    return {"homoNameLower": names, "homoWordLower": words}


def load_openai_predictor():
    cfg = json.loads(Path(hf_hub_download(OPENAI_REPO, "config.json", revision=OPENAI_REV)).read_text())
    tok = Tokenizer.from_file(hf_hub_download(OPENAI_REPO, "tokenizer.json", revision=OPENAI_REV))
    onnx_p = Path(hf_hub_download(OPENAI_REPO, "onnx/model_q4.onnx", revision=OPENAI_REV))
    sess = ort.InferenceSession(str(onnx_p), providers=["CPUExecutionProvider"])
    id2label = {int(k): v for k, v in cfg["id2label"].items()}
    num_labels = len(id2label)
    neg_inf = -1e9
    trans = np.full((num_labels, num_labels), neg_inf, dtype=np.float32)
    start_ok = np.full(num_labels, neg_inf, dtype=np.float32)
    end_ok = np.full(num_labels, neg_inf, dtype=np.float32)

    def split_tag(lbl):
        return ("O", "") if lbl == "O" else tuple(lbl.split("-", 1))

    for i in range(num_labels):
        pi, ci = split_tag(id2label[i])
        if pi in ("O", "B", "S"):
            start_ok[i] = 0.0
        if pi in ("O", "E", "S"):
            end_ok[i] = 0.0
        for j in range(num_labels):
            pj, cj = split_tag(id2label[j])
            if pi in ("O", "E", "S") and pj in ("O", "B", "S"):
                trans[i, j] = 0.0
            elif pi in ("B", "I") and pj in ("I", "E") and ci == cj:
                trans[i, j] = 0.0

    def predict(text: str):
        enc = tok.encode(text)
        logits = sess.run(
            None,
            {
                "input_ids": np.array([enc.ids], dtype=np.int64),
                "attention_mask": np.array([enc.attention_mask], dtype=np.int64),
            },
        )[0][0]
        t_len, c_len = logits.shape
        if t_len == 0:
            return []
        m = logits.max(axis=-1, keepdims=True)
        logp = logits - m - np.log(np.exp(logits - m).sum(axis=-1, keepdims=True))
        dp = np.full((t_len, c_len), neg_inf, dtype=np.float32)
        bp = np.zeros((t_len, c_len), dtype=np.int32)
        dp[0] = logp[0] + start_ok
        for t in range(1, t_len):
            scores = dp[t - 1][:, None] + trans
            bp[t] = scores.argmax(axis=0)
            dp[t] = scores[bp[t], np.arange(c_len)] + logp[t]
        path = [0] * t_len
        path[t_len - 1] = int((dp[t_len - 1] + end_ok).argmax())
        for t in range(t_len - 2, -1, -1):
            path[t] = int(bp[t + 1, path[t + 1]])
        spans = []
        cur_s = cur_e = cur_cat = None
        for idx, (s, e) in zip(path, enc.offsets):
            p, cat = split_tag(id2label[idx])
            if p == "S":
                if cur_cat is not None:
                    spans.append((cur_s, cur_e, cur_cat))
                    cur_cat = None
                if e > s:
                    spans.append((s, e, cat))
            elif p == "B":
                if cur_cat is not None:
                    spans.append((cur_s, cur_e, cur_cat))
                cur_s, cur_e, cur_cat = s, e, cat
            elif p == "I" and cur_cat == cat:
                cur_e = e
            elif p == "E" and cur_cat == cat:
                cur_e = e
                if cur_e > cur_s:
                    spans.append((cur_s, cur_e, cur_cat))
                cur_cat = None
            else:
                if cur_cat is not None:
                    spans.append((cur_s, cur_e, cur_cat))
                    cur_cat = None
        if cur_cat is not None and cur_e > cur_s:
            spans.append((cur_s, cur_e, cur_cat))
        out = []
        for s, e, cat in spans:
            while s < e and text[s].isspace():
                s += 1
            while e > s and text[e - 1].isspace():
                e -= 1
            if e > s:
                out.append({"start": s, "end": e, "type": cat, "isPerson": cat == "private_person"})
        return out

    return predict


def load_presidio_predictor():
    from presidio_analyzer import AnalyzerEngine, RecognizerRegistry
    from presidio_analyzer.nlp_engine import NlpEngineProvider
    from presidio_analyzer.predefined_recognizers import (
        CreditCardRecognizer,
        EmailRecognizer,
        IbanRecognizer,
        IpRecognizer,
        PhoneRecognizer,
        SeOrganisationsnummerRecognizer,
        SePersonnummerRecognizer,
        UrlRecognizer,
    )

    provider = NlpEngineProvider(
        nlp_configuration={
            "nlp_engine_name": "spacy",
            "models": [{"lang_code": "sv", "model_name": "sv_core_news_lg"}],
            "ner_model_configuration": {
                "model_to_presidio_entity_mapping": {
                    "PRS": "PERSON",
                    "PER": "PERSON",
                    "LOC": "LOCATION",
                    "ORG": "ORGANIZATION",
                },
                "labels_to_ignore": ["TME", "MSR", "WRK", "OBJ", "EVN", "O"],
                "default_score": 0.85,
            },
        }
    )
    nlp_engine = provider.create_engine()
    registry = RecognizerRegistry(supported_languages=["sv"])
    registry.load_predefined_recognizers(nlp_engine=nlp_engine, languages=["sv"])
    for rec_cls in [
        SePersonnummerRecognizer,
        SeOrganisationsnummerRecognizer,
        EmailRecognizer,
        PhoneRecognizer,
        CreditCardRecognizer,
        IbanRecognizer,
        IpRecognizer,
        UrlRecognizer,
    ]:
        try:
            registry.add_recognizer(rec_cls(supported_language="sv"))
        except TypeError:
            pass
    analyzer = AnalyzerEngine(nlp_engine=nlp_engine, registry=registry, supported_languages=["sv"])

    def predict(text: str):
        res = sorted(analyzer.analyze(text=text, language="sv"), key=lambda r: (-r.score, -(r.end - r.start)))
        kept = []
        for r in res:
            if any(max(r.start, k.start) < min(r.end, k.end) for k in kept):
                continue
            kept.append(r)
        return [{"start": r.start, "end": r.end, "type": r.entity_type, "isPerson": r.entity_type == "PERSON"} for r in kept]

    return predict


def evaluate(predict_fn, suc_sample, homo_suite):
    t0 = time.perf_counter()
    tp = fp = fn = any_hit = total_prs = 0
    for doc in suc_sample["prs500"]:
        preds = predict_fn(doc["text"])
        p_preds = [x for x in preds if x["isPerson"]]
        total_prs += len(doc["prs"])
        matched = set()
        for g in doc["prs"]:
            if any(max(g["start"], x["start"]) < min(g["end"], x["end"]) for x in preds):
                any_hit += 1
            idx = next((i for i, x in enumerate(p_preds) if i not in matched and max(g["start"], x["start"]) < min(g["end"], x["end"])), None)
            if idx is not None:
                tp += 1
                matched.add(idx)
            else:
                fn += 1
        fp += len(p_preds) - len(matched)

    clean_any = clean_person = clean_spans = clean_p_spans = 0
    for doc in suc_sample["clean500"]:
        preds = predict_fn(doc["text"])
        p_preds = [x for x in preds if x["isPerson"]]
        fp += len(p_preds)
        if preds:
            clean_any += 1
            clean_spans += len(preds)
        if p_preds:
            clean_person += 1
            clean_p_spans += len(p_preds)

    lo_tp = lo_fp = lo_fn = lo_any = 0
    for doc in suc_sample["prs500"]:
        preds = predict_fn(doc["text"].lower())
        p_preds = [x for x in preds if x["isPerson"]]
        matched = set()
        for g in doc["prs"]:
            if any(max(g["start"], x["start"]) < min(g["end"], x["end"]) for x in preds):
                lo_any += 1
            idx = next((i for i, x in enumerate(p_preds) if i not in matched and max(g["start"], x["start"]) < min(g["end"], x["end"])), None)
            if idx is not None:
                lo_tp += 1
                matched.add(idx)
            else:
                lo_fn += 1
        lo_fp += len(p_preds) - len(matched)

    hn_h_tot = hn_h_hit = hn_p_tot = hn_p_hit = hw_fp = 0
    for item in homo_suite["homoNameLower"]:
        preds = predict_fn(item["text"])
        g = item["target"]
        hit = any(max(g["start"], x["start"]) < min(g["end"], x["end"]) for x in preds)
        if "type=homograph" in item["meta"]:
            hn_h_tot += 1
            hn_h_hit += int(hit)
        else:
            hn_p_tot += 1
            hn_p_hit += int(hit)
    for item in homo_suite["homoWordLower"]:
        preds = predict_fn(item["text"])
        g = item["target"]
        if any(max(g["start"], x["start"]) < min(g["end"], x["end"]) for x in preds):
            hw_fp += 1

    def prf(t, f_p, f_n):
        p = t / (t + f_p) if (t + f_p) else 0.0
        r = t / (t + f_n) if (t + f_n) else 0.0
        f = 2 * p * r / (p + r) if (p + r) else 0.0
        return round(p * 100, 1), round(r * 100, 1), round(f * 100, 1)

    cp, cr, cf = prf(tp, fp, fn)
    lp, lr, lf = prf(lo_tp, lo_fp, lo_fn)
    return {
        "elapsedSec": round(time.perf_counter() - t0, 1),
        "suc3": {
            "totalPrs": total_prs,
            "casedPerson": {"tp": tp, "fp": fp, "fn": fn, "precisionPct": cp, "recallPct": cr, "f1Pct": cf, "anyLabelRecallPct": round(any_hit / total_prs * 100, 1)},
            "lowerPerson": {"tp": lo_tp, "fp": lo_fp, "fn": lo_fn, "precisionPct": lp, "recallPct": lr, "f1Pct": lf, "anyLabelRecallPct": round(lo_any / total_prs * 100, 1)},
            "clean500": {"personFpSents": clean_person, "personFpPct": round(clean_person / 500 * 100, 1), "anyFpSents": clean_any, "anyFpPct": round(clean_any / 500 * 100, 1), "totalFpSpans": clean_spans},
        },
        "homographLower": {
            "nameRecallPct": round(hn_h_hit / hn_h_tot * 100, 1),
            "plainNameRecallPct": round(hn_p_hit / hn_p_tot * 100, 1),
            "wordFpPct": round(hw_fp / len(homo_suite["homoWordLower"]) * 100, 1),
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="tmp/suc3-bench")
    parser.add_argument("--homographs", default="training/eval/homograph-names.txt")
    args = parser.parse_args()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    suc_sample = build_suc3_sample()
    homo_suite = load_homograph_suite(Path(args.homographs))
    (out_dir / "suc_sample.json").write_text(json.dumps(suc_sample, ensure_ascii=False))
    (out_dir / "homo_suite.json").write_text(json.dumps(homo_suite, ensure_ascii=False))
    results = {
        "presidio_sv": evaluate(load_presidio_predictor(), suc_sample, homo_suite),
        "openai_privacy_filter_q4": evaluate(load_openai_predictor(), suc_sample, homo_suite),
    }
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
