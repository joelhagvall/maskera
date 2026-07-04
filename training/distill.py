"""
Knowledge-distill the fine-tuned KB-BERT Swedish NER model into a small student
that fits the browser (~15-30 MB after quantization).

Teacher: model/ (KB-BERT, 110M params)
Student: a 6-layer BERT (hidden 768) INITIALIZED FROM THE TEACHER — embeddings +
         every-other encoder layer are copied, so the student inherits KB-BERT's
         Swedish pretraining (DistilBERT/TinyBERT style). Then distilled on
         logit-matching + hard labels.

Why teacher-init: a from-scratch small student hit synthetic val F1 1.00 but
generalised terribly (tagged "jobbar"/"innan" as entities) — it memorised the
templates without the pretrained Swedish knowledge that makes the teacher work.
Copying the teacher's weights fixes that.

    uv run python distill.py
"""

import json
import numpy as np
import torch
import torch.nn.functional as F
from datasets import load_dataset
from seqeval.metrics import classification_report, f1_score, precision_score, recall_score
from transformers import (
    AutoModelForTokenClassification,
    AutoTokenizer,
    BertConfig,
    BertForTokenClassification,
    DataCollatorForTokenClassification,
    Trainer,
    TrainingArguments,
)

import sys

from transformers import set_seed

# usage: distill.py [num_layers] [out_dir] [teacher_dir]
N_LAYERS = int(sys.argv[1]) if len(sys.argv) > 1 else 6
OUT = sys.argv[2] if len(sys.argv) > 2 else "student-model"
TEACHER = sys.argv[3] if len(sys.argv) > 3 else "model"
MAX_LEN = 128
ALPHA = 0.5        # weight on hard-label CE vs soft distillation
TEMPERATURE = 2.0
# Seeded so runs are comparable (see train.py).
SEED = 1337
set_seed(SEED)

LABELS = ["O", "B-PER", "I-PER", "B-LOC", "I-LOC", "B-ORG", "I-ORG", "B-ADR", "I-ADR"]
label2id = {l: i for i, l in enumerate(LABELS)}
id2label = {i: l for i, l in enumerate(LABELS)}

device = "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
print(f"== device: {device} ==")

tokenizer = AutoTokenizer.from_pretrained(TEACHER)

# --- teacher (frozen) ---
teacher = AutoModelForTokenClassification.from_pretrained(TEACHER).to(device).eval()
for p in teacher.parameters():
    p.requires_grad_(False)

# --- student: shallower BERT, initialized from the teacher ---
STUDENT_LAYERS = N_LAYERS
tcfg = teacher.config
L = tcfg.num_hidden_layers
# evenly spaced teacher layers to copy, including first and last
KEEP = sorted({round(i * (L - 1) / (STUDENT_LAYERS - 1)) for i in range(STUDENT_LAYERS)})
print(f"== student {STUDENT_LAYERS} layers, copying teacher layers {KEEP} -> {OUT} ==")
student_cfg = BertConfig(
    vocab_size=tcfg.vocab_size,
    hidden_size=tcfg.hidden_size,
    num_hidden_layers=STUDENT_LAYERS,
    num_attention_heads=tcfg.num_attention_heads,
    intermediate_size=tcfg.intermediate_size,
    max_position_embeddings=tcfg.max_position_embeddings,
    type_vocab_size=tcfg.type_vocab_size,
    num_labels=len(LABELS),
    id2label=id2label,
    label2id=label2id,
)
student = BertForTokenClassification(student_cfg)

# Copy embeddings + selected encoder layers from the teacher (DistilBERT-style).
student.bert.embeddings.load_state_dict(teacher.bert.embeddings.state_dict())
for s_idx, t_idx in enumerate(KEEP):
    student.bert.encoder.layer[s_idx].load_state_dict(
        teacher.bert.encoder.layer[t_idx].state_dict()
    )
print(f"== student params: {sum(p.numel() for p in student.parameters()) / 1e6:.1f}M "
      f"(init from teacher layers {KEEP}) ==")

raw = load_dataset("json", data_files={"train": "data/train.jsonl", "validation": "data/val.jsonl"})


def align(batch):
    tok = tokenizer(batch["tokens"], truncation=True, max_length=MAX_LEN, is_split_into_words=True)
    labels = []
    for i, tags in enumerate(batch["tags"]):
        word_ids = tok.word_ids(batch_index=i)
        prev, seq = None, []
        for wid in word_ids:
            if wid is None:
                seq.append(-100)
            elif wid != prev:
                seq.append(label2id[tags[wid]])
            else:
                seq.append(-100)
            prev = wid
        labels.append(seq)
    tok["labels"] = labels
    return tok


tokenized = raw.map(align, batched=True, remove_columns=raw["train"].column_names)
collator = DataCollatorForTokenClassification(tokenizer)


class DistillTrainer(Trainer):
    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        labels = inputs["labels"]
        outputs = model(**inputs)
        hard = outputs.loss  # CE on hard labels (labels passed in)
        with torch.no_grad():
            t_logits = teacher(
                input_ids=inputs["input_ids"], attention_mask=inputs["attention_mask"]
            ).logits
        mask = labels != -100
        s = F.log_softmax(outputs.logits[mask] / TEMPERATURE, dim=-1)
        t = F.softmax(t_logits[mask] / TEMPERATURE, dim=-1)
        soft = F.kl_div(s, t, reduction="batchmean") * (TEMPERATURE**2)
        loss = ALPHA * hard + (1 - ALPHA) * soft
        return (loss, outputs) if return_outputs else loss


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = np.argmax(logits, axis=2)
    tl, tp = [], []
    for pred, lab in zip(preds, labels):
        a, b = [], []
        for p, l in zip(pred, lab):
            if l != -100:
                a.append(id2label[l])
                b.append(id2label[p])
        tl.append(a)
        tp.append(b)
    return {
        "precision": precision_score(tl, tp),
        "recall": recall_score(tl, tp),
        "f1": f1_score(tl, tp),
    }


args = TrainingArguments(
    output_dir=OUT,
    eval_strategy="epoch",
    save_strategy="epoch",
    learning_rate=3e-5,
    per_device_train_batch_size=32,
    per_device_eval_batch_size=64,
    num_train_epochs=4,
    weight_decay=0.01,
    warmup_ratio=0.1,
    logging_steps=50,
    save_total_limit=1,
    load_best_model_at_end=True,
    metric_for_best_model="f1",
    report_to="none",
    seed=SEED,
)

trainer = DistillTrainer(
    model=student,
    args=args,
    train_dataset=tokenized["train"],
    eval_dataset=tokenized["validation"],
    data_collator=collator,
    compute_metrics=compute_metrics,
)

print("== distilling ==")
trainer.train()

metrics = trainer.evaluate()
print("== student validation metrics ==")
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

trainer.save_model(OUT)
tokenizer.save_pretrained(OUT)
print(f"== saved student to {OUT}/ ==")

# Generalisation check vs out-of-gazetteer entities (compare to teacher quality)
from transformers import pipeline  # noqa: E402

nlp = pipeline("token-classification", model=OUT, tokenizer=OUT,
               aggregation_strategy="simple", device=device)
for s in [
    "Min granne Lars Nordström bor på Kungsholmen och jobbar på Spotify i Stockholm.",
    "Kontakta Thorbjörn Fägerquist på Bromma innan fredag.",
    "Wei Zhang börjar på Northvolt i Skellefteå.",
    "Patienten Aigerim Bekova skrevs in på Sahlgrenska i Mölndal.",
]:
    print("\n>", s)
    for e in nlp(s):
        print(f"   {e['entity_group']:4} {e['word']!r:28} {e['score']:.2f}")
