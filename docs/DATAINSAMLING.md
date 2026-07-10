# Datainsamling: riktiga supportmeddelanden (tränings- och gulddata)

Målet: **300-500 realistiska svenska support-/chattmeddelanden med påhittad
PII** till träning, plus (separat, andra skribenter) ~100 till det oberoende
guld-setet enligt [GOLD_SET_PLAN.md](GOLD_SET_PLAN.md). Detta dokument är
utskickspaketet: vem du kontaktar, i vilken ordning, och färdiga texter att
skicka.

## Järnregeln först

**Tränings- och gulddata får aldrig komma från samma personer eller samma
batch.** Guld-setet mäter modellen; om samma skribents stil finns i träningen
är mätningen förgiftad. Bestäm per person INNAN de skriver: antingen
träningsdonator eller guldskribent, aldrig båda. För guldskribenter gäller
briefen i [GOLD_SET_STAGE2_PROMPTS.md](GOLD_SET_STAGE2_PROMPTS.md); det här
dokumentet rekryterar främst träningsdonatorer.

## Kanaler, i den ordning jag skulle köra dem

### 1. Eget nätverk (gratis, starta idag)

Vänner, kollegor, familj, tidigare kollegor. 10 personer x 30-50 meddelanden
räcker för hela träningsbatchen. Belöning: fika, biobiljett eller bara
tacksamhet + "du står i tacklistan".

Skicka (DM/SMS/mejl):

> Hej! Jag bygger ett verktyg som maskerar personuppgifter i svensk text
> innan den skickas till AI-tjänster (maskera.dev). Modellen behöver träna
> på hur folk FAKTISKT skriver i chattar och supportmejl, och sån data går
> inte att köpa eller skrapa lagligt.
>
> Skulle du kunna skriva 30-50 korta låtsasmeddelanden? Typ "hej jag heter
> nadia och min beställning till storgatan 5 har inte kommit". Allt ska vara
> påhittat (inga riktiga personer), slarvigt skrivet är ett plus, och det
> tar kanske 45 minuter. Jag skickar en enkel instruktion. Bjuder på
> [fika/bio] som tack!

### 2. LinkedIn-post (räckvidd, samma dag)

Du postar redan om projektet; en öppen call ger både donatorer och
potentiella designpartners. Utkast (spara i `docs/LINKEDIN_POST_*.md`, den
är gitignorad med flit):

> Jag behöver din hjälp, 45 minuter för svensk AI-integritet.
>
> maskera är en öppen svensk PII-maskering som kör helt lokalt, modellen är
> 40 MB och slår 500 MB-modellerna på svenska. Men den tränas på syntetisk
> text och nyhetsspråk, för riktiga supportmeddelanden går inte att skrapa
> lagligt. Så jag frågar er i stället.
>
> Skriv 20-50 påhittade support-/chattmeddelanden (påhittade namn, adresser,
> ärenden, gärna slarvigt skrivna som man faktiskt skriver) och mejla dem
> till mig. Allt blir öppen träningsdata, inga riktiga personuppgifter
> någonsin. Instruktion i kommentaren. Dela gärna!

### 3. Betald crowd (snabbast till volym, liten budget)

**Prolific** (prolific.com) kan filtrera deltagare på svenska som modersmål
och Sverige som land. Studieupplägg:

- Uppgift: "Skriv 10 realistiska men helt påhittade svenska
  support-/chattmeddelanden enligt instruktionen" (klistra in donatorsbriefen
  nedan i studien).
- Ersättning: ~9 pund/timme minimum; 10 meddelanden ≈ 15 min ≈ ~2.5 pund
  per deltagare. 40 deltagare ≈ 400 meddelanden för runt 1 500 kr inklusive
  avgifter.
- Kvalitetsgrind: avvisa svar med uppenbart verkliga personer, engelska
  eller LLM-genererad perfekt svenska (be om vardagligt språk och stavfel).
- Alternativ: Upwork/Fiverr, 2-3 svenska skribenter för fastpris.

### 4. Designpartner med riktig supporttrafik (störst värde, mest friktion)

Små svenska SaaS-/e-handelsbolag där du känner någon, eller där du kan nå
supportchefen. Erbjudandet: de får gratis hjälp att införa maskering av sin
supportdata mot AI-verktyg; du får pseudonymiserade eller omskrivna exempel
under avtal. Mejl:

> Hej [namn],
>
> jag bygger maskera (maskera.dev), ett open source-verktyg som maskerar
> personuppgifter i svensk text lokalt, innan texten når t.ex. OpenAI. Vi
> används för att GDPR-säkra AI-flöden i supportmiljöer.
>
> Jag söker 1-2 designpartners med svensk supporttrafik. Ni får: gratis
> integrationshjälp, en modell som blir bättre på exakt er texttyp, och
> möjlighet att påverka roadmapen. Jag får: 100-200 supportmeddelanden i
> pseudonymiserad eller omskriven form (personal skriver om riktiga ärenden
> med påhittade uppgifter, originalen lämnar aldrig er miljö), under
> sekretess-/personuppgiftsbiträdesavtal om ni vill.
>
> 20 minuters samtal någon dag nästa vecka?

Viktigt vid riktig trafik: enklaste juridiskt hållbara vägen är att DERAS
personal skriver om ärenden med påhittad PII (då är det aldrig
personuppgifter som lämnar bolaget). Direkta utdrag kräver DPA och intern
förankring; ta det bara om de erbjuder det.

## Donatorsbrief (skicka till varje träningsdonator)

> Tack för att du hjälper till! Skriv **20-50 korta meddelanden** som om du
> skrev till ett företags kundtjänst, i en chatt eller ett mejl.
>
> - **Skriv som du faktiskt skriver**: gemener, slarv, stavfel, inga
>   perfekta meningar. "hej min faktura kom inte, jag heter sara persson och
>   bor på västergatan 12" är perfekt.
> - **Allt ska vara påhittat.** Aldrig riktiga personer (inte du själv, inga
>   kändisar, ingen du känner). Riktiga gatunamn är okej med påhittat nummer;
>   riktiga städer och kända företag (ICA, Klarna, Telia) är okej.
> - **Blanda namnursprung brett**: svenska, arabiska, somaliska, finska,
>   polska, vietnamesiska, spanska... inte bara Anna och Lars.
> - **Blanda ärenden**: leverans, faktura, tidsbokning, reklamation,
>   uppsägning, lösenordsstrul, vårdbokning, försäkringsärende.
> - **Var tredje meddelande ungefär: inga personuppgifter alls** ("tack då
>   väntar jag", "hur lång är returtiden?"). Det behövs också.
> - Hör ihop flera meddelanden (en konversation)? Markera det, t.ex.
>   "ärende 3, meddelande 2".
>
> Mejla som vanlig text, en rad per meddelande. Tack!

## När datan kommer in

1. Samla per donator i en fil, en rad per meddelande.
2. Annotera spans i JSONL-formatet i
   [`training/domain-data.example.jsonl`](../training/domain-data.example.jsonl)
   (modellassisterat: kör modellen först, rätta för hand, det går 5-10x
   fortare). Sätt `group` till ärende-/donator-id så konversationer håller
   ihop över train/dev-gränsen.
3. `node training/convert_domain_jsonl.mjs` validerar offsets, dubletter och
   train/dev-split; `node training/audit_data.mjs` är grinden.
4. Guldbatchen (ANDRA skribenter) går i stället till
   `packages/ner/eval/corpus-stage2.mjs` enligt
   [GOLD_SET_STAGE2_PROMPTS.md](GOLD_SET_STAGE2_PROMPTS.md) och får ALDRIG
   röra träningskonverterarna.

## Juridiken i en mening per fall

- **Påhittad PII (donationer, crowd):** inga personuppgifter, ingen
  GDPR-fråga; datan kan publiceras öppet.
- **Omskrivna ärenden hos partner:** originalen stannar hos partnern, det
  omskrivna innehåller inga riktiga uppgifter; sekretessavtal räcker oftast.
- **Riktiga utdrag:** kräver DPA, laglig grund och att korpusen hålls
  privat; se `training/README.md` ("Getting the real target-domain data")
  och håll metadata utanför texten.
