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
    text: "Kandidat: Amir Haddad, 991201-2391. Mail: amir.haddad@example.se, tel 0701740605. Nuvarande lön 48 000 kr/mån. Referens: Per Holmberg, 08-465 004 12. Bedöm CV mot rollbeskrivningen och föreslå intervjufrågor.",
  },
  {
    id: "support",
    name: "Kundsupport",
    tagline: "Supportärende som loggas",
    text: "Kund Maria Johansson hör av sig: kortet slutar fungera. Kortnummer 4111 1111 1111 1111, betalkonto IBAN SE45 5000 0000 0583 9825 7466. Ringer från 070-174 06 58. Skapa ett ärende och svara med nästa steg.",
  },
  {
    id: "vard",
    name: "Vård",
    tagline: "Journalanteckning till AI-assistent",
    text: "Patient Anna Karlsson, 850601-2387, inkom 14:20 med bröstsmärta. Bor på Sankt Eriksgatan 12B, Stockholm. Anhörig (maken Lars Eriksson) nås på 070-174 06 71. Sätt in EKG-svar i journalen och maila sammanfattning till anna.karlsson@example.se.",
  },
  {
    id: "juridik",
    name: "Juridik",
    tagline: "Klientärende på advokatbyrå",
    text: "Klient Johan Andersson (781101-2397) yrkar skadestånd mot Byggfirman AB, org.nr 556677-2348. Motpart företräds av advokat Leila Ahmadi. Betalning sker till bankgiro 5051-6905. Sammanfatta ärendet inför förhandlingen den 12 mars.",
  },
  {
    id: "kommun",
    name: "Kommun",
    tagline: "Biståndsansökan",
    text: "Ansökan om försörjningsstöd: Jonas Wikström, 020301-2398, boende på Björkvägen 21, 112 23 Stockholm. Sökande når oss på jonas.wikstrom@example.se. Sambo Elin Bergman är arbetssökande. Sammanfatta ärendet för handläggare.",
  },
  {
    id: "fritext",
    name: "Fri text",
    tagline: "",
    text: "",
  },
]
