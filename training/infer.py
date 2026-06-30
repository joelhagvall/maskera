"""Generalisation check: run the trained model on entities NOT in the gazetteers."""
import torch
from transformers import pipeline

device = "mps" if torch.backends.mps.is_available() else "cpu"
nlp = pipeline("token-classification", model="model", tokenizer="model",
               aggregation_strategy="simple", device=device)

# Every name/place/org/street below is deliberately absent from the training data.
SENTENCES = [
    "Kontakta Thorbjörn Fägerquist på Bromma innan fredag.",
    "Eleven Naveed Chowdhury flyttade nyligen till Robertsfors.",
    "Fakturan gick till Däckcentralen Norrtälje AB på Pilspetsvägen 27.",
    "Wei Zhang börjar på Northvolt i Skellefteå nästa månad.",
    "Patienten Aigerim Bekova skrevs in på Sahlgrenska i Mölndal.",
    "Hör av dig till Quintus Adlersparre angående tomten i Hjärnarp.",
]
for s in SENTENCES:
    print("\n>", s)
    ents = nlp(s)
    if not ents:
        print("   (inga entiteter)")
    for e in ents:
        print(f"   {e['entity_group']:4} {e['word']!r:32} {e['score']:.2f}")
