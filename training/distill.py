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
import os
import sys
import zlib

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
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
)

from transformers import set_seed

# usage: distill.py [num_layers] [out_dir] [teacher_dir]
N_LAYERS = int(sys.argv[1]) if len(sys.argv) > 1 else 6
OUT = sys.argv[2] if len(sys.argv) > 2 else "student-model"
TEACHER = sys.argv[3] if len(sys.argv) > 3 else "model"
MAX_LEN = 128
ALPHA = 0.5        # weight on hard-label CE vs soft distillation
TEMPERATURE = 2.0
# Seeded so runs are comparable (see train.py).
SEED = int(os.environ.get("MASKERA_SEED", "1337"))
set_seed(SEED)

# --- v13: subword dropout (the decomposed-surname fix) ----------------------
# The v12 publish hold: distillation runs with the full 50k vocab where rare
# names are single tokens, then trim_vocab.py makes them DECOMPOSE at
# inference ("tjulander" -> tj ##ulan ##der), token sequences the weights
# never saw. v11's robustness to this was luck-of-the-mix; v12 lost it.
# Fix: with probability SUBWORD_DROPOUT per word, the STUDENT sees the word
# tokenized by the trimmed inference vocab (DROPOUT_VOCAB, the exact
# decompositions it will face after trim_vocab.py), so the ability is trained
# in, not lucked into. The TEACHER always sees the original full-vocab
# tokenization: the v12 bisection proved the trimmed teacher (same weights,
# only embedding rows removed) is blind to decomposed names, so soft labels
# from decomposed input would be poison. The KL loss is word-aligned instead:
# both tokenizations label exactly the first subtoken of each word, so the
# labeled positions match one-to-one in word order.
SUBWORD_DROPOUT = float(os.environ.get("MASKERA_SUBWORD_DROPOUT", "0"))
DROPOUT_VOCAB = os.environ.get("MASKERA_DROPOUT_VOCAB", "")
if SUBWORD_DROPOUT > 0 and not DROPOUT_VOCAB:
    sys.exit("MASKERA_SUBWORD_DROPOUT needs MASKERA_DROPOUT_VOCAB (trimmed tokenizer dir)")

# --- v15: decomposed-PER B/I consistency weighting -------------------------
# v14 masks rare surnames reliably, but its PER typing is less consistent on
# names split by the trimmed vocabulary. Upweight the existing hard B-PER /
# I-PER supervision only on PER words that the inference tokenizer decomposes
# more than the teacher tokenizer. A weight of 1.0 takes the original
# outputs.loss branch exactly, which keeps all pre-v15 recipes reproducible.
PER_CONSISTENCY_WEIGHT = float(os.environ.get("MASKERA_PER_CONSISTENCY_WEIGHT", "1"))
if not np.isfinite(PER_CONSISTENCY_WEIGHT) or PER_CONSISTENCY_WEIGHT < 1:
    sys.exit("MASKERA_PER_CONSISTENCY_WEIGHT must be a finite number >= 1")
if PER_CONSISTENCY_WEIGHT > 1 and (SUBWORD_DROPOUT <= 0 or not DROPOUT_VOCAB):
    sys.exit(
        "MASKERA_PER_CONSISTENCY_WEIGHT > 1 needs MASKERA_SUBWORD_DROPOUT > 0 "
        "and MASKERA_DROPOUT_VOCAB"
    )

LABELS = ["O", "B-PER", "I-PER", "B-LOC", "I-LOC", "B-ORG", "I-ORG", "B-ADR", "I-ADR"]
label2id = {l: i for i, l in enumerate(LABELS)}
id2label = {i: l for i, l in enumerate(LABELS)}

# MASKERA_DEVICE overrides (e.g. "cpu" for a smoke run beside a live MPS job).
device = os.environ.get("MASKERA_DEVICE") or (
    "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"
)
print(f"== device: {device}, seed: {SEED} ==")

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

drop_tok = AutoTokenizer.from_pretrained(DROPOUT_VOCAB) if SUBWORD_DROPOUT > 0 else None
if drop_tok is not None:
    print(f"== subword dropout: p={SUBWORD_DROPOUT}, trimmed vocab {DROPOUT_VOCAB} "
          f"({drop_tok.vocab_size} pieces) ==")
if PER_CONSISTENCY_WEIGHT > 1:
    print(f"== decomposed-PER consistency weight: {PER_CONSISTENCY_WEIGHT} ==")

CLS_ID, SEP_ID, UNK = tokenizer.cls_token_id, tokenizer.sep_token_id, tokenizer.unk_token


def _rand(*keys):
    """Deterministic per-word uniform in [0,1): stateless, so datasets.map
    caching and multiprocessing cannot desync the draw from the seed."""
    return zlib.crc32(f"{SEED}:{':'.join(map(str, keys))}".encode()) / 2**32


def make_align(dropout_p):
    def align(batch, indices):
        out = {k: [] for k in ("input_ids", "attention_mask", "labels", "kl_mask",
                               "per_consistency_mask", "t_input_ids",
                               "t_attention_mask", "t_labels")}
        for i, (tokens, tags) in enumerate(zip(batch["tokens"], batch["tags"])):
            s_words, t_words = [], []  # per-word piece lists (student / teacher)
            for w_idx, w in enumerate(tokens):
                t_p = tokenizer.tokenize(w) or [UNK]
                s_p = t_p
                if drop_tok is not None and _rand(indices[i], w_idx) < dropout_p:
                    # Trimmed-vocab pieces are a subset of the full vocab, so
                    # they map to valid full-vocab ids for the student.
                    cand = drop_tok.tokenize(w)
                    if cand and drop_tok.unk_token not in cand:
                        s_p = cand
                t_words.append(t_p)
                s_words.append(s_p)
            # Word-level truncation so BOTH tokenizations keep the same words
            # (the word-aligned KL below needs labeled positions to match 1:1).
            n = len(tokens)
            while n > 0 and (
                2 + sum(len(p) for p in s_words[:n]) > MAX_LEN
                or 2 + sum(len(p) for p in t_words[:n]) > MAX_LEN
            ):
                n -= 1
            # STUDENT labels cover EVERY piece (continuations get the I- tag):
            # v13 take 1 left continuations at -100 and the student improvised
            # incoherent B/B/I chains on decomposed names ("##ulan" as B-PER,
            # tail pieces under minScore), which reconstruct()'s whole-word
            # guard then rejected wholesale. kl_mask marks first subtokens:
            # the word-aligned KL against the teacher stays first-piece-only.
            ids, labs, klm, pcm = [CLS_ID], [-100], [0], [0]
            for w_idx in range(n):
                pieces = s_words[w_idx]
                tag = tags[w_idx]
                ids += tokenizer.convert_tokens_to_ids(pieces)
                labs += [label2id[tag]] + [label2id[tag.replace("B-", "I-")]] * (len(pieces) - 1)
                klm += [1] + [0] * (len(pieces) - 1)
                # Narrowly target trim-induced PER decompositions. Words that
                # already had the teacher tokenization keep the ordinary CE
                # weight, as do every LOC/ORG/ADR/O token.
                weighted_per = (
                    tag in ("B-PER", "I-PER")
                    and len(pieces) > 1
                    and pieces != t_words[w_idx]
                )
                pcm += [1 if weighted_per else 0] * len(pieces)
            ids.append(SEP_ID)
            labs.append(-100)
            klm.append(0)
            pcm.append(0)
            out["input_ids"].append(ids)
            out["attention_mask"].append([1] * len(ids))
            out["labels"].append(labs)
            out["kl_mask"].append(klm)
            out["per_consistency_mask"].append(pcm)
            # TEACHER keeps first-subtoken-only labels; t_labels != -100 is
            # its side of the word-aligned KL mask.
            ids, labs = [CLS_ID], [-100]
            for w_idx in range(n):
                pieces = t_words[w_idx]
                ids += tokenizer.convert_tokens_to_ids(pieces)
                labs += [label2id[tags[w_idx]]] + [-100] * (len(pieces) - 1)
            ids.append(SEP_ID)
            labs.append(-100)
            out["t_input_ids"].append(ids)
            out["t_attention_mask"].append([1] * len(ids))
            out["t_labels"].append(labs)
        return out

    return align


# Dropout on the train split only; validation measures the standard
# tokenization (its teacher fields are then identical to the student's).
tokenized = raw["train"].map(
    make_align(SUBWORD_DROPOUT), batched=True, with_indices=True,
    remove_columns=raw["train"].column_names,
)
tokenized = {
    "train": tokenized,
    "validation": raw["validation"].map(
        make_align(0.0), batched=True, with_indices=True,
        remove_columns=raw["validation"].column_names,
    ),
}


class DualCollator:
    """Pads the student and teacher tokenizations independently (they differ
    in length when subword dropout fires), then merges into one batch."""

    def __init__(self, tok):
        self.base = DataCollatorForTokenClassification(tok)

    def __call__(self, features):
        s = [{k: f[k] for k in ("input_ids", "attention_mask", "labels")} for f in features]
        t = [
            {"input_ids": f["t_input_ids"], "attention_mask": f["t_attention_mask"],
             "labels": f["t_labels"]}
            for f in features
        ]
        # kl_mask rides through a labels slot so the base collator pads it
        # (pad value -100, so `== 1` still selects exactly the first pieces).
        k = [
            {"input_ids": f["input_ids"], "attention_mask": f["attention_mask"],
             "labels": f["kl_mask"]}
            for f in features
        ]
        p = [
            {"input_ids": f["input_ids"], "attention_mask": f["attention_mask"],
             "labels": f["per_consistency_mask"]}
            for f in features
        ]
        batch = self.base(s)
        t_batch = self.base(t)
        batch["t_input_ids"] = t_batch["input_ids"]
        batch["t_attention_mask"] = t_batch["attention_mask"]
        batch["t_labels"] = t_batch["labels"]
        batch["kl_mask"] = self.base(k)["labels"]
        batch["per_consistency_mask"] = self.base(p)["labels"]
        return batch


collator = DualCollator(tokenizer)


class DistillTrainer(Trainer):
    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        # Teacher inputs are the ORIGINAL tokenization (see the subword-
        # dropout note at the top); pop them so the student never sees them.
        t_ids = inputs.pop("t_input_ids")
        t_att = inputs.pop("t_attention_mask")
        t_lab = inputs.pop("t_labels")
        kl_mask = inputs.pop("kl_mask")
        per_consistency_mask = inputs.pop("per_consistency_mask")
        outputs = model(**inputs)
        # CE on hard labels (ALL pieces, continuations I-). Preserve the
        # historical loss implementation exactly unless the v15 lever is on.
        if PER_CONSISTENCY_WEIGHT == 1:
            hard = outputs.loss
        else:
            labels = inputs["labels"]
            token_loss = F.cross_entropy(
                outputs.logits.reshape(-1, len(LABELS)),
                labels.reshape(-1),
                ignore_index=-100,
                reduction="none",
            ).reshape_as(labels)
            valid = labels != -100
            weights = torch.ones_like(token_loss)
            weights = weights.masked_fill(
                per_consistency_mask == 1, PER_CONSISTENCY_WEIGHT
            )
            hard = (token_loss[valid] * weights[valid]).sum() / weights[valid].sum()
        with torch.no_grad():
            t_logits = teacher(input_ids=t_ids, attention_mask=t_att).logits
        # Word-aligned KL: first subtoken of each kept word on both sides, so
        # the masked positions correspond 1:1 in order even when the student's
        # sequence is longer (dropout decomposition).
        s_mask = kl_mask == 1
        t_mask = t_lab != -100
        s = F.log_softmax(outputs.logits[s_mask] / TEMPERATURE, dim=-1)
        t = F.softmax(t_logits[t_mask] / TEMPERATURE, dim=-1)
        assert s.shape[0] == t.shape[0], "student/teacher labeled positions desynced"
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


# Memory knobs, default to the historical 32/1 so the recipe is unchanged
# unless set. Lowering the micro-batch while raising accumulation keeps the
# effective batch size fixed (this model is layernorm-only, so accumulation is
# numerically near-identical) and roughly halves activation memory when the
# host is under pressure and the OS would otherwise kill the run.
DISTILL_BATCH = int(os.environ.get("MASKERA_DISTILL_BATCH", "32"))
GRAD_ACCUM = int(os.environ.get("MASKERA_GRAD_ACCUM", "1"))
if DISTILL_BATCH < 1 or GRAD_ACCUM < 1:
    sys.exit("MASKERA_DISTILL_BATCH and MASKERA_GRAD_ACCUM must be >= 1")
if DISTILL_BATCH * GRAD_ACCUM != 32:
    print(f"== NOTE: effective batch {DISTILL_BATCH * GRAD_ACCUM} != historical 32 ==")

args = TrainingArguments(
    output_dir=OUT,
    eval_strategy="epoch",
    save_strategy="epoch",
    learning_rate=3e-5,
    per_device_train_batch_size=DISTILL_BATCH,
    gradient_accumulation_steps=GRAD_ACCUM,
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
    use_cpu=device == "cpu",
    # The t_* teacher fields are not in the model signature; the default
    # column pruning would silently drop them before the collator runs.
    remove_unused_columns=False,
)

trainer = DistillTrainer(
    model=student,
    args=args,
    train_dataset=tokenized["train"],
    eval_dataset=tokenized["validation"],
    data_collator=collator,
    compute_metrics=compute_metrics,
    callbacks=[EarlyStoppingCallback(early_stopping_patience=1)],
)

print("== distilling ==")
# MASKERA_RESUME=1 continues from the last epoch checkpoint in OUT, so a run
# stopped by an external OOM kill picks up completed epochs instead of
# restarting. Trainer restores optimizer / scheduler / early-stopping state.
_resume = os.environ.get("MASKERA_RESUME") == "1"
trainer.train(resume_from_checkpoint=True if _resume else None)

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
