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
    text: "Kandidat: Sara Lindgren, 991201-2391. Mail: sara.lindgren@example.com, tel 0701740605. Nuvarande lön 48 000 kr/mån. Referens: Per Holmberg, 08-465 004 12. Bedöm CV mot rollbeskrivningen och föreslå intervjufrågor.",
  },
  {
    id: "support",
    name: "Kundsupport",
    tagline: "Supportärende som loggas",
    text: "Kund Amir Haddad hör av sig: kortet slutar fungera. Kortnummer 4242 4242 4242 4242, betalkonto IBAN SE42 8000 0890 1191 4616 8423. Ringer från 070-174 06 58. Skapa ett ärende och svara med nästa steg.",
  },
  {
    id: "vard",
    name: "Vård",
    tagline: "Journalanteckning till AI-assistent",
    text: "Patient Anna Karlsson, 850601-2387, inkom 14:20 med bröstsmärta. Bor på Påhittsgatan 12B, Stockholm. Anhörig (maken Lars Eriksson) nås på 070-174 06 71. Sätt in EKG-svar i journalen och maila sammanfattning till anna.karlsson@example.com.",
  },
  {
    id: "juridik",
    name: "Juridik",
    tagline: "Klientärende på advokatbyrå",
    text: "Klient Johan Andersson (781101-2397) yrkar skadestånd mot Kommun A, org.nr 202100-4748. Motpart företräds av advokat Leila Ahmadi. Betalning sker till bankgiro 991-2346. Sammanfatta ärendet inför förhandlingen den 12 mars.",
  },
  {
    id: "kommun",
    name: "Kommun",
    tagline: "Biståndsansökan",
    text: "Ansökan om försörjningsstöd: Jonas Wikström, 020301-2398, boende på Påhittsvägen 21, 123 45 Stockholm. Sökande når oss på jonas.wikstrom@example.com. Sambo Elin Bergman är arbetssökande. Sammanfatta ärendet för handläggare.",
  },
  {
    id: "fritext",
    name: "Egen text",
    tagline: "",
    text: "",
  },
]
