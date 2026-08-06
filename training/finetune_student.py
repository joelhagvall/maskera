"""
Continue-train an already-distilled student on updated training data.

The fast path when a data round only ADDS surgical examples (e.g. hard
negatives): instead of retraining the teacher (~45 min) and re-distilling
(~40 min), fine-tune the existing full-vocab student for a couple of epochs at
a low learning rate (~15 min). The student keeps everything it knows, and the
new examples correct the specific mistakes. Measure against the gold sets
afterwards; if the result is not at parity with the full pipeline, run the
full pipeline instead.

Usage: finetune_student.py <src_student_dir> <out_dir> [epochs] [lr]
Example: finetune_student.py student-v5 student-v6 2 1e-5
"""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import torch
from datasets import load_dataset
from seqeval.metrics import classification_report, f1_score, precision_score, recall_score
from transformers import (
    AutoModelForTokenClassification,
    AutoTokenizer,
    DataCollatorForTokenClassification,
    Trainer,
    TrainingArguments,
    set_seed,
)

SRC = sys.argv[1] if len(sys.argv) > 1 else "student-v5"
OUT_DIR = sys.argv[2] if len(sys.argv) > 2 else "student-finetuned"
EPOCHS = float(sys.argv[3]) if len(sys.argv) > 3 else 2
LR = float(sys.argv[4]) if len(sys.argv) > 4 else 1e-5
MAX_LEN = 128
# Seeded so runs are comparable (see train.py).
SEED = int(os.environ.get("MASKERA_SEED", "1337"))

LABELS = ["O", "B-PER", "I-PER", "B-LOC", "I-LOC", "B-ORG", "I-ORG", "B-ADR", "I-ADR"]
label2id = {l: i for i, l in enumerate(LABELS)}
id2label = {i: l for i, l in enumerate(LABELS)}

device = (
    "mps" if torch.backends.mps.is_available()
    else "cuda" if torch.cuda.is_available()
    else "cpu"
)
print(f"== device: {device}, src: {SRC}, epochs: {EPOCHS}, lr: {LR} ==")
set_seed(SEED)

source_attestation_path = Path(SRC) / "privacy-attestation.json"
if not source_attestation_path.is_file():
    sys.exit(
        f"{SRC} has no privacy-attestation.json; do not continue-train a legacy model "
        "on the privacy-clean release line"
    )
subprocess.run(
    ["node", "verify_attestation.mjs", str(source_attestation_path)], check=True
)
with source_attestation_path.open(encoding="utf-8") as handle:
    source_attestation = json.load(handle)
if source_attestation.get("dataPolicy") != "synthetic-task-data-only":
    sys.exit(f"{SRC} does not carry the synthetic-only training policy")
subprocess.run(["node", "audit_data.mjs"], check=True)
subprocess.run(
    ["node", "privacy_attestation.mjs", "data/privacy-attestation.json"], check=True
)
with Path("data/privacy-attestation.json").open(encoding="utf-8") as handle:
    current_attestation = json.load(handle)
for split in ("train", "validation"):
    if current_attestation.get(split) != source_attestation.get(split):
        sys.exit(
            f"Current {split} data does not match {SRC}'s attested training data; "
            "retrain from KB-BERT instead of merging data lineages"
        )

tokenizer = AutoTokenizer.from_pretrained(SRC)

raw = load_dataset(
    "json",
    data_files={"train": "data/train.jsonl", "validation": "data/val.jsonl"},
)


def align(batch):
    tok = tokenizer(
        batch["tokens"],
        truncation=True,
        max_length=MAX_LEN,
        is_split_into_words=True,
    )
    all_labels = []
    for i, tags in enumerate(batch["tags"]):
        word_ids = tok.word_ids(batch_index=i)
        prev = None
        labels = []
        for wid in word_ids:
            if wid is None:
                labels.append(-100)
            elif wid != prev:
                labels.append(label2id[tags[wid]])
            else:
                # only label the first subword of each word
                labels.append(-100)
            prev = wid
        all_labels.append(labels)
    tok["labels"] = all_labels
    return tok


tokenized = raw.map(align, batched=True, remove_columns=raw["train"].column_names)

model = AutoModelForTokenClassification.from_pretrained(SRC)
assert model.config.num_labels == len(LABELS), "label scheme changed; full retrain required"

collator = DataCollatorForTokenClassification(tokenizer)


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=2)
    true_labels, true_preds = [], []
    for pred, lab in zip(preds, labels):
        tl, tp = [], []
        for p, l in zip(pred, lab):
            if l != -100:
                tl.append(id2label[l])
                tp.append(id2label[p])
        true_labels.append(tl)
        true_preds.append(tp)
    return {
        "precision": precision_score(true_labels, true_preds),
        "recall": recall_score(true_labels, true_preds),
        "f1": f1_score(true_labels, true_preds),
    }


args = TrainingArguments(
    output_dir=OUT_DIR,
    eval_strategy="epoch",
    save_strategy="epoch",
    learning_rate=LR,
    per_device_train_batch_size=16,
    per_device_eval_batch_size=32,
    num_train_epochs=EPOCHS,
    weight_decay=0.01,
    logging_steps=50,
    save_total_limit=1,
    load_best_model_at_end=True,
    metric_for_best_model="f1",
    report_to="none",
    seed=SEED,
)

trainer = Trainer(
    model=model,
    args=args,
    train_dataset=tokenized["train"],
    eval_dataset=tokenized["validation"],
    data_collator=collator,
    compute_metrics=compute_metrics,
)

print("== fine-tuning ==")
trainer.train()

metrics = trainer.evaluate()
print("== final validation metrics ==")
print(json.dumps({k: round(v, 4) for k, v in metrics.items() if isinstance(v, float)}, indent=2))

preds = trainer.predict(tokenized["validation"])
p = np.argmax(preds.predictions, axis=2)
tl, tp = [], []
for pred, lab in zip(p, preds.label_ids):
    a, b = [], []
    for pi, li in zip(pred, lab):
        if li != -100:
            a.append(id2label[li])
            b.append(id2label[pi])
    tl.append(a)
    tp.append(b)
print(classification_report(tl, tp))

trainer.save_model(OUT_DIR)
tokenizer.save_pretrained(OUT_DIR)
shutil.copy2("data/privacy-attestation.json", os.path.join(OUT_DIR, "privacy-attestation.json"))
print(f"== saved model to {OUT_DIR}/ ==")
