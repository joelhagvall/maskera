"""
Shrink the model by trimming KB-BERT's 50k vocab to the ~16k wordpieces actually
used in Swedish text. The embedding table is ~half the model, so this is the real
size lever (q4 was a dead end — see quantize_q4.py).

How it stays safe: we keep all special tokens AND every single-character piece,
so any word can still decompose to subwords/chars — no [UNK] explosion. Then we
fill up to the target with the most frequent pieces from a Swedish corpus
(WikiANN + our training/eval text).

    uv run python trim_vocab.py

Then:  uv run python export_onnx.py student-trimmed student-trimmed-onnx
"""
import re
import sys
from collections import Counter

import torch
import torch.nn as nn
from datasets import load_dataset
from transformers import AutoModelForTokenClassification, AutoTokenizer, BertTokenizerFast

# usage: trim_vocab.py [src_model] [out_dir] [target_vocab]
SRC = sys.argv[1] if len(sys.argv) > 1 else "student-model"
OUT = sys.argv[2] if len(sys.argv) > 2 else "student-trimmed"
TARGET = int(sys.argv[3]) if len(sys.argv) > 3 else 16000

tok = AutoTokenizer.from_pretrained(SRC)
model = AutoModelForTokenClassification.from_pretrained(SRC)
id2tok = {i: t for t, i in tok.get_vocab().items()}
V = len(id2tok)
print(f"== original vocab: {V} ==")

# --- gather a Swedish corpus to measure token frequency -----------------
texts: list[str] = []
for split in ["train", "validation", "test"]:
    try:
        ds = load_dataset("wikiann", "sv", split=split)
        texts += [" ".join(t) for t in ds["tokens"]]
    except Exception as e:  # noqa: BLE001
        print("wikiann", split, "skipped:", str(e)[:50])
for fn in ["data/train.jsonl", "data/val.jsonl"]:
    try:
        import json
        for line in open(fn, encoding="utf-8"):
            texts.append(" ".join(json.loads(line)["tokens"]))
    except FileNotFoundError:
        pass
for line in open("eval/gold.txt", encoding="utf-8"):
    if line.strip() and not line.lstrip().startswith("#"):
        texts.append(re.sub(r"\[(?:PER|LOC|ORG|ADR):([^\]]+)\]", r"\1", line))
print(f"== corpus: {len(texts)} sentences ==")

# --- count wordpiece usage ----------------------------------------------
freq: Counter[int] = Counter()
for i in range(0, len(texts), 1000):
    enc = tok(texts[i : i + 1000], add_special_tokens=False)
    for ids in enc["input_ids"]:
        freq.update(ids)
print(f"== distinct pieces seen: {len(freq)} ==")

# --- decide which ids to keep -------------------------------------------
special_ids = set(tok.all_special_ids)
single_char = {i for i, t in id2tok.items() if len(t.replace("##", "")) <= 1}
must_keep = special_ids | single_char
ranked = [i for i, _ in freq.most_common() if i not in must_keep]
fill = ranked[: max(0, TARGET - len(must_keep))]
kept_ids = sorted(must_keep | set(fill))
N = len(kept_ids)
print(f"== keeping {N} tokens ({len(must_keep)} special/char + {len(fill)} frequent) ==")

# --- new tokenizer (vocab.txt in kept order) ----------------------------
import os

os.makedirs(OUT, exist_ok=True)
with open(f"{OUT}/vocab.txt", "w", encoding="utf-8") as f:
    for i in kept_ids:
        f.write(id2tok[i] + "\n")
new_tok = BertTokenizerFast(
    vocab_file=f"{OUT}/vocab.txt", do_lower_case=False, strip_accents=False, tokenize_chinese_chars=True
)
new_tok.save_pretrained(OUT)

# --- new model: slice the embedding table -------------------------------
old_emb = model.bert.embeddings.word_embeddings.weight.data
idx = torch.tensor(kept_ids)
new_emb = old_emb[idx].clone()
new_pad = kept_ids.index(tok.pad_token_id)
layer = nn.Embedding(N, old_emb.shape[1], padding_idx=new_pad)
layer.weight.data = new_emb
model.bert.embeddings.word_embeddings = layer
model.config.vocab_size = N
model.config.pad_token_id = new_pad
model.save_pretrained(OUT)

before = sum(p.numel() for p in AutoModelForTokenClassification.from_pretrained(SRC).parameters())
after = sum(p.numel() for p in model.parameters())
print(f"== params: {before/1e6:.1f}M -> {after/1e6:.1f}M ({100*(1-after/before):.0f}% smaller) ==")
print(f"== saved trimmed model to {OUT}/ ==")
