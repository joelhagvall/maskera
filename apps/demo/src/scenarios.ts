export interface Scenario {
  id: string
  icon: string
  name: string
  tagline: string
  text: string
}

export const scenarios: Scenario[] = [
  {
    id: "vard",
    icon: "🏥",
    name: "Vård",
    tagline: "Journalanteckning till AI-assistent",
    text: "Patient Anna Karlsson, 850623-1235, inkom 14:20 med bröstsmärta. Bor på Sankt Eriksgatan 12B, Stockholm. Anhörig (maken Lars Eriksson) nås på 070-123 45 67. Sätt in EKG-svar i journalen och maila sammanfattning till anna.karlsson@example.se.",
  },
  {
    id: "juridik",
    icon: "⚖️",
    name: "Juridik",
    tagline: "Klientärende på advokatbyrå",
    text: "Klient Johan Andersson (781130-4562) yrkar skadestånd mot Byggfirman AB, org.nr 556677-2348. Motpart företräds av Maria Nilsson. Betalning sker till bankgiro 5051-6905. Sammanfatta ärendet inför förhandlingen den 12 mars.",
  },
  {
    id: "brf",
    icon: "🏢",
    name: "BRF & Fastighet",
    tagline: "Felanmälan från medlem",
    text: "Hej, jag heter Erik Persson och bor i lgh 1203 på Storvägen 3. Det läcker vatten i taket. Ni når mig på 073-987 65 43 eller erik.persson@example.se. Min granne Sara Lindberg i lägenhet 1204 har samma problem.",
  },
  {
    id: "kris",
    icon: "🆘",
    name: "Krisberedskap",
    tagline: "Behovsrapport till trygghetspunkt",
    text: "Rapport från trygghetspunkt: Astrid Berg, 660905-3217, på Solgränd 7 behöver insulin inom 6 timmar. Hennes son Nils Berg (070-555 12 34) är på väg. Familjen Hassan Al-Rashid i lgh 402 saknar dricksvatten.",
  },
  {
    id: "hr",
    icon: "💼",
    name: "HR & Rekrytering",
    tagline: "Kandidat-screening med AI",
    text: "Kandidat: Sara Lindgren, 991208-2105. Mail: sara.lindgren@example.se, tel 0701234567. Nuvarande lön 48 000 kr/mån. Referens: Per Holmberg, 08-555 000. Bedöm CV mot rollbeskrivningen och föreslå intervjufrågor.",
  },
  {
    id: "support",
    icon: "🎧",
    name: "Kundsupport",
    tagline: "Supportärende som loggas",
    text: "Kund Maria Johansson hör av sig: kortet slutar fungera. Kortnummer 4571 2300 1234 5678, betalkonto IBAN SE45 5000 0000 0583 9825 7466. Ringer från 070-222 33 44. Skapa ett ärende och svara med nästa steg.",
  },
  {
    id: "kommun",
    icon: "🏛️",
    name: "Kommun & Socialtjänst",
    tagline: "Biståndsansökan",
    text: "Ansökan om försörjningsstöd: Ahmed Hassan, 020314-0785, boende på Björkvägen 21, 112 23 Stockholm. Sökande når oss på ahmed.hassan@example.se. Sambo Fatima Al-Rashid är arbetssökande. Sammanfatta ärendet för handläggare.",
  },
  {
    id: "forsakring",
    icon: "🛡️",
    name: "Försäkring",
    tagline: "Skadeanmälan bil",
    text: "Skadeanmälan: försäkringstagare Björn Sandberg, 781130-4562. Bil med reg.nr ABC 12A skadad på parkering. Verkstad: org.nr 769603-4185. Ersättning till plusgiro 90 1234-5. Kontakt: bjorn.sandberg@example.se, 070-444 55 66.",
  },
  {
    id: "bank",
    icon: "🏦",
    name: "Bank & Finans",
    tagline: "KYC-granskning",
    text: "Ny kund: Gustav Öberg, 850623-1235, bosatt på Hamngatan 9. Överföring på 250 000 kr till IBAN SE35 5000 0000 0549 1000 0003. Kortnummer 5500 0055 5555 5559. Bedöm risk och flagga om något avviker.",
  },
  {
    id: "skola",
    icon: "🎓",
    name: "Skola",
    tagline: "Elevärende till AI-stöd",
    text: "Elev Elsa Lindqvist, 020314-0785, i klass 8B har hög frånvaro. Vårdnadshavare Anders Lindqvist nås på 070-777 88 99 och anders.lindqvist@example.se. Familjen bor på Skolvägen 4. Föreslå en åtgärdsplan.",
  },
]
