#!/usr/bin/env python3
"""
Generate deterministically verified, 100% synthetic Swedish prose templates on GPU
for Maskera v22 using an open-weight instruct LLM (default: Qwen/Qwen2.5-14B-Instruct).

Three pools are written to a single JSON file (default: data/llm_prose_pool.json):
  1. clean:          2-4 sentence natural Swedish paragraphs with strictly 0 named entities
                     (rich compounds, editorial, municipal, legal, medical, tech, finance, blog).
  2. slotted:        2-4 sentence natural Swedish paragraphs using ONLY explicit placeholders:
                     {PER1}, {PER1_GEN}, {PER2}, {PER_LAST}, {PER_LAST_GEN}, {PER_FIRST},
                     {LOC1}, {LOC2}, {ORG1}, {ORG2}, {ADR1}.
  3. contrast_pairs: Paired minimal-contrast paragraphs where the same ambiguous word/pattern
                     is PII in `pos` and ordinary non-PII Swedish in `neg` (homograph names,
                     named org vs generic institution, named place vs generic location noun,
                     surname genitive vs ordinary compound genitive).

Deterministic verification rejects any paragraph that:
  - has malformed or unknown placeholders
  - has ANY unexpected mid-sentence capitalized word (outside a small whitelist of non-PII
    technical/metric acronyms), preventing unlabeled real proper nouns from slipping into O
  - contains any known Swedish/international proper name, city, country, org, or brand
  - contains any identifier pattern (PNR, orgnr, IBAN, phone, email, URL, IP, postal code)

Usage:
    python3 gen_llm_prose.py [output_json]
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

OUT_PATH = Path(sys.argv[1] if len(sys.argv) > 1 else "data/llm_prose_pool.json")
MODEL_ID = os.environ.get("LLM_PROSE_MODEL", "")
BATCH_SIZE = int(os.environ.get("LLM_PROSE_BATCH", "24"))
TARGET_CLEAN = int(os.environ.get("LLM_TARGET_CLEAN", "2800"))
TARGET_SLOTTED = int(os.environ.get("LLM_TARGET_SLOTTED", "3200"))
TARGET_CONTRAST = int(os.environ.get("LLM_TARGET_CONTRAST", "1200"))
SEED = int(os.environ.get("LLM_PROSE_SEED", "2201"))

ALLOWED_SLOTS = {
    "PER1",
    "PER1_GEN",
    "PER2",
    "PER_LAST",
    "PER_LAST_GEN",
    "PER_FIRST",
    "LOC1",
    "LOC2",
    "ORG1",
    "ORG2",
    "ADR1",
}

ALLOWED_CONTRAST_SLOTS = ALLOWED_SLOTS | {"HOMO_PER", "HOMO_WORD"}

# Unambiguous non-PII technical/financial/medical abbreviations allowed mid-sentence.
ALLOWED_MID_CAPS = {
    "IT", "AI", "HR", "VD", "BNP", "SEK", "EUR", "USD", "NOK", "DKK",
    "KPI", "ROI", "SQL", "API", "PDF", "CSV", "XML", "JSON", "HTML", "CSS",
    "GDPR", "MWh", "kWh", "GWh", "MW", "kW", "EKG", "DNA", "RNA", "MR", "CT",
    "B2B", "B2C", "SaaS", "USB", "CPU", "GPU", "RAM", "SSD", "LED", "GPS",
    "SMS", "PIN", "CV", "OK", "FAQ", "SLA", "VPN", "DNS", "TLS", "SSL",
    "HTTP", "HTTPS", "SSH", "CLI", "SDK", "REST", "CO2", "NOx", "pH",
    "ISO", "CE", "IV", "II", "III", "A", "B", "C", "D",
}

# Unmistakable proper nouns that must NEVER slip unlabeled into clean/slotted prose.
FORBIDDEN_PROPER_LOWER = {
    "sverige", "sveriges", "norge", "danmark", "finland", "island", "tyskland",
    "frankrike", "spanien", "italien", "polen", "ryssland", "kina", "japan",
    "indien", "usa", "storbritannien", "europa", "europas", "stockholm",
    "stockholms", "göteborg", "göteborgs", "malmö", "malmös", "uppsala",
    "linköping", "örebro", "västerås", "helsingborg", "jönköping", "norrköping",
    "lund", "umeå", "gävle", "borås", "karlstad", "växjö", "halmstad",
    "sundsvall", "luleå", "skåne", "dalarna", "värmland", "halland", "norrland",
    "gotland", "öland", "london", "paris", "berlin", "new york", "oslo",
    "köpenhamn", "helsingfors", "bryssel", "skatteverket", "försäkringskassan",
    "trafikverket", "arbetsförmedlingen", "migrationsverket", "polismyndigheten",
    "riksbanken", "socialstyrelsen", "folkhälsomyndigheten", "livsmedelsverket",
    "naturvårdsverket", "bolagsverket", "kronofogden", "tullverket", "volvo",
    "ericsson", "ikea", "spotify", "klarna", "scania", "telia", "vattenfall",
    "handelsbanken", "swedbank", "nordea", "seb", "postnord", "skanska",
    "electrolux", "sandvik", "securitas", "google", "microsoft", "apple",
    "amazon", "meta", "openai", "tesla", "netflix", "anna", "erik", "lars",
    "maria", "johan", "sara", "karin", "anders", "eva", "nils", "lena",
    "gustav", "oskar", "emma", "sofia", "daniel", "henrik", "fredrik",
    "karlsson", "eriksson", "andersson", "johansson", "nilsson", "larsson",
    "persson", "svensson", "gustafsson", "pettersson", "lindberg", "lindqvist",
    "bergström", "holmberg", "sandberg", "forsberg", "nyström", "eu", "fn",
    "nato", "riksdagen", "regeringen", "svt", "dn", "svd", "aftonbladet",
    "expressen", "sj", "sas", "ica", "coop", "systembolaget", "apoteket",
}

# Privacy-guard regexes mirroring privacy_guard.mjs (fast fail-closed prefilter).
PRIVACY_PATTERNS = [
    re.compile(r"\b\d{6,8}[-+\s]?\d{4}\b"),  # personnummer / orgnr
    re.compile(r"\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b"),  # IBAN
    re.compile(r"\b(?:\+46|0046|07\d)[\d\s-]{6,14}\b"),  # phone
    re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),  # email
    re.compile(r"(?:https?://|www\.)", re.I),  # URL
    re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),  # IPv4
    re.compile(r"\b\d{3}\s\d{2}\b"),  # Swedish postal code
    re.compile(r"\b\d{3,4}-\d{4}\b"),  # bankgiro / clearing
    re.compile(r"\b\d{8,}\b"),  # long account/card numbers
]

SWEDISH_STOPWORDS = {
    "och", "att", "det", "som", "för", "med", "till", "den", "har", "inte",
    "ett", "om", "av", "på", "är", "en", "från", "vid", "kan", "eller",
    "men", "ska", "under", "efter", "över", "genom", "mellan", "inom",
}

DOMAINS = [
    ("nyheter och samhälle", "saklig nyhetsprosa om samhällsfrågor, infrastruktur och beslut"),
    ("kommun och förvaltning", "formell förvaltningsprosa om nämnder, utskott, planer och budgetar"),
    ("ekonomi och finans", "ekonomisk analys om räntor, kvartalsrapporter, kostnader och marginaler"),
    ("teknik och mjukvara", "teknisk text om systemdrift, databaser, API:er, uppdateringar och säkerhet"),
    ("juridik och avtal", "juridisk prosa om avtalsvillkor, uppsägningstid, ansvar och föreskrifter"),
    ("sjukvård och medicin", "klinisk eller medicinsk facktext om symtom, provsvar, dosering och uppföljning"),
    ("forskning och utbildning", "akademisk text om studier, metoder, resultat och undervisning"),
    ("industri och energi", "branschtext om produktion, leveranskedjor, elnät, material och effekt"),
    ("kultur och recension", "kulturtext om böcker, utställningar, musik, teater och film"),
    ("sport och fritid", "sporttext om träning, matcher, taktik, säsong och resultat"),
    ("vardagsblogg och samtal", "ledig, vardaglig svensk blogg- eller chattstil om vardag och planer"),
    ("kundtjänst och e-handel", "kundserviceärende om leveranser, returer, garantier, fakturor och order"),
    ("fastighet och boende", "text om hyresavtal, renovering, bostadsrätt, besiktning och drift"),
    ("transport och logistik", "text om godstransporter, tidtabeller, lager, tull och förseningar"),
]

HOMOGRAPH_WORDS = [
    ("Björn", "djuret björn"),
    ("Sten", "materialet sten"),
    ("Stig", "verbet stig (kliva in) eller substantivet stig"),
    ("Bo", "verbet bo (bo kvar)"),
    ("Liv", "substantivet liv (liv och rörelse)"),
    ("Bror", "släktskapsordet bror"),
    ("Klara", "verbet klara (klara av) eller adjektivet klara"),
    ("Linda", "verbet linda (linda in)"),
    ("Axel", "kroppsdelen eller maskindelen axel"),
    ("Max", "adverbet max (högst)"),
    ("Per", "prepositionen per (per månad/vecka)"),
    ("Karl", "substantivet karl"),
    ("Maj", "månaden maj"),
    ("Juni", "månaden juni"),
    ("Saga", "substantivet saga"),
    ("Frank", "adjektivet frank (uppriktig)"),
    ("Sanna", "adjektivet sanna (sanna ord)"),
    ("Knut", "substantivet knut"),
    ("Rosa", "färgen rosa"),
    ("Rita", "verbet rita"),
    ("Fred", "substantivet fred"),
    ("Tom", "adjektivet tom"),
    ("Jack", "substantivet jack (skåra/märke)"),
    ("Lova", "verbet lova"),
    ("Tina", "verbet tina (tina fryst mat)"),
    ("Dan", "talspråksordet dan (dagen före)"),
    ("Urban", "adjektivet urban (stadsmässig)"),
    ("Mina", "pronomenet mina (mina uppgifter)"),
    ("Dag", "substantivet dag (dag efter dag)"),
]

SLOT_RECIPES = [
    ["{PER1}", "{LOC1}", "{ORG1}"],
    ["{PER1}", "{PER_LAST_GEN}", "{ORG1}"],
    ["{PER_LAST}", "{PER_LAST_GEN}", "{LOC1}"],
    ["{PER1_GEN}", "{ORG1}", "{LOC1}"],
    ["{PER1}", "{ADR1}", "{LOC1}"],
    ["{PER1}", "{PER2}", "{ORG1}", "{LOC1}"],
    ["{PER_FIRST}", "{PER2}", "{LOC1}"],
    ["{PER_LAST}", "{ORG1}", "{ORG2}"],
    ["{PER1}", "{LOC1}", "{LOC2}"],
    ["{PER_FIRST}", "{ADR1}", "{ORG1}"],
    ["{PER_LAST_GEN}", "{LOC1}"],
    ["{PER1}", "{PER1_GEN}", "{ADR1}"],
]

BRACE_RE = re.compile(r"\{([^}]*)\}")
SENT_SPLIT_RE = re.compile(r"(?<=[.!?])\s+|\n+")
WORD_RE = re.compile(r"[A-Za-zÅÄÖåäöÉéÜüÖöÄäÅå][A-Za-zÅÄÖåäöÉéÜüÖöÄäÅå0-9-]*")


def normalize_paragraph(text: str) -> str:
    text = text.strip()
    # Strip markdown quotes, bullet prefixes, or numbering the LLM might emit
    text = re.sub(r"^(?:[-*•]\s+|\d+[.)]\s+|\"|»|«)+", "", text).strip()
    text = re.sub(r"(?:\"|»|«)+$", "", text).strip()
    text = re.sub(r"\s+", " ", text)
    return text


def passes_deterministic_checks(
    text: str,
    allowed_slots: set[str],
    require_slots: bool,
    extra_allowed_words: set[str] | None = None,
    min_chars: int = 50,
    min_words: int = 14,
) -> tuple[bool, str]:
    if not text or len(text) < min_chars or len(text) > 950:
        return False, "length"
    # Reject unbalanced braces
    if text.count("{") != text.count("}"):
        return False, "unbalanced_braces"
    found_slots = BRACE_RE.findall(text)
    if require_slots and not found_slots:
        return False, "missing_slot"
    if not require_slots and found_slots:
        return False, "unexpected_slot"
    for s in found_slots:
        if s not in allowed_slots:
            return False, f"unknown_slot:{s}"

    # Replace valid slots with lowercase placeholder token before lexical checks
    scrubbed = BRACE_RE.sub("entitet", text)
    words = WORD_RE.findall(scrubbed)
    if len(words) < min_words or len(words) > 120:
        return False, "word_count"

    # Require genuinely Swedish text (stopwords + Swedish letters or high stopword ratio)
    lower_words = [w.lower() for w in words]
    sw_hits = sum(1 for w in lower_words if w in SWEDISH_STOPWORDS)
    if sw_hits < (2 if min_words < 10 else 3):
        return False, "not_swedish"

    # Privacy-guard identifier rejection
    for pat in PRIVACY_PATTERNS:
        if pat.search(scrubbed):
            return False, "privacy_pattern"

    # Reject forbidden real proper nouns anywhere (even lowercase or sentence-initial)
    allowed_lower = {w.lower() for w in (extra_allowed_words or set())}
    for lw in lower_words:
        if lw in FORBIDDEN_PROPER_LOWER and lw not in allowed_lower:
            return False, f"forbidden_proper:{lw}"

    # Reject ANY unexpected mid-sentence capitalized word (deterministic anti-leak guard!)
    sentences = [s.strip() for s in SENT_SPLIT_RE.split(scrubbed) if s.strip()]
    for sent in sentences:
        # Remove leading quotes/dashes
        sent_words = WORD_RE.findall(sent)
        for idx, w in enumerate(sent_words):
            if idx == 0:
                continue  # sentence-initial cap is normal Swedish
            if w[0].isupper():
                if w in ALLOWED_MID_CAPS or w.lower() in allowed_lower:
                    continue
                return False, f"mid_cap:{w}"

    return True, "ok"


def build_clean_prompt(rng: random.Random) -> str:
    domain, desc = rng.choice(DOMAINS)
    style = rng.choice([
        "Skriv 2–3 sakliga, naturliga meningar på svenska.",
        "Skriv ett naturligt stycke på 3–4 meningar på svenska.",
        "Skriv 2–3 meningar i ledig, vardaglig svenska.",
        "Skriv 3 meningar med rika svenska sammansatta ord och siffror/procent.",
        "Skriv 2–3 meningar med generella myndighets- eller organisationsbegrepp (t.ex. styrelsen, nämnden, förvaltningen, utskottet, kommunfullmäktige) men utan något eget namn.",
    ])
    return (
        f"Ämne: {domain} ({desc}).\n"
        f"{style}\n"
        "STRIKTA REGLER:\n"
        "1. Använd ABSOLUT INGA egennamn: inga personnamn, städer, länder, företagsnamn, varumärken, myndighetsnamn (som Skatteverket) eller gatuadresser.\n"
        "2. Använd inga telefonnummer, personnummer, e-postadresser, webbadresser eller postnummer.\n"
        "3. Använd inga stora bokstäver mitt i en mening (förutom vanliga förkortningar som IT, AI, BNP, SEK, PDF, GDPR).\n"
        "4. Svara ENDAST med själva textstycket utan inledning, rubrik eller citattecken."
    )


def build_slotted_prompt(rng: random.Random) -> str:
    domain, desc = rng.choice(DOMAINS)
    slots = rng.choice(SLOT_RECIPES)
    slot_desc = {
        "{PER1}": "ett fullständigt personnamn",
        "{PER1_GEN}": "ett fullständigt personnamn i genitiv (ägarform, t.ex. 'enligt {PER1_GEN} rapport')",
        "{PER2}": "en annan persons namn",
        "{PER_LAST}": "ett fristående efternamn (t.ex. 'enligt {PER_LAST}')",
        "{PER_LAST_GEN}": "ett fristående efternamn i genitiv (t.ex. '{PER_LAST_GEN} förslag' eller 'i {PER_LAST_GEN} nya bok')",
        "{PER_FIRST}": "ett fristående förnamn",
        "{LOC1}": "en plats, stad eller ett land",
        "{LOC2}": "en annan plats eller stad",
        "{ORG1}": "ett företag, en myndighet eller organisation",
        "{ORG2}": "en annan organisation eller företag",
        "{ADR1}": "en gatuadress",
    }
    slots_text = ", ".join(f"{s} ({slot_desc[s]})" for s in slots)
    style = rng.choice([
        "Skriv 2–4 naturliga meningar på saklig svenska.",
        "Skriv ett realistiskt mejl- eller ärendestycke på 2–4 meningar på svenska.",
        "Skriv 2–3 meningar i informell svensk chatt- eller bloggstil.",
        "Skriv 3–4 meningar i nyhets- eller rapportstil på svenska.",
    ])
    return (
        f"Ämne: {domain} ({desc}).\n"
        f"{style}\n"
        f"Inkludera EXAKT dessa platshållare naturligt i texten: {slots_text}.\n"
        "STRIKTA REGLER:\n"
        "1. Skriv platshållarna exakt med måsvingar, t.ex. {PER1}, utan att byta ut dem mot riktiga namn.\n"
        "2. Hitta INTE på några andra egennamn (inga andra personnamn, städer, länder, företag, myndigheter eller adresser).\n"
        "3. Inga telefonnummer, personnummer, e-postadresser, URL:er eller postnummer.\n"
        "4. Inga stora bokstäver mitt i en mening förutom platshållarna.\n"
        "5. Svara ENDAST med själva textstycket utan inledning, rubrik eller citattecken."
    )


def build_contrast_prompt(rng: random.Random) -> tuple[str, str, str]:
    kind = rng.choice(["homograph", "homograph", "org_vs_generic", "loc_vs_generic", "genitive_per_vs_noun"])
    if kind == "homograph":
        word, meaning = rng.choice(HOMOGRAPH_WORDS)
        start_cap = rng.random() < 0.6
        pos_hint = (
            "Låt {HOMO_WORD} stå FÖRST i meningen i NEG (med stor begynnelsebokstav)!"
            if start_cap
            else "Låt {HOMO_WORD} stå mitt i meningen i NEG (med liten bokstav)."
        )
        prompt = (
            f"Skapa ett svenskt kontrastpar om ordet \"{word}\" (som vanligt ord betyder det: {meaning}).\n"
            "Returnera EXAKT två rader:\n"
            "POS: 1–2 naturliga svenska meningar där {HOMO_PER} tydligt är en persons förnamn.\n"
            f"NEG: 1–2 naturliga svenska meningar där {{HOMO_WORD}} tydligt används som det vanliga svenska ordet ({meaning}). {pos_hint}\n"
            "STRIKTA REGLER:\n"
            "1. Använd INGA andra egennamn (inga andra personer, städer, företag eller länder) i någon av raderna.\n"
            "2. Inga stora bokstäver mitt i meningar.\n"
            "3. Skriv platshållarna exakt som {HOMO_PER} i POS och {HOMO_WORD} i NEG."
        )
        return kind, word, prompt

    if kind == "org_vs_generic":
        domain, _ = rng.choice(DOMAINS[:8])
        generic = rng.choice([
            "kommunfullmäktige", "styrelsen", "förvaltningsnämnden", "arbetsgruppen",
            "utskottet", "handläggningsavdelningen", "ledningsgruppen", "branschföreningen",
            "revisionskommittén", "fastighetskontoret", "ekonomiavdelningen", "tillsynsenheten",
        ])
        prompt = (
            f"Ämne: {domain}. Skapa ett svenskt kontrastpar där samma situation handlar om en namngiven organisation i POS och en generell instans i NEG.\n"
            "Returnera EXAKT två rader:\n"
            "POS: 2 naturliga svenska meningar med platshållaren {ORG1} som namngivet företag/myndighet.\n"
            f"NEG: 2 parallella naturliga svenska meningar där ordet \"{generic}\" (eller annan generell instans, utan egennamn) har motsvarande roll.\n"
            "STRIKTA REGLER: Inga andra egennamn i POS eller NEG. Inga stora bokstäver mitt i meningar utom {ORG1}."
        )
        return kind, generic, prompt

    if kind == "loc_vs_generic":
        domain, _ = rng.choice(DOMAINS)
        generic = rng.choice([
            "stadskärnan", "hamnområdet", "landsbygden", "skärgården",
            "grannskapet", "regionen", "kommunen", "centrum", "industriområdet",
            "bostadsområdet", "kuststräckan", "innerstaden",
        ])
        prompt = (
            f"Ämne: {domain}. Skapa ett svenskt kontrastpar mellan en namngiven plats i POS och ett generellt platsord i NEG.\n"
            "Returnera EXAKT två rader:\n"
            "POS: 2 naturliga svenska meningar med platshållaren {LOC1} som namngiven stad/plats.\n"
            f"NEG: 2 parallella naturliga svenska meningar med det generella ordet \"{generic}\" utan egennamn.\n"
            "STRIKTA REGLER: Inga andra egennamn i POS eller NEG. Inga stora bokstäver mitt i meningar utom {LOC1}."
        )
        return kind, generic, prompt

    # genitive_per_vs_noun
    domain, _ = rng.choice(DOMAINS[:10])
    generic = rng.choice([
        "utredningens", "avdelningens", "projektets", "rapportens",
        "kommitténs", "styrelsens", "forskningens", "förvaltningens",
        "arbetsgruppens", "verksamhetens",
    ])
    prompt = (
        f"Ämne: {domain}. Skapa ett svenskt kontrastpar mellan ett fristående efternamn i genitiv i POS och ett vanligt substantiv i genitiv i NEG.\n"
        "Returnera EXAKT två rader:\n"
        "POS: 2 naturliga svenska meningar med platshållaren {PER_LAST_GEN} (t.ex. 'Enligt {PER_LAST_GEN} analys...').\n"
        f"NEG: 2 parallella naturliga svenska meningar med det vanliga genitivordet \"{generic}\" utan egennamn.\n"
        "STRIKTA REGLER: Inga andra egennamn i POS eller NEG. Inga stora bokstäver mitt i meningar utom {PER_LAST_GEN}."
    )
    return kind, generic, prompt


def generate_batch(model, tokenizer, prompts: list[str], max_new_tokens: int = 190) -> list[str]:
    messages_batch = [
        [
            {
                "role": "system",
                "content": (
                    "Du är en skicklig svensk skribent som skriver helt påhittad, naturlig och "
                    "varierad svensk prosa för språkteknologisk forskning. Följ alla regler exakt."
                ),
            },
            {"role": "user", "content": p},
        ]
        for p in prompts
    ]
    texts = [
        tokenizer.apply_chat_template(m, tokenize=False, add_generation_prompt=True)
        for m in messages_batch
    ]
    enc = tokenizer(texts, return_tensors="pt", padding=True, truncation=True, max_length=768).to(
        model.device
    )
    prompt_len = enc["input_ids"].shape[1]
    with torch.no_grad():
        out = model.generate(
            **enc,
            max_new_tokens=max_new_tokens,
            do_sample=True,
            temperature=0.85,
            top_p=0.92,
            pad_token_id=tokenizer.pad_token_id,
        )
    decoded = tokenizer.batch_decode(out[:, prompt_len:], skip_special_tokens=True)
    return [d.strip() for d in decoded]


def resolve_model_plan() -> list[tuple[str, int, bool]]:
    """Return ordered list of (model_id, batch_size, load_4bit) passes to split generation across."""
    custom_batch = int(os.environ["LLM_PROSE_BATCH"]) if "LLM_PROSE_BATCH" in os.environ else None
    if MODEL_ID:
        vram_gb = (
            torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            if torch.cuda.is_available()
            else 0
        )
        return [(MODEL_ID, custom_batch or BATCH_SIZE, bool(torch.cuda.is_available() and vram_gb < 36))]
    if torch.cuda.is_available():
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        if vram_gb >= 60:
            return [
                ("mistralai/Mistral-Small-24B-Instruct-2501", custom_batch or 24, False),
                ("Qwen/Qwen2.5-14B-Instruct", custom_batch or 32, False),
            ]
        if vram_gb >= 36:
            return [
                ("mistralai/Mistral-Small-24B-Instruct-2501", custom_batch or 24, True),
                ("Qwen/Qwen2.5-14B-Instruct", custom_batch or 24, False),
            ]
        if vram_gb >= 18:
            return [
                ("mistralai/Mistral-Small-24B-Instruct-2501", custom_batch or 12, True),
                ("Qwen/Qwen2.5-14B-Instruct", custom_batch or 16, True),
            ]
        return [("Qwen/Qwen2.5-7B-Instruct", custom_batch or 12, True)]
    return [("Qwen/Qwen2.5-7B-Instruct", custom_batch or BATCH_SIZE, False)]


def run_model_pass(
    model_id: str,
    batch_size: int,
    load_4bit: bool,
    rng: random.Random,
    goal_clean: int,
    goal_slotted: int,
    goal_contrast: int,
    clean_pool: list[str],
    clean_seen: set[str],
    slotted_pool: list[str],
    slotted_seen: set[str],
    contrast_pool: list[dict],
    contrast_seen: set[str],
    record_reject,
):
    gpu_name = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu"
    mode_label = "4-bit NF4" if load_4bit else "bf16"
    print(
        f"\n== Loading {model_id} in {mode_label} on {gpu_name} (batch={batch_size}, "
        f"goals: clean={goal_clean}, slotted={goal_slotted}, contrast={goal_contrast}) ==",
        flush=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(model_id)
    tokenizer.padding_side = "left"
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token_id = tokenizer.eos_token_id
    load_kwargs = {"device_map": "auto"}
    if load_4bit and torch.cuda.is_available():
        from transformers import BitsAndBytesConfig

        load_kwargs["quantization_config"] = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.bfloat16,
        )
    else:
        load_kwargs["torch_dtype"] = torch.bfloat16 if torch.cuda.is_available() else torch.float32
    model = AutoModelForCausalLM.from_pretrained(model_id, **load_kwargs).eval()

    try:
        # 1. Clean 0-entity natural Swedish prose
        print(f"\n== [1/3] {model_id}: generating up to {goal_clean} clean paragraphs ==", flush=True)
        need_clean = max(0, goal_clean - len(clean_pool))
        max_rounds = max(20, (need_clean // max(1, batch_size)) * 3 + 10)
        for rnd in range(max_rounds):
            if len(clean_pool) >= goal_clean:
                break
            prompts = [build_clean_prompt(rng) for _ in range(batch_size)]
            outputs = generate_batch(model, tokenizer, prompts, max_new_tokens=160)
            for raw in outputs:
                text = normalize_paragraph(raw)
                if text in clean_seen:
                    continue
                ok, reason = passes_deterministic_checks(text, set(), require_slots=False)
                if ok:
                    clean_seen.add(text)
                    clean_pool.append(text)
                    if len(clean_pool) >= goal_clean:
                        break
                else:
                    record_reject(f"clean_{reason}")
            if (rnd + 1) % 10 == 0 or len(clean_pool) >= goal_clean:
                print(f"  clean: {len(clean_pool)}/{goal_clean} (round {rnd + 1})", flush=True)

        # 2. Slotted natural Swedish prose
        print(f"\n== [2/3] {model_id}: generating up to {goal_slotted} slotted paragraphs ==", flush=True)
        need_slotted = max(0, goal_slotted - len(slotted_pool))
        max_rounds = max(20, (need_slotted // max(1, batch_size)) * 3 + 10)
        for rnd in range(max_rounds):
            if len(slotted_pool) >= goal_slotted:
                break
            prompts = [build_slotted_prompt(rng) for _ in range(batch_size)]
            outputs = generate_batch(model, tokenizer, prompts, max_new_tokens=180)
            for raw in outputs:
                text = normalize_paragraph(raw)
                if text in slotted_seen:
                    continue
                ok, reason = passes_deterministic_checks(text, ALLOWED_SLOTS, require_slots=True)
                if ok:
                    slotted_seen.add(text)
                    slotted_pool.append(text)
                    if len(slotted_pool) >= goal_slotted:
                        break
                else:
                    record_reject(f"slotted_{reason}")
            if (rnd + 1) % 10 == 0 or len(slotted_pool) >= goal_slotted:
                print(f"  slotted: {len(slotted_pool)}/{goal_slotted} (round {rnd + 1})", flush=True)

        # 3. Contrast pairs
        print(f"\n== [3/3] {model_id}: generating up to {goal_contrast} contrast pairs ==", flush=True)
        need_contrast = max(0, goal_contrast - len(contrast_pool))
        max_rounds = max(20, (need_contrast // max(1, batch_size)) * 4 + 10)
        for rnd in range(max_rounds):
            if len(contrast_pool) >= goal_contrast:
                break
            specs = [build_contrast_prompt(rng) for _ in range(batch_size)]
            outputs = generate_batch(model, tokenizer, [s[2] for s in specs], max_new_tokens=220)
            for (kind, word, _), raw in zip(specs, outputs):
                m_pos = re.search(r"POS:\s*(.+?)(?=\n\s*NEG:|$)", raw, re.S)
                m_neg = re.search(r"NEG:\s*(.+)", raw, re.S)
                if not m_pos or not m_neg:
                    record_reject("contrast_format")
                    continue
                pos = normalize_paragraph(m_pos.group(1))
                neg = normalize_paragraph(m_neg.group(1))
                key = f"{pos} ||| {neg}"
                if key in contrast_seen:
                    continue
                if kind == "homograph":
                    if "{HOMO_PER}" not in pos or "{HOMO_WORD}" not in neg:
                        record_reject("contrast_homo_slot")
                        continue
                    ok_p, rp = passes_deterministic_checks(
                        pos, ALLOWED_SLOTS | {"HOMO_PER"}, require_slots=True, min_chars=28, min_words=6
                    )
                    ok_n, rn = passes_deterministic_checks(
                        neg, {"HOMO_WORD"}, require_slots=True, min_chars=28, min_words=6
                    )
                else:
                    required_slot = {
                        "org_vs_generic": "{ORG1}",
                        "loc_vs_generic": "{LOC1}",
                        "genitive_per_vs_noun": "{PER_LAST_GEN}",
                    }[kind]
                    if required_slot not in pos:
                        record_reject("contrast_missing_target_slot")
                        continue
                    ok_p, rp = passes_deterministic_checks(
                        pos, ALLOWED_SLOTS, require_slots=True, min_chars=35, min_words=8
                    )
                    ok_n, rn = passes_deterministic_checks(
                        neg, set(), require_slots=False, min_chars=35, min_words=8
                    )
                if ok_p and ok_n:
                    contrast_seen.add(key)
                    contrast_pool.append({"kind": kind, "word": word, "pos": pos, "neg": neg})
                    if len(contrast_pool) >= goal_contrast:
                        break
                else:
                    record_reject(f"contrast_{rp if not ok_p else rn}")
            if (rnd + 1) % 10 == 0 or len(contrast_pool) >= goal_contrast:
                print(f"  contrast_pairs: {len(contrast_pool)}/{goal_contrast} (round {rnd + 1})", flush=True)
    finally:
        del model
        del tokenizer
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()


def main():
    rng = random.Random(SEED)
    torch.manual_seed(SEED)
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    plan = resolve_model_plan()

    partial_path = OUT_PATH.with_suffix(".partial.json")
    clean_pool: list[str] = []
    clean_seen: set[str] = set()
    slotted_pool: list[str] = []
    slotted_seen: set[str] = set()
    contrast_pool: list[dict] = []
    contrast_seen: set[str] = set()
    reject_stats: dict[str, int] = {}
    used_models: list[str] = []

    if partial_path.is_file():
        prev = json.loads(partial_path.read_text(encoding="utf-8"))
        clean_pool = list(prev.get("clean", []))
        clean_seen = set(clean_pool)
        slotted_pool = list(prev.get("slotted", []))
        slotted_seen = set(slotted_pool)
        contrast_pool = list(prev.get("contrast_pairs", []))
        contrast_seen = {f"{p['pos']} ||| {p['neg']}" for p in contrast_pool}
        reject_stats = dict(prev.get("rejectStats", {}))
        used_models = list(prev.get("models", []))
        print(
            f"Resuming from {partial_path}: clean={len(clean_pool)}, "
            f"slotted={len(slotted_pool)}, contrast={len(contrast_pool)}, done={used_models}",
            flush=True,
        )

    def record_reject(reason: str):
        key = reason.split(":")[0]
        reject_stats[key] = reject_stats.get(key, 0) + 1

    n_models = len(plan)
    for idx, (model_id, batch_size, load_4bit) in enumerate(plan):
        if model_id in used_models:
            continue
        is_last = idx == n_models - 1
        goal_clean = TARGET_CLEAN if is_last else (TARGET_CLEAN * (idx + 1)) // n_models
        goal_slotted = TARGET_SLOTTED if is_last else (TARGET_SLOTTED * (idx + 1)) // n_models
        goal_contrast = TARGET_CONTRAST if is_last else (TARGET_CONTRAST * (idx + 1)) // n_models
        try:
            run_model_pass(
                model_id=model_id,
                batch_size=batch_size,
                load_4bit=load_4bit,
                rng=rng,
                goal_clean=goal_clean,
                goal_slotted=goal_slotted,
                goal_contrast=goal_contrast,
                clean_pool=clean_pool,
                clean_seen=clean_seen,
                slotted_pool=slotted_pool,
                slotted_seen=slotted_seen,
                contrast_pool=contrast_pool,
                contrast_seen=contrast_seen,
                record_reject=record_reject,
            )
            used_models.append(model_id)
            if not is_last:
                partial_tmp = partial_path.with_suffix(".partial.tmp")
                partial_tmp.write_text(
                    json.dumps(
                        {
                            "models": used_models,
                            "rejectStats": reject_stats,
                            "clean": clean_pool,
                            "slotted": slotted_pool,
                            "contrast_pairs": contrast_pool,
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
                os.replace(partial_tmp, partial_path)
        except Exception as exc:
            if is_last:
                raise
            print(f"[warn] {model_id} failed ({exc}); falling back to remaining model(s) for full quota.", flush=True)

    if partial_path.is_file():
        partial_path.unlink()

    # Shuffle pools deterministically so both model voices span train & val splits evenly
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
        "rejectStats": reject_stats,
        "clean": clean_pool,
        "slotted": slotted_pool,
        "contrast_pairs": contrast_pool,
    }
    tmp_path = OUT_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp_path, OUT_PATH)
    print(f"\n[done] Wrote {OUT_PATH}: {payload['counts']} using {used_models}", flush=True)
    print(f"Reject breakdown: {reject_stats}", flush=True)


if __name__ == "__main__":
    main()
