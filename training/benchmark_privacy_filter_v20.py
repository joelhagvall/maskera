"""
Reproducible Swedish PII comparison of:
  1. openai/privacy-filter (q4 ONNX, constrained BIOES Viterbi decoding)
  2. Microsoft Presidio (steelmanned Swedish config: sv_core_news_lg with
     PRS->PERSON mapping + SePersonnummerRecognizer + SeOrganisationsnummerRecognizer)

Evaluated on the exact same two privacy-safe Swedish corpora used across Maskera:
  - 258-text Swedish domain regression corpus (952 annotated PII strings)
  - 121-text Swedish gold.txt (87 Swedish PER entities, normal and all-lowercase)

Usage (in an isolated Python 3.11 venv with presidio-analyzer, spacy,
sv_core_news_lg, onnxruntime, huggingface_hub, tokenizers, numpy):
    node bench/export-domain-json.mjs  # or export packages/ner/eval/domain-regression/corpus
    python training/benchmark_privacy_filter_v20.py --corpus tmp/domain-corpus.json
"""
import argparse
import json
import re
import resource
import time
import unicodedata
from pathlib import Path

import numpy as np
import onnxruntime as ort
from huggingface_hub import hf_hub_download
from tokenizers import Tokenizer

OPENAI_REPO = "openai/privacy-filter"
OPENAI_REV = "7ffa9a043d54d1be65afb281eddf0ffbe629385b"
GOLD_RE = re.compile(r"\[(PER|LOC|ORG|ADR):([^\]]+)\]")


def fold(value: str) -> str:
    return unicodedata.normalize("NFKC", value).lower()


def score_domain_spans(text: str, spans, expected):
    covered = [False] * len(text)
    for s, e in spans:
        for i in range(max(0, s), min(len(text), e)):
            covered[i] = True
    hits = partials = misses = 0
    for val in expected:
        st = fold(text).find(fold(val))
        mat = [i for i in range(st, st + len(val)) if text[i].isalnum()]
        retained = sum(1 for i in mat if not covered[i])
        if retained == 0:
            hits += 1
        elif retained == len(mat):
            misses += 1
        else:
            partials += 1
    return hits, partials, misses


def load_gold_per(path: Path):
    docs = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        text, pos, spans = "", 0, []
        for m in GOLD_RE.finditer(line):
            text += line[pos : m.start()]
            st = len(text)
            text += m.group(2)
            if m.group(1) == "PER":
                spans.append((st, st + len(m.group(2))))
            pos = m.end()
        text += line[pos:]
        docs.append((text, spans))
    return docs


def run_openai(corpus, gold_docs):
    cfg = json.loads(Path(hf_hub_download(OPENAI_REPO, "config.json", revision=OPENAI_REV)).read_text())
    tok = Tokenizer.from_file(hf_hub_download(OPENAI_REPO, "tokenizer.json", revision=OPENAI_REV))
    onnx_p = Path(hf_hub_download(OPENAI_REPO, "onnx/model_q4.onnx", revision=OPENAI_REV))
    data_p = Path(hf_hub_download(OPENAI_REPO, "onnx/model_q4.onnx_data", revision=OPENAI_REV))
    tok_p = Path(hf_hub_download(OPENAI_REPO, "tokenizer.json", revision=OPENAI_REV))

    sess = ort.InferenceSession(str(onnx_p), providers=["CPUExecutionProvider"])
    id2label = {int(k): v for k, v in cfg["id2label"].items()}
    num_labels = len(id2label)
    neg_inf = -1e9
    trans = np.full((num_labels, num_labels), neg_inf, dtype=np.float32)
    start_ok = np.full(num_labels, neg_inf, dtype=np.float32)
    end_ok = np.full(num_labels, neg_inf, dtype=np.float32)

    def split_tag(lbl: str):
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
        cur_s = cur_e = None
        cur_cat = None
        for idx, (s, e) in zip(path, enc.offsets):
            p, cat = split_tag(id2label[idx])
            if p == "S":
                if cur_cat is not None:
                    spans.append((cur_s, cur_e))
                    cur_cat = None
                if e > s:
                    spans.append((s, e))
            elif p == "B":
                if cur_cat is not None:
                    spans.append((cur_s, cur_e))
                cur_s, cur_e, cur_cat = s, e, cat
            elif p == "I" and cur_cat == cat:
                cur_e = e
            elif p == "E" and cur_cat == cat:
                cur_e = e
                if cur_e > cur_s:
                    spans.append((cur_s, cur_e))
                cur_cat = None
            else:
                if cur_cat is not None:
                    spans.append((cur_s, cur_e))
                    cur_cat = None
        if cur_cat is not None and cur_e > cur_s:
            spans.append((cur_s, cur_e))
        cleaned = []
        for s, e in spans:
            while s < e and text[s].isspace():
                s += 1
            while e > s and text[e - 1].isspace():
                e -= 1
            if e > s:
                cleaned.append((s, e))
        return cleaned

    predict("Hej Anna Lindqvist")
    t0 = time.perf_counter()
    hits = partials = misses = redactions = 0
    for doc in corpus:
        spans = predict(doc["text"])
        redactions += len(spans)
        h, p, m = score_domain_spans(doc["text"], spans, doc["forvantad"])
        hits += h
        partials += p
        misses += m
    elapsed_ms = (time.perf_counter() - t0) * 1000
    total = hits + partials + misses

    def eval_per(docs):
        tot = hit = 0
        for text, gspans in docs:
            preds = predict(text)
            for gs, ge in gspans:
                tot += 1
                if any(max(gs, ps) < min(ge, pe) for ps, pe in preds):
                    hit += 1
        return hit, tot, round(hit / tot * 100, 1)

    orig_per = eval_per(gold_docs)
    lower_per = eval_per([(t.lower(), s) for t, s in gold_docs])
    disk_mb = round((onnx_p.stat().st_size + data_p.stat().st_size + tok_p.stat().st_size) / 1e6, 1)
    rss_mb = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / (1024 * 1024), 1)
    return {
        "diskMb": disk_mb,
        "domain258": {
            "hits": hits,
            "partials": partials,
            "misses": misses,
            "fullHitRatePct": round(hits / total * 100, 1),
            "redactions": redactions,
            "msPerText": round(elapsed_ms / len(corpus), 2),
            "maxRssMb": rss_mb,
        },
        "gold121PerOrig": orig_per,
        "gold121PerLower": lower_per,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", default="tmp/domain-corpus.json")
    parser.add_argument("--gold", default="training/eval/gold.txt")
    args = parser.parse_args()
    corpus = json.loads(Path(args.corpus).read_text(encoding="utf-8"))
    gold_docs = load_gold_per(Path(args.gold))
    print(json.dumps({"openai_privacy_filter_q4": run_openai(corpus, gold_docs)}, indent=2))


if __name__ == "__main__":
    main()
