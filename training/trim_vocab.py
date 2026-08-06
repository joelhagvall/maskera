"""
Shrink the model by trimming KB-BERT's vocabulary to the wordpieces used by the
privacy-audited synthetic task data. The embedding table is ~half the model, so
this is the real size lever (q4 was a dead end — see quantize_q4.py).

How it stays safe: we keep all special tokens AND every single-character piece,
so any word can still decompose to subwords/chars — no [UNK] explosion. Then we
fill up to the target with the most frequent pieces from the exact
privacy-audited synthetic train/validation data. If that corpus uses fewer
pieces than the target, the remainder follows the pinned base tokenizer's
native id order (its vocabulary order, not another text corpus). Evaluation
and public corpora are deliberately excluded.

    uv run python trim_vocab.py

Then:  uv run python export_onnx.py student-trimmed student-trimmed-onnx
"""
import json
import os
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

import torch
import torch.nn as nn
from transformers import AutoModelForTokenClassification, AutoTokenizer, BertTokenizerFast

# usage: trim_vocab.py [src_model] [out_dir] [target_vocab]
SRC = sys.argv[1] if len(sys.argv) > 1 else "student-model"
OUT = sys.argv[2] if len(sys.argv) > 2 else "student-trimmed"
TARGET = int(sys.argv[3]) if len(sys.argv) > 3 else 16000

attestation_path = Path(SRC) / "privacy-attestation.json"
if not attestation_path.is_file():
    sys.exit(f"{SRC} has no privacy-attestation.json; refusing to trim a legacy model")
subprocess.run(["node", "verify_attestation.mjs", str(attestation_path)], check=True)
with attestation_path.open(encoding="utf-8") as handle:
    attestation = json.load(handle)
if attestation.get("dataPolicy") != "synthetic-task-data-only":
    sys.exit(f"{SRC} does not carry the synthetic-only training policy")
subprocess.run(["node", "audit_data.mjs"], check=True)
subprocess.run(
    ["node", "privacy_attestation.mjs", "data/privacy-attestation.json"], check=True
)
with Path("data/privacy-attestation.json").open(encoding="utf-8") as handle:
    current_attestation = json.load(handle)
for split in ("train", "validation"):
    if current_attestation.get(split) != attestation.get(split):
        sys.exit(
            f"Current {split} data does not match {SRC}'s attested training data; "
            "refusing to select vocabulary from a different corpus"
        )

tok = AutoTokenizer.from_pretrained(SRC)
model = AutoModelForTokenClassification.from_pretrained(SRC)
id2tok = {i: t for t, i in tok.get_vocab().items()}
V = len(id2tok)
print(f"== original vocab: {V} ==")

# --- gather the audited synthetic corpus to measure token frequency -----
texts: list[str] = []
for fn in ["data/train.jsonl", "data/val.jsonl"]:
    try:
        for line in open(fn, encoding="utf-8"):
            texts.append(" ".join(json.loads(line)["tokens"]))
    except FileNotFoundError:
        pass
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
seen = must_keep | set(ranked)
# Synthetic-only data intentionally has a narrower lexicon than the historical
# public-corpus mix. Keep the requested model capacity without reading another
# corpus: BERT vocab ids follow the pinned source tokenizer's native order, so
# they provide a deterministic fallback for pieces not observed in task data.
native_fallback = [i for i in range(V) if i not in seen]
fill = (ranked + native_fallback)[: max(0, TARGET - len(must_keep))]
kept_ids = sorted(must_keep | set(fill))
N = len(kept_ids)
frequent_count = min(len(ranked), len(fill))
fallback_count = len(fill) - frequent_count
print(
    f"== keeping {N} tokens ({len(must_keep)} special/char + "
    f"{frequent_count} synthetic-frequency + {fallback_count} native-order) =="
)

# --- new tokenizer (vocab.txt in kept order) ----------------------------
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
shutil.copy2(attestation_path, Path(OUT) / "privacy-attestation.json")

before = sum(p.numel() for p in AutoModelForTokenClassification.from_pretrained(SRC).parameters())
after = sum(p.numel() for p in model.parameters())
print(f"== params: {before/1e6:.1f}M -> {after/1e6:.1f}M ({100*(1-after/before):.0f}% smaller) ==")
print(f"== saved trimmed model to {OUT}/ ==")
