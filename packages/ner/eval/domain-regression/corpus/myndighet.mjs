/**
 * Privacy-safe synthetic domain regression corpus.
 *
 * Structured values come from the authority/owner-published fixtures listed in
 * docs/TEST_DATA.md; addresses use conspicuous synthetic markers. The prose is
 * author-composed and was never sourced from customer, patient or case records.
 */

export default [
  {
    id: "myndighet-01",
    kategori: "myndighet",
    text: "Hej, jag skickar härmed läkarintyget som ni bad om i ärende FK-2024/11833. Mitt personnummer är 991201-2391 och jag heter Elsa Lindqvist. Ni når mig enklast på 0701740626 efter klockan tre.",
    forvantad: ["991201-2391", "Elsa Lindqvist", "0701740626"],
  },
  {
    id: "myndighet-02",
    kategori: "myndighet",
    text: "Angående er komplettering av den 12 april: jag har bott på Påhittsgatan 18 i Örebro sedan mars, och min arbetsgivare är fortfarande samma. Personnummer 900101-2385. Vänligen bekräfta att ni tagit emot detta.",
    forvantad: ["Påhittsgatan 18", "900101-2385"],
  },
  {
    id: "myndighet-03",
    kategori: "myndighet",
    text: "Till handläggare Gunnar Eklund på Försäkringskassan. Jag, Maja Söderström, pnr 000101-9801, överklagar beslutet om avslag på sjukpenning. Min sjuksköterska heter Birgitta Holm och kan intyga att jag inte klarar mer än halvtid. Jag bor på Provdatagatan 5B och min mail är person74@example.com.",
    forvantad: [
      "Gunnar Eklund",
      "Maja Söderström",
      "000101-9801",
      "Birgitta Holm",
      "Provdatagatan 5B",
      "person74@example.com",
    ],
  },
  {
    id: "myndighet-04",
    kategori: "myndighet",
    text: "hej a-kassan! jag heter tim pettersson och har precis blivit arbetslös, vill anmäla mig. mitt pnr är 640823-3234, bor på maskeragatan 12 lgh 1403. ring gärna 070-1740628, svarar nästan alltid",
    forvantad: ["tim pettersson", "640823-3234", "maskeragatan 12", "070-1740628"],
  },
  {
    id: "myndighet-05",
    kategori: "myndighet",
    text: "Skatteverket, jag undrar om min skatteåterbäring. Jag heter Roland Bergström, personnummer 781101-2397, och deklarerade i mars. Kontaktuppgifter: person75@example.com eller 070-174 06 29.",
    forvantad: ["Roland Bergström", "781101-2397", "person75@example.com", "070-174 06 29"],
  },
  {
    id: "myndighet-06",
    kategori: "myndighet",
    text: "Ärende: utvisning till Algeriet. Jag, Fatima Nasser, född 1992-08-30 med personnummer 850601-2387, överklagar Migrationsverkets beslut. Min make Omar Nasser (pnr 850623-2381) är sjuk och kan inte lämna landet. Vi bor på Testkorpusvägen 4 och vår advokat heter Lisa Åkerman.",
    forvantad: [
      "Fatima Nasser",
      "850601-2387",
      "Omar Nasser",
      "850623-2381",
      "Testkorpusvägen 4",
      "Lisa Åkerman",
    ],
  },
  {
    id: "myndighet-07",
    kategori: "myndighet",
    text: "Hej! Det är Kerstin från ärendet om föräldrapenningtillägg. Mitt pnr är 900101-2385. Jag undrar bara om kompletteringen jag mailade i tisdags kommit fram till rätt handläggare?",
    forvantad: ["Kerstin", "900101-2385"],
  },
  {
    id: "myndighet-08",
    kategori: "myndighet",
    text: "Angående er avstämning: min nya adress är Påhittsgatan 27, uppg C. Jag, Viktor Sandell, personnummer 991201-2391, bytte jobb i februari och det syns kanske inte hos er än. Nås på person76@example.com.",
    forvantad: ["Påhittsgatan 27", "Viktor Sandell", "991201-2391", "person76@example.com"],
  },
  {
    id: "myndighet-09",
    kategori: "myndighet",
    text: "till försäkringskassan. jag fattar inte er uträkning av min sjukpenning. jag är anneli nordin, 781101-2397, och har varit sjukskriven på heltid sen november. min läkare anders forsell skrev ju att jag inte kan jobba alls. ring mig 070 174 06 31.",
    forvantad: ["anneli nordin", "781101-2397", "anders forsell", "070 174 06 31"],
  },
  {
    id: "myndighet-10",
    kategori: "myndighet",
    text: "Migrationsverket, jag heter Danilo Petkovic och mitt personnummer är 000101-9801. Jag skickar härmed anställningsintyget ni begärde i ärendet. Min telefon 070-1740632 och adressen är Provdatagatan 9.",
    forvantad: ["Danilo Petkovic", "000101-9801", "070-1740632", "Provdatagatan 9"],
  },
  {
    id: "myndighet-11",
    kategori: "myndighet",
    text: "Skatteverket! Jag och min fru, Margareta Lind (640823-3234), har flyttat isär och jag undrar hur vi gör med folkbokföringen. Jag heter Per-Olof Lind och stannar kvar på Maskeravägen 3, min mail person77@example.com.",
    forvantad: [
      "Margareta Lind",
      "640823-3234",
      "Per-Olof Lind",
      "Maskeravägen 3",
      "person77@example.com",
    ],
  },
  {
    id: "myndighet-12",
    kategori: "myndighet",
    text: "Hej, det gäller min ansökan om bostadsbidrag. Jag heter Yara Abdi, pnr 781101-2397, och min handläggare Tomas Wik sa att en bilaga saknades. Här kommer hyreskontraktet. Adress: Testkorpusväg 14. Telefon: 070-174 06 33.",
    forvantad: ["Yara Abdi", "781101-2397", "Tomas Wik", "Testkorpusväg 14", "070-174 06 33"],
  },
  {
    id: "myndighet-13",
    kategori: "myndighet",
    text: "hej hej, ulf granath här. mitt ärende om underhållsstöd, pnr 850601-2387. kan ni kolla varför utbetalningen uteblivit? jag bor på påhittsgatan 8 och mailar från person78@example.com om ni vill svara skriftligt istället",
    forvantad: ["ulf granath", "850601-2387", "påhittsgatan 8", "person78@example.com"],
  },
  {
    id: "myndighet-14",
    kategori: "myndighet",
    text: "Överklagan gällande beslut den 3 maj. Jag, Hanna Ekström, personnummer 850623-2381, bestrider Skatteverkets bedömning av min reseavdragsrätt. Min revisor Kristina Palm har sammanställt underlaget. Kontakt: person79@example.com, telefon 0701740634.",
    forvantad: [
      "Hanna Ekström",
      "850623-2381",
      "Kristina Palm",
      "person79@example.com",
      "0701740634",
    ],
  },
  {
    id: "myndighet-15",
    kategori: "myndighet",
    text: "A-kassan: jag ska på semester i tre veckor och kan inte vara till arbetsmarknadens förfogande då, måste jag anmäla det? Heter Stefan Börjesson, 900101-2385. Sms:a gärna 070 174 06 35.",
    forvantad: ["Stefan Börjesson", "900101-2385", "070 174 06 35"],
  },
  {
    id: "myndighet-16",
    kategori: "myndighet",
    text: "Till Migrationsverket. Min son Ali Hassan (991201-2391) ska flytta hit enligt anhöriginvandringen. Jag heter Nadja Hassan och bor på Provdatagatan 21 lgh 2. Vår ombudsperson Sara Nilsson hjälper oss med blankett 260011.",
    forvantad: ["Ali Hassan", "991201-2391", "Nadja Hassan", "Provdatagatan 21", "Sara Nilsson"],
  },
  {
    id: "myndighet-17",
    kategori: "myndighet",
    text: "komplettering till vab-ärendet. jag är sara-maria johansson, pnr 850623-2381. barnets läkare heter rickard lundell på vårdcentralen och intyget är bifogat. min mail: person80@example.com",
    forvantad: ["sara-maria johansson", "850623-2381", "rickard lundell", "person80@example.com"],
  },
  {
    id: "myndighet-18",
    kategori: "myndighet",
    text: "Hej, jag heter Magnus Wallin och har personnummer 000101-9801. Jag ansökte om sjukersättning i januari men har inte hört något. Adressen är Maskeravägen 6 och mitt telefonnummer är 070-174 06 37. Min dotter Elin Wallin kan också svara åt mig om jag inte är hemma.",
    forvantad: ["Magnus Wallin", "000101-9801", "Maskeravägen 6", "070-174 06 37", "Elin Wallin"],
  },
  {
    id: "myndighet-19",
    kategori: "myndighet",
    text: "Skatteverket ang bankkonto för skatteåterbäring: jag bytte bank i maj och vill att utbetalningen går till mitt nya konto. Jag heter Desirée Fält, personnummer 640823-3234, adress Testkorpusbacken 2, och nås på person81@example.com eller 0701740638.",
    forvantad: [
      "Desirée Fält",
      "640823-3234",
      "Testkorpusbacken 2",
      "person81@example.com",
      "0701740638",
    ],
  },
  {
    id: "myndighet-20",
    kategori: "myndighet",
    text: "ärende ang asyl. jag mohammad rahimi pratar lite dålig svenska förlåt. mitt personnummer är 781101-2397 och jag bor på påhittsgatan 15. tolk på dari behövs vid samtalet, boka gärna till farhad karimi som hjälpt mig förut.",
    forvantad: ["mohammad rahimi", "781101-2397", "påhittsgatan 15", "farhad karimi"],
  },
]
