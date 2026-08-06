"""Generalisation check: run the trained model on entities NOT in the gazetteers."""
import torch
from transformers import pipeline

device = "mps" if torch.backends.mps.is_available() else "cpu"
nlp = pipeline("token-classification", model="model", tokenizer="model",
               aggregation_strategy="simple", device=device)

# Every probe is explicitly synthetic and deliberately absent from the
# training data. Do not use a real organisation, institution or plausible
# ordinary street/number pair in this diagnostic.
SENTENCES = [
    "Kontakta testpersonen Thorbjörn Provnamn i Provbyn innan fredag.",
    "Proveleven Naveed Testnamn flyttade nyligen till Testköping.",
    "Fakturan gick till Fiktiv Däckdata AB på Maskeravägen 27.",
    "Wei Exempelnamn börjar på Syntet Teknik AB i Provbyn nästa månad.",
    "Provpatienten Aigerim Testnamn skrevs in på Fiktivkliniken i Testköping.",
    "Hör av dig till testpersonen Quintus Provnamn angående testtomten i Provbyn.",
]
for s in SENTENCES:
    print("\n>", s)
    ents = nlp(s)
    if not ents:
        print("   (inga entiteter)")
    for e in ents:
        print(f"   {e['entity_group']:4} {e['word']!r:32} {e['score']:.2f}")
