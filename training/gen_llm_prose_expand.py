#!/usr/bin/env python3
"""
Fast 96 GB Blackwell G4 expansion of llm_prose_pool.json -> llm_prose_pool_v22f.json.
Reuses gen_llm_prose.py's deterministic privacy/proper-noun validator and adds
high-leverage Swedish ORG/LOC/email/support/clinical prose + org_vs_generic contrasts
in native bf16 (batch 64, ~8-12 min on RTX PRO 6000 Blackwell).
"""
import gc
import json
import os
import random
import re
import sys
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gen_llm_prose as base  # noqa: E402

# Extend forbidden proper nouns so unlabeled landmarks never enter O.
base.FORBIDDEN_PROPER_LOWER |= {
    "centralstationen",
    "centralsstationen",
    "t-centralen",
    "centralen",
    "alperna",
}

BASE_POOL = Path(sys.argv[1] if len(sys.argv) > 1 else "data/llm_prose_pool.json")
OUT_PATH = Path(sys.argv[2] if len(sys.argv) > 2 else "data/llm_prose_pool_v22f.json")
MODEL_ID = os.environ.get("LLM_EXPAND_MODEL", "Qwen/Qwen2.5-14B-Instruct")
BATCH_SIZE = int(os.environ.get("LLM_EXPAND_BATCH", "64"))
ADD_CLEAN = int(os.environ.get("LLM_ADD_CLEAN", "1200"))
ADD_SLOTTED = int(os.environ.get("LLM_ADD_SLOTTED", "2400"))
ADD_CONTRAST = int(os.environ.get("LLM_ADD_CONTRAST", "600"))
SEED = int(os.environ.get("LLM_EXPAND_SEED", "2206"))

EXTRA_DOMAINS = [
    ("svensk affärsnyhet", "saklig svensk nyhetsartikel om samarbeten, upphandlingar, myndigheter, föreningar och företag"),
    ("kundtjänstmejl", "kort svenskt e-postmeddelande eller kundtjänstärende om leverans, faktura eller bokning"),
    ("arbetsplats och möte", "kort svenskt internt meddelande eller mötesanteckning om projekt, ansvar och tidplan"),
    ("vård och medicin", "saklig svensk vårdinformation om symtom, behandling, mottagning, läkemedel och uppföljning"),
    ("kommun och myndighet", "svenskt myndighets- eller kommunbeslut om nämnder, skolor, föreningar och stadsdelar"),
    ("kultur, media och sport", "svensk artikel om föreningar, redaktioner, universitet, museum och idrottsklubbar"),
    ("vardagligt samtal", "ledig vardagssvenska i chatt eller forum om arbete, familj, resor och ärenden"),
]

ORG_LOC_RECIPES = [
    ["{ORG1}", "{ORG2}", "{LOC1}"],
    ["{PER1}", "{ORG1}", "{LOC1}"],
    ["{ORG1}", "{LOC1}", "{LOC2}"],
    ["{PER1}", "{ORG1}", "{ORG2}"],
    ["{PER1}", "{ADR1}", "{LOC1}", "{ORG1}"],
    ["{PER_LAST}", "{ORG1}", "{LOC1}"],
    ["{PER1_GEN}", "{ORG1}", "{LOC1}"],
    ["{PER1}", "{PER2}", "{ORG1}", "{LOC1}"],
    ["{ORG1}", "{ADR1}", "{LOC1}"],
    ["{PER_FIRST}", "{ORG1}", "{LOC1}"],
]

ORG_CONTRAST_WORDS = [
    "myndigheten", "företaget", "banken", "kliniken", "vårdcentralen",
    "skolan", "förskolan", "universitetet", "föreningen", "kommunen",
    "redaktionen", "domstolen", "stiftelsen", "styrelsen", "förvaltningen",
    "leverantören", "operatören", "klubben", "bolaget", "institutet",
]


def build_extra_clean_prompt(rng: random.Random) -> str:
    domain, desc = rng.choice(EXTRA_DOMAINS)
    n_sents = rng.choice(["1-2 korta meningar", "2-3 meningar"])
    return (
        f"Skriv {n_sents} naturlig, idiomatisk svenska inom området '{domain}' ({desc}).\n"
        "REGLER:\n"
        "- Använd INGA egennamn alls: inga personnamn, inga städer, inga länder, inga företag, inga myndigheter, inga varumärken.\n"
        "- Inga klamrar, inga nummer som liknar personnummer, telefonnummer, postnummer eller e-post.\n"
        "- Skriv enbart själva texten, utan rubrik eller punktlista."
    )


def build_extra_slotted_prompt(rng: random.Random) -> str:
    domain, desc = rng.choice(EXTRA_DOMAINS)
    slots = rng.choice(ORG_LOC_RECIPES)
    slot_str = ", ".join(slots)
    return (
        f"Skriv 2-3 naturliga meningar på idiomatisk svenska inom '{domain}' ({desc}).\n"
        f"Använd exakt dessa platshållare på naturliga platser i texten: {slot_str}.\n"
        "REGLER:\n"
        "- Skriv platshållarna exakt som ovan med måsvingar (t.ex. {ORG1}, {LOC1}, {PER1}, {ADR1}).\n"
        "- Hitta INTE på några andra egennamn (inga riktiga städer, länder, företag eller personnamn utanför platshållarna).\n"
        "- Inga telefonnummer, postnummer, personnummer eller e-post.\n"
        "- Skriv bara själva texten."
    )


def build_extra_contrast_prompt(rng: random.Random):
    r = rng.random()
    if r < 0.60:
        word = rng.choice(ORG_CONTRAST_WORDS)
        prompt = (
            "Skriv två korta, nästan identiska svenska texter (1-2 meningar vardera) märkta POS: och NEG:.\n"
            f"- I POS: nämns en namngiven organisation via platshållaren {{ORG1}} i en naturlig mening (t.ex. samarbete, beslut, rapport eller kontakt).\n"
            f"- I NEG: byts {{ORG1}} ut mot det allmänna substantivet '{word}' (liten bokstav mitt i mening) utan något egennamn alls.\n"
            "- Hitta inte på några andra egennamn i POS eller NEG.\n"
            "Svara exakt i formatet:\nPOS: ...\nNEG: ..."
        )
        return ("org_vs_generic", word, prompt)
    if r < 0.85:
        word, meaning = rng.choice(base.HOMOGRAPH_WORDS)
        prompt = (
            "Skriv två korta, naturliga svenska texter (1-2 meningar) märkta POS: och NEG:.\n"
            f"- I POS: används {{HOMO_PER}} som ett tydligt personnamn (t.ex. kollega, kund eller kontaktperson).\n"
            f"- I NEG: används {{HOMO_WORD}} som det vanliga svenska ordet '{word.lower()}' ({meaning}), helt utan personnamn.\n"
            "- Inga andra egennamn i någondera texten.\n"
            "Svara exakt i formatet:\nPOS: ...\nNEG: ..."
        )
        return ("homograph", word, prompt)
    prompt = (
        "Skriv två korta svenska texter (1-2 meningar) märkta POS: och NEG:.\n"
        "- I POS: används {PER_LAST_GEN} som ett efternamn i genitiv följt av ett substantiv (t.ex. förslag, rapport eller ärende).\n"
        "- I NEG: används istället ett vanligt svenskt substantiv i genitiv utan egennamn (t.ex. avdelningens eller projektets).\n"
        "- Inga andra egennamn i POS eller NEG.\n"
        "Svara exakt i formatet:\nPOS: ...\nNEG: ..."
    )
    return ("genitive_per_vs_noun", "genitive", prompt)


def main():
    rng = random.Random(SEED)
    torch.manual_seed(SEED)

    prev = json.loads(BASE_POOL.read_text(encoding="utf-8"))
    clean_pool = list(prev.get("clean", []))
    slotted_pool = list(prev.get("slotted", []))
    contrast_pool = list(prev.get("contrast_pairs", []))
    clean_seen = set(clean_pool)
    slotted_seen = set(slotted_pool)
    contrast_seen = {f"{p['pos']} ||| {p['neg']}" for p in contrast_pool}
    used_models = list(prev.get("models", []))
    if f"{MODEL_ID}:v22f-expand" not in used_models:
        used_models.append(f"{MODEL_ID}:v22f-expand")

    goal_clean = len(clean_pool) + ADD_CLEAN
    goal_slotted = len(slotted_pool) + ADD_SLOTTED
    goal_contrast = len(contrast_pool) + ADD_CONTRAST
    rejects: dict[str, int] = {}

    def rec_rej(reason: str):
        k = reason.split(":")[0]
        rejects[k] = rejects.get(k, 0) + 1

    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu"
    print(
        f"== Loading {MODEL_ID} in native bf16 on {gpu_name} (batch={BATCH_SIZE}) ==\n"
        f"   Adding: +{ADD_CLEAN} clean, +{ADD_SLOTTED} slotted, +{ADD_CONTRAST} contrast",
        flush=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    tokenizer.padding_side = "left"
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token_id = tokenizer.eos_token_id
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        device_map="auto",
        torch_dtype=torch.bfloat16,
    ).eval()

    try:
        # 1. Clean
        print(f"\n== [1/3] Expanding clean -> {goal_clean} ==", flush=True)
        for rnd in range(max(15, (ADD_CLEAN // BATCH_SIZE) * 3 + 6)):
            if len(clean_pool) >= goal_clean:
                break
            prompts = [build_extra_clean_prompt(rng) for _ in range(BATCH_SIZE)]
            for raw in base.generate_batch(model, tokenizer, prompts, max_new_tokens=140):
                text = base.normalize_paragraph(raw)
                if text in clean_seen:
                    continue
                ok, reason = base.passes_deterministic_checks(
                    text, set(), require_slots=False, min_chars=30, min_words=8
                )
                if ok:
                    clean_seen.add(text)
                    clean_pool.append(text)
                    if len(clean_pool) >= goal_clean:
                        break
                else:
                    rec_rej(f"clean_{reason}")
            if (rnd + 1) % 4 == 0 or len(clean_pool) >= goal_clean:
                print(f"  clean: {len(clean_pool)}/{goal_clean} (round {rnd + 1})", flush=True)

        # 2. Slotted ORG/LOC/workplace/clinical
        print(f"\n== [2/3] Expanding slotted -> {goal_slotted} ==", flush=True)
        for rnd in range(max(20, (ADD_SLOTTED // BATCH_SIZE) * 3 + 8)):
            if len(slotted_pool) >= goal_slotted:
                break
            prompts = [build_extra_slotted_prompt(rng) for _ in range(BATCH_SIZE)]
            for raw in base.generate_batch(model, tokenizer, prompts, max_new_tokens=160):
                text = base.normalize_paragraph(raw)
                if text in slotted_seen:
                    continue
                ok, reason = base.passes_deterministic_checks(
                    text, base.ALLOWED_SLOTS, require_slots=True, min_chars=35, min_words=9
                )
                if ok:
                    slotted_seen.add(text)
                    slotted_pool.append(text)
                    if len(slotted_pool) >= goal_slotted:
                        break
                else:
                    rec_rej(f"slotted_{reason}")
            if (rnd + 1) % 4 == 0 or len(slotted_pool) >= goal_slotted:
                print(f"  slotted: {len(slotted_pool)}/{goal_slotted} (round {rnd + 1})", flush=True)

        # 3. Contrast (org_vs_generic + homograph + genitive_per)
        print(f"\n== [3/3] Expanding contrast -> {goal_contrast} ==", flush=True)
        for rnd in range(max(12, (ADD_CONTRAST // BATCH_SIZE) * 4 + 6)):
            if len(contrast_pool) >= goal_contrast:
                break
            specs = [build_extra_contrast_prompt(rng) for _ in range(BATCH_SIZE)]
            outs = base.generate_batch(model, tokenizer, [s[2] for s in specs], max_new_tokens=190)
            for (kind, word, _), raw in zip(specs, outs):
                m_pos = re.search(r"POS:\s*(.+?)(?=\n\s*NEG:|$)", raw, re.S)
                m_neg = re.search(r"NEG:\s*(.+)", raw, re.S)
                if not m_pos or not m_neg:
                    rec_rej("contrast_format")
                    continue
                pos = base.normalize_paragraph(m_pos.group(1))
                neg = base.normalize_paragraph(m_neg.group(1))
                key = f"{pos} ||| {neg}"
                if key in contrast_seen:
                    continue
                if kind == "homograph":
                    if "{HOMO_PER}" not in pos or "{HOMO_WORD}" not in neg:
                        rec_rej("contrast_homo_slot")
                        continue
                    ok_p, rp = base.passes_deterministic_checks(
                        pos, base.ALLOWED_SLOTS | {"HOMO_PER"}, require_slots=True, min_chars=25, min_words=6
                    )
                    ok_n, rn = base.passes_deterministic_checks(
                        neg, {"HOMO_WORD"}, require_slots=True, min_chars=25, min_words=6
                    )
                else:
                    req = "{ORG1}" if kind == "org_vs_generic" else "{PER_LAST_GEN}"
                    if req not in pos:
                        rec_rej("contrast_missing_slot")
                        continue
                    ok_p, rp = base.passes_deterministic_checks(
                        pos, base.ALLOWED_SLOTS, require_slots=True, min_chars=30, min_words=7
                    )
                    ok_n, rn = base.passes_deterministic_checks(
                        neg, set(), require_slots=False, min_chars=30, min_words=7
                    )
                if ok_p and ok_n:
                    contrast_seen.add(key)
                    contrast_pool.append({"kind": kind, "word": word, "pos": pos, "neg": neg})
                    if len(contrast_pool) >= goal_contrast:
                        break
                else:
                    rec_rej(f"contrast_{rp if not ok_p else rn}")
            if (rnd + 1) % 3 == 0 or len(contrast_pool) >= goal_contrast:
                print(f"  contrast: {len(contrast_pool)}/{goal_contrast} (round {rnd + 1})", flush=True)
    finally:
        del model
        del tokenizer
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    rng.shuffle(clean_pool)
    rng.shuffle(slotted_pool)
    rng.shuffle(contrast_pool)
    payload = {
        "schemaVersion": 1,
        "models": used_models,
        "seed": SEED,
        "counts": {
            "clean": len(clean_pool),
            "slotted": len(slotted_pool),
            "contrast_pairs": len(contrast_pool),
        },
        "rejectStats": rejects,
        "clean": clean_pool,
        "slotted": slotted_pool,
        "contrast_pairs": contrast_pool,
    }
    tmp = OUT_PATH.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, OUT_PATH)
    print(f"\n[ALL DONE] Wrote {OUT_PATH}: {payload['counts']}", flush=True)
    print(f"Rejects: {rejects}", flush=True)


if __name__ == "__main__":
    main()
