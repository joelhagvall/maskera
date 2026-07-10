"""
Fine-tune a Swedish token-classification model for maskera's NER layer.

Teaches free-text entities (PER/LOC/ORG/ADR) on synthetic Swedish data.
Structured PII stays with @maskera/core's rule detectors.

Runs on Apple Silicon (MPS), CUDA, or CPU automatically.

    uv run python train.py
"""

import json
import os
import sys

import numpy as np
import torch
from datasets import load_dataset
from seqeval.metrics import classification_report, f1_score, precision_score, recall_score
from transformers import (
    AutoModelForTokenClassification,
    AutoTokenizer,
    DataCollatorForTokenClassification,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)

from transformers import set_seed

BASE_MODEL = "KBLab/bert-base-swedish-cased"
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "model"  # usage: train.py [out_dir]
MAX_LEN = 128
# Seeded so runs are comparable: an unseeded 2026-07-04 round produced students
# whose ORG margins collapsed under quantization while a sibling run was fine.
SEED = int(os.environ.get("MASKERA_SEED", "1337"))
set_seed(SEED)

LABELS = ["O", "B-PER", "I-PER", "B-LOC", "I-LOC", "B-ORG", "I-ORG", "B-ADR", "I-ADR"]
label2id = {l: i for i, l in enumerate(LABELS)}
id2label = {i: l for i, l in enumerate(LABELS)}

device = (
    "mps" if torch.backends.mps.is_available()
    else "cuda" if torch.cuda.is_available()
    else "cpu"
)
print(f"== device: {device}, seed: {SEED} ==")

tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)

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

model = AutoModelForTokenClassification.from_pretrained(
    BASE_MODEL,
    num_labels=len(LABELS),
    id2label=id2label,
    label2id=label2id,
)

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
    learning_rate=3e-5,
    per_device_train_batch_size=16,
    per_device_eval_batch_size=32,
    num_train_epochs=3,
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
    callbacks=[EarlyStoppingCallback(early_stopping_patience=1)],
)

print("== training ==")
trainer.train()

metrics = trainer.evaluate()
print("== final validation metrics ==")
print(json.dumps({k: round(v, 4) for k, v in metrics.items() if isinstance(v, float)}, indent=2))

# Detailed per-entity report
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
print(f"== saved model to {OUT_DIR}/ ==")

# Smoke test on real Swedish sentences the model never saw
from transformers import pipeline  # noqa: E402

nlp = pipeline(
    "token-classification",
    model=OUT_DIR,
    tokenizer=OUT_DIR,
    aggregation_strategy="simple",
    device=device,
)
for s in [
    "Min granne Lars Nordström bor på Kungsholmen och jobbar på Spotify i Stockholm.",
    "Patient Aisha Khan inkom till akuten i Malmö.",
    "Handläggaren Per Holmberg bedömde ansökan från familjen Yilmaz på Storgatan 14.",
]:
    print("\n>", s)
    for e in nlp(s):
        print(f"   {e['entity_group']:5} {e['word']!r}  ({e['score']:.2f})")
