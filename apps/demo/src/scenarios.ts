export interface Scenario {
  id: string
  name: string
  tagline: string
  text: string
}

export const scenarios: Scenario[] = [
  {
    id: "hr",
    name: "HR",
    tagline: "Kandidat-screening med AI",
    text: "Kandidat: Sara Lindgren, 991208-2105. Mail: sara.lindgren@example.se, tel 0701234567. Nuvarande lön 48 000 kr/mån. Referens: Per Holmberg, 08-555 000. Bedöm CV mot rollbeskrivningen och föreslå intervjufrågor.",
  },
  {
    id: "support",
    name: "Kundsupport",
    tagline: "Supportärende som loggas",
    text: "Kund Maria Johansson hör av sig: kortet slutar fungera. Kortnummer 4571 2300 1234 5678, betalkonto IBAN SE45 5000 0000 0583 9825 7466. Ringer från 070-222 33 44. Skapa ett ärende och svara med nästa steg.",
  },
  {
    id: "vard",
    name: "Vård",
    tagline: "Journalanteckning till AI-assistent",
    text: "Patient Anna Karlsson, 850623-1235, inkom 14:20 med bröstsmärta. Bor på Sankt Eriksgatan 12B, Stockholm. Anhörig (maken Lars Eriksson) nås på 070-123 45 67. Sätt in EKG-svar i journalen och maila sammanfattning till anna.karlsson@example.se.",
  },
  {
    id: "juridik",
    name: "Juridik",
    tagline: "Klientärende på advokatbyrå",
    text: "Klient Johan Andersson (781130-4562) yrkar skadestånd mot Byggfirman AB, org.nr 556677-2348. Motpart företräds av Maria Nilsson. Betalning sker till bankgiro 5051-6905. Sammanfatta ärendet inför förhandlingen den 12 mars.",
  },
  {
    id: "kommun",
    name: "Kommun",
    tagline: "Biståndsansökan",
    text: "Ansökan om försörjningsstöd: Ahmed Hassan, 020314-0785, boende på Björkvägen 21, 112 23 Stockholm. Sökande når oss på ahmed.hassan@example.se. Sambo Fatima Al-Rashid är arbetssökande. Sammanfatta ärendet för handläggare.",
  },
  {
    id: "fritext",
    name: "Fri text",
    tagline: "",
    text: "",
  },
]
