# Design partners: playbook

Mål: **5 design partners, varav minst 2 betalande piloter**, innan
enterprise-features byggs. Skrivet 2026-07-10. Systerdokument:
[DATAINSAMLING.md](DATAINSAMLING.md) (samma kanaler, annat ask) och
[GUARD_API.md](GUARD_API.md) (det partners får vara med och forma).

## Varför design partners före allt annat

Tekniken finns: modellen är publicerad, benchmarken körd (se
[bench/README.md](../bench/README.md)), harnessen gate:ar varje push. Det som
saknas är bevis på att någon betalar och verklig domändata att träna mot.
En design partner ger båda. Bygg INTE self-hosted gateway, SSO, audit logs
eller central policyhantering innan en partner har bett om det med pengar.

## Vem (i prioritetsordning)

1. **AI-konsulter och systemintegratörer i Sverige.** Bygger LLM-lösningar åt
   10 kunder och vill inte uppfinna privacy-lagret 10 gånger. En bra partner
   här är värd mer än tusen anonyma npm-användare, och deras kunders
   säkerhetsansvariga är exakt de som blockerar AI-lanseringar.
2. **Svenska SaaS-bolag med supporttung produkt** som redan har ett
   LLM-projekt (sammanfattning av ärenden, autosvar, klassificering).
   Persondata förekommer naturligt, värdet är lätt att demonstrera,
   säljcykeln är rimlig.
3. **Bolag med transkriberings- eller dokumentflöden** (call centers,
   juridik-adjacenta SaaS). Bra tvåa: talspråk och OCR-fel är precis det
   register modellen ska bli bäst på.

Kommuner, regioner och vård: inte nu. Rätt marknad, fel säljcykel för ett
enmansbolag i valideringsfas.

## Erbjudandet

Partnern får:

- Fri användning under piloten (tidsbegränsad, se struktur nedan).
- **En benchmark på deras egen data**: vi kör bench-harnessen på ett
  pseudonymiserat utsnitt av deras verkliga text och redovisar precision,
  recall och läckor per entitetstyp, jämfört med Presidio och OpenAI
  Privacy Filter. Ingen annan i Norden erbjuder detta. Det är säljargumentet
  internt hos partnern: siffror på deras egen data, inte vår demo.
- Direkt inflytande över guard-API:t och policylagret (GUARD_API.md:s
  öppna frågor är i praktiken deras att besvara).
- Namngiven referens i material först när de själva godkänt det.

Vi får:

- Verkliga edge cases och (under DPA, pseudonymiserat) domändata som matar
  träningsrundorna, se DATAINSAMLING.md och ROADMAP.md "Design-partner data".
- Ett betalningsbeslut, inte bara en teknisk utvärdering.
- Regressionstester byggda på deras hard cases (kundspecifika eval-set är
  moaten, inte koden).

## Pilotstruktur (4 till 6 veckor, skriftlig från dag 1)

1. **Vecka 0, scoping:** definiera use caset (t.ex. supportärenden till
   extern LLM), vilka entiteter som är känsliga hos dem, succékriterier i
   siffror (t.ex. "leak rate under 2 procent på vårt eval-set, integration
   under en dag").
2. **Vecka 1, baseline:** de levererar 100 till 300 pseudonymiserade
   exempelmeddelanden under DPA. Vi bygger ett kundspecifikt eval-set och
   kör bench-harnessen: maskera mot deras nuvarande alternativ (ofta
   ingenting, ibland Presidio eller ett regexlager). Rapporten är
   leverabel nummer ett, oavsett om de köper.
3. **Vecka 2 till 4, integration:** de integrerar (guard-API:t när det
   finns, redactWithNer tills dess) i ett verkligt flöde, gärna bakom
   feature flag. Vi fixar det som skaver samma vecka; snabbheten ÄR
   produkten i pilotfasen.
4. **Vecka 5 till 6, mätning och beslut:** kör om eval-setet på riktig
   trafik (pseudonymiserat), skriv resultatet, ta betalbeslutet i ett
   bokat möte, inte via mejl som rinner ut.

Pilotavgift: ta betalt något även för piloten (10 till 25 tkr) när partnern
är ett bolag med intäkter. Gratis pilot åt AI-konsulter kan vara okej i
utbyte mot introduktion till två av deras slutkunder, skriftligt.

## Prishypotes att validera (inte utropa)

- Årslicens per organisation eller deployment, INTE per token: produkten
  kör lokalt, per-token-pris är fel modell och underminerar
  integritetsargumentet.
- Testnivåer: 100 till 300 tkr/år för enskilt bolag beroende på deployment
  och support; OEM/partnerlicens för konsulter som bäddar in maskera hos
  flera slutkunder prissätts per slutkund.
- Go-signalen är inte "vi gillar det", utan en kund som säger att maskera
  gör att de kan lansera en AI-funktion som annars blockerats. Det citatet
  är värt mer än pilotintäkten.

## Utskick (kort, konkret, med siffror)

Till AI-konsult/CTO, DM eller mejl:

> Hej! Jag bygger maskera (maskera.dev): svensk PII-maskering som kör helt
> lokalt i Node/webbläsare, modellen är 40 MB. Vi har precis benchmarkat
> mot Microsoft Presidio och OpenAI:s nya Privacy Filter på oberoende
> svensk text: maskera 88 procent span-F1 och 1,7 procent läckta
> entiteter, Presidio 67 procent och 33 procent läckor, OpenAI:s modell
> hittar inte svenska orter eller organisationer alls.
>
> Jag söker 5 design partners som skickar svensk kunddata till LLM:er
> (support, chatt, transkript). Ni får en benchmark på er egen data och
> direkt inflytande över API:t, jag får era edge cases. 4 till 6 veckor,
> tydliga succékriterier. Intresserad av att se siffrorna på er data?

Uppföljning om de svarar men tvekar: erbjud enbart steg 2 (baseline-
rapporten på deras data) som fristående, det är lågt åtagande och skapar
det interna underlaget hos dem.

## Formuleringar

Sälj aldrig "automatisk GDPR-compliance". Sälj: dataminimering, mätbar
detektionskvalitet på ER data, lokal behandling (texten lämnar aldrig er
process), policy enforcement, auditbarhet utan att lagra rå PII. OpenAI
skriver själva att deras filter inte garanterar anonymisering; det hålet
är vårt argument och det gäller oss också, därför siffror i stället för
löften.

## Go/no-go efter kvartalet

- Minst 3 bolag säger att de aktivt behöver problemet löst (inte "coolt").
- Minst 2 betalar (pilotavgift räknas, förlängd gratis-pilot gör det inte).
- Minst 1 ser ett möjligt årsavtal över 100 tkr.
- Minst 1 säger att maskera avblockerade en AI-lansering.
- maskera är mätbart bättre på partnerns data, eller dramatiskt enklare
  att integrera, i varje pilot vi förlorade också: dokumentera varför.

Uppfylls inte detta: skala inte upp, gå tillbaka till produkten eller ompröva
tesen. Uppfylls det: då först byggs enterprise-lagret, i den ordning
betalande partners ber om det.
