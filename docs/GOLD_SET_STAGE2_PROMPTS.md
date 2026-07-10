# Stage 2 gold set: brief for writers

> Send this file (or just the parts below the line) to each of your 3-5 writers.
> It implements stage 2 of [GOLD_SET_PLAN.md](GOLD_SET_PLAN.md): a
> support/chat-register independent gold set, written by others, with invented
> but realistic personal data. **Do not** show writers the training-data
> generator's templates or `corpus.mjs`, only the scenario prompts below. That
> is what keeps the set independent.

## Why this exists (for you, not the writers)

Our biggest measurement gap: every large number we have is either our own
writing style (curated corpus) or the news domain the model trained on (Swedish
NER Corpus). We have **no** independent number for the register that matters
most in production: real people typing support/chat messages, lowercase, with
typos, in the first person. This set fills that, legally, because the PII is
invented, not scraped.

## After collection (your job)

1. Paste each writer's sentences into `packages/ner/eval/corpus-stage2.mjs`
   (copy it from `corpus-stage2.template.mjs`; the `.mjs` is gitignored).
2. Annotate every PERSON / LOCATION / ORGANIZATION span by exact substring,
   **before** running the model (so gold isn't anchored to model output).
3. Grade with the existing harness, no code change:
   ```bash
   CORPUS_FILE="./corpus-stage2.mjs" \
   MASKERA_MODEL_PATH="$PWD/apps/demo/public/models" MASKERA_MODEL=maskera-sv-ner-v11 \
   MASKERA_F1_FLOOR=0 MASKERA_LEAK_CEIL=1 \
   node packages/ner/eval/run-eval.mjs
   ```
4. Report it as its own register row in `docs/BENCHMARKS.md` (never blended
   into one average, per the plan), and once ~200 sentences exist across
   writers, retire the 22-sentence Wikipedia set into it.

---

## Brief for writers

Tack för att du hjälper till. Vi bygger ett testunderlag för ett svenskt
verktyg som hittar personuppgifter i text. Vi behöver **20-30 korta,
realistiska meddelanden** från dig.

### Vad du ska skriva

Skriv som en riktig person skriver i en chatt, ett supportmejl eller en
SMS-konversation. Alltså:

- **Gemener och slarv är bra.** Skriv "hej jag heter anna" hellre än perfekt
  svenska. Hoppa över kommatecken. Gör naturliga stavfel. Det är precis den
  sortens text vi vill mäta på.
- **Första person, vardagligt.** "hörru kan du kolla mitt ärende", inte
  encyklopedisk prosa.
- **Blanda längder.** Några enradiga, några på 2-3 meningar.

### Den viktigaste regeln: hitta INTE på riktiga personer

Alla namn, personer och detaljer ska vara **påhittade men rimliga**. Aldrig en
verklig persons uppgifter, inte din egen, inte en kändis, ingen du känner.

- **Namn:** hitta på för- och efternamn. **Blanda ursprung brett**, inte bara
  svenska namn: svenska, arabiska, kurdiska, somaliska, finska, polska,
  spanska, vietnamesiska, engelska osv. (Verktyget är svagare på ovanligare
  namn i gemener, så just den blandningen är det vi behöver mäta.)
- **Gator:** använd gärna riktiga gatunamn men **påhittade nummer**
  (t.ex. "Storgatan 148"). Orter och stadsdelar får vara riktiga.
- **Företag/organisationer:** blanda kända (ICA, Klarna, Skatteverket) med
  påhittade ("Nordvik Bygg AB").
- **Siffror (personnummer, telefon, kontonummer):** ta med dem ibland som
  naturlig utfyllnad, men **hitta på dem** (t.ex. personnummer
  "19xx-serien" med uppenbart påhittade siffror). De ska se rimliga ut men
  inte tillhöra någon.

### Skriv om varierade situationer

Välj fritt bland scenarierna nedan, eller hitta på egna i samma anda. Sikta på
att täcka flera olika, inte 30 varianter av samma.

**Support och kundtjänst**
1. Du klagar argt på en försenad leverans och uppger namn och adress.
2. Du vill boka om en tid och nämner en handläggare vid namn.
3. Du har inte fått din faktura och undrar varför, nämner ditt ärendenummer.
4. Du byter adress och ber dem uppdatera dina uppgifter.
5. Du frågar en namngiven person på supporten om ditt gamla ärende.

**Vård och omsorg (vardagligt, inte journaltext)**
6. Du bokar av ett läkarbesök åt en anhörig och nämner båda vid namn.
7. Du frågar var din remiss tog vägen, nämner vilken vårdcentral.
8. Du beskriver att en släkting lagts in på ett namngivet sjukhus i en stad.

**Myndighet och kommun**
9. Du överklagar ett beslut och nämner handläggarens namn och ditt ärende.
10. Du frågar kommunen om en bygglovsansökan på en viss adress.
11. Du anmäler flytt till en ny ort och ber om hjälp.

**Vardag, jobb, skola**
12. Du sms:ar en granne om ett paket och nämner er båda vid namn.
13. Du mejlar en lärare om ditt barns frånvaro, nämner barnets namn och skola.
14. Du tipsar en vän om ett jobb på ett namngivet företag i en stad.
15. Du bokar en hantverkare och ger namn, adress och när du är hemma.

**Blandat / svåra fall (ta gärna med några)**
16. Ett meddelande **helt utan** personuppgifter (t.ex. "tack, då väntar jag").
    Vi behöver såna också, för att mäta falsklarm.
17. Ett meddelande där ett vanligt ord råkar likna ett namn eller företag
    ("jag ringde stadium... alltså gymmet, inte butiken").
18. Ett meddelande med ett utländskt namn skrivet i gemener
    ("hej det är mohammed igen, hörde du av dig till fatima?").

### Vad du lämnar tillbaka

En enkel lista, en rad per meddelande. Ingen märkning behövs, det gör vi. Bara
råtexten, gärna numrerad. 20-30 rader räcker fint. Tack!
