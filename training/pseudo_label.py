"""
Pseudo-label informal Swedish sentences with two voters and emit BOTH views
raw (docs/ROADMAP.md v14, "the main bet").

Voters:
  1. the v13-recipe TEACHER (fp32, four-class PER/LOC/ORG/ADR), the model
     whose register knowledge we want to amplify;
  2. sbx/KB-bert-swedish_PI-detection-general-iob (GPL-3.0, trained on SweLL
     gold PI annotations). Used ONLY to filter training data; its weights are
     never shipped or distilled from. Label mapping to our scheme:
     personal_name -> PER, geographic -> LOC, institution -> ORG, everything
     else (age/date/transportation/other) -> O.

This script makes NO keep/drop decision beyond truncation: it writes the
teacher's BIO tags + per-word confidences AND the second voter's mapped BIO
tags for every sentence, so the agreement policy lives in convert_pseudo.mjs
and can be tuned without re-running an hour of inference. (The first policy
draft required EXACT span-set agreement; measured on 100k rows it kept 0.2%
entity rows, because the sbx scheme under-fires on plain names/orgs -- the
same scheme mismatch documented in BENCHMARKS.md's competitor table. The
corpus is built once, policies are cheap.)

    .venv/bin/python pseudo_label.py .benchmark/informal-raw.jsonl \
        .benchmark/pseudo-labeled.jsonl --teacher model-v13d2

Output rows:
    {"tokens": [...], "t_tags": [...], "t_conf": [...], "s_tags": [...],
     "src": "flashback-dator"}

Deterministic (inference only, sorted batching).
"""

import argparse
import json
import sys

import torch
from transformers import AutoModelForTokenClassification, AutoTokenizer

SECOND_MODEL = "sbx/KB-bert-swedish_PI-detection-general-iob"
SECOND_MAP = {"personal_name": "PER", "geographic": "LOC", "institution": "ORG"}
MAX_LEN = 128


def map_second(tag):
    if "-" not in tag:
        return "O"
    bi, label = tag.split("-", 1)
    mapped = SECOND_MAP.get(label)
    return f"{bi}-{mapped}" if mapped else "O"


class Voter:
    def __init__(self, path, device):
        self.tok = AutoTokenizer.from_pretrained(path)
        self.model = AutoModelForTokenClassification.from_pretrained(path).to(device).eval()
        self.id2label = self.model.config.id2label
        self.device = device

    @torch.inference_mode()
    def label_batch(self, batch_tokens):
        enc = self.tok(
            batch_tokens,
            is_split_into_words=True,
            truncation=True,
            max_length=MAX_LEN,
            padding=True,
            return_tensors="pt",
        ).to(self.device)
        probs = self.model(**enc).logits.softmax(-1).cpu()
        out = []
        for bi, tokens in enumerate(batch_tokens):
            word_ids = enc.word_ids(bi)
            tags, confs, seen = ["O"] * len(tokens), [1.0] * len(tokens), set()
            for pos, wid in enumerate(word_ids):
                if wid is None or wid in seen:
                    continue
                seen.add(wid)
                p = probs[bi, pos]
                li = int(p.argmax())
                tags[wid] = self.id2label[li]
                confs[wid] = round(float(p[li]), 3)
            out.append((tags, confs, len(seen) < len(tokens)))
        return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--teacher", default="model-v13d2")
    ap.add_argument("--batch", type=int, default=96)
    args = ap.parse_args()

    device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
    print(f"== device: {device} ==", file=sys.stderr)
    teacher = Voter(args.teacher, device)
    second = Voter(SECOND_MODEL, device)

    rows = [json.loads(l) for l in open(args.src, encoding="utf-8")]
    # Sorted batching keeps padding small; output order does not matter.
    order = sorted(range(len(rows)), key=lambda i: len(rows[i]["tokens"]))

    stats = {"total": len(rows), "written": 0, "truncated": 0}
    with open(args.dst, "w", encoding="utf-8") as out:
        for lo in range(0, len(order), args.batch):
            idx = order[lo : lo + args.batch]
            batch = [rows[i]["tokens"] for i in idx]
            t_res = teacher.label_batch(batch)
            s_res = second.label_batch(batch)
            for k, i in enumerate(idx):
                t_tags, t_confs, t_trunc = t_res[k]
                s_tags, _, s_trunc = s_res[k]
                if t_trunc or s_trunc:
                    stats["truncated"] += 1
                    continue
                stats["written"] += 1
                out.write(
                    json.dumps(
                        {
                            "tokens": rows[i]["tokens"],
                            "t_tags": t_tags,
                            "t_conf": t_confs,
                            "s_tags": [map_second(t) for t in s_tags],
                            "src": rows[i].get("src", "?"),
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
            if (lo // args.batch) % 200 == 0:
                print(f"{min(lo + args.batch, len(order))}/{len(order)}", file=sys.stderr, flush=True)
    print(f"RESULT {json.dumps(stats)}", file=sys.stderr)


if __name__ == "__main__":
    main()
