/**
 * Privacy-safe synthetic domain regression corpus.
 *
 * Structured values come from the authority/owner-published fixtures listed in
 * docs/TEST_DATA.md; addresses use conspicuous synthetic markers. The prose is
 * author-composed and was never sourced from customer, patient or case records.
 */

export default [
  {
    id: "bank-forsakring-01",
    kategori: "bank-forsakring",
    text: "hej, mitt kort spärrades igår kväll när jag försökte betala på ica. heter Lisa Andersson, personnummer 640823-3234. kan ni öppna det igen? mitt telnr är 070-1740627",
    forvantad: ["Lisa Andersson", "640823-3234", "070-1740627"],
  },
  {
    id: "bank-forsakring-02",
    kategori: "bank-forsakring",
    text: "Ärende gäller skadeanmälan efter vattenskada i badrummet. Kund Karl-Erik Nilsson, 781101-2397, bor på Maskeravägen 14 i Örnsköldsvik. Läckaget upptäcktes i söndags och golvet har börjat svikta. Han nås på 031-390 06 28 eller person20@example.com.",
    forvantad: [
      "Karl-Erik Nilsson",
      "781101-2397",
      "Maskeravägen 14",
      "031-390 06 28",
      "person20@example.com",
    ],
  },
  {
    id: "bank-forsakring-03",
    kategori: "bank-forsakring",
    text: "Jag, Anna-Karin Sjöberg, vill anmäla en bilolycka som inträffade på E4 utanför Umeå. Motparten hette Tommy Lundin och hans telefonnummer är 0701740629. Mitt eget är 070 174 06 30. Skadeanmälan ska kopplas till mitt försäkringsbolag och mitt personnummer är 850601-2387.",
    forvantad: ["Anna-Karin Sjöberg", "Tommy Lundin", "0701740629", "070 174 06 30", "850601-2387"],
  },
  {
    id: "bank-forsakring-04",
    kategori: "bank-forsakring",
    text: "Fråga om bolån. Vi heter Mikaela Forsberg och Johan Forsberg och funderar på att flytta lånet från annan bank. Mitt pnr 850623-2381, Johans 900101-2385. Hör gärna av er till mig på person21@example.com eller 070-1740631.",
    forvantad: [
      "Mikaela Forsberg",
      "Johan Forsberg",
      "850623-2381",
      "900101-2385",
      "person21@example.com",
      "070-1740631",
    ],
  },
  {
    id: "bank-forsakring-05",
    kategori: "bank-forsakring",
    text: "god kväll! kortet spärrat trots att det är jag som handlat, jätteirriterande. jag heter stig boman och bor på testkorpusgatan 8 i kiruna. ring mig på 070-174 06 32 så snart ni kan, pnr 991201-2391",
    forvantad: ["stig boman", "testkorpusgatan 8", "070-174 06 32", "991201-2391"],
  },
  {
    id: "bank-forsakring-06",
    kategori: "bank-forsakring",
    text: "Handläggare Gunilla Ekström bad mig maila in handlingarna direkt till henne. Mitt personnummer är 900101-2385 och jag heter Per-Olov Hedman. Adressen dit faktureringen ska gå är Påhittsgatan 22, 3 tr. Ni når mig på person22@example.com.",
    forvantad: [
      "Gunilla Ekström",
      "900101-2385",
      "Per-Olov Hedman",
      "Påhittsgatan 22",
      "person22@example.com",
    ],
  },
  {
    id: "bank-forsakring-07",
    kategori: "bank-forsakring",
    text: "Vill utöka mitt bolån med 400 000 för tillbyggnad. Personnummer 000101-9801, namn Bosse Lindqvist. Kontot lönen går in på är clearing 3300, konto 3300-0032 3232 3232. Bäst att nå mig på 08-465 00 434 på dagtid.",
    forvantad: ["000101-9801", "Bosse Lindqvist", "08-465 00 434", "3300-0032 3232 3232"],
  },
  {
    id: "bank-forsakring-08",
    kategori: "bank-forsakring",
    text: "hej hej!! det är samira al-khatib igen, ni lovade återkoppling om skadan i köket (vattenskadan alltså) men har inte hört nåt. mitt nummer 070-1740635 och mejlen person23@example.com. pnr 781101-2397 om det behövs",
    forvantad: ["samira al-khatib", "070-1740635", "person23@example.com", "781101-2397"],
  },
  {
    id: "bank-forsakring-09",
    kategori: "bank-forsakring",
    text: "Denna skriftliga fullmakt avser min mor Elsa Bergström, född med personnummer 850601-2387, boende på Provdatagatan 3 i Lund. Jag, hennes dotter Birgitta Holm, 850623-2381, begär att få ta del av hennes skadeärende. Min telefon: 031-390 06 36.",
    forvantad: [
      "Elsa Bergström",
      "850601-2387",
      "Provdatagatan 3",
      "Birgitta Holm",
      "850623-2381",
      "031-390 06 36",
    ],
  },
  {
    id: "bank-forsakring-10",
    kategori: "bank-forsakring",
    text: "Spärrat kort vid utlandsresa. Kunden uppger sig heta Fredrik Östman, pnr 900101-2385, och vara fast i Bangkok utan fungerande kort. Han kan endast nås via mail person24@example.com. Verifierat i samtal med handläggare Nermin Hadzic.",
    forvantad: ["Fredrik Östman", "900101-2385", "person24@example.com", "Nermin Hadzic"],
  },
  {
    id: "bank-forsakring-11",
    kategori: "bank-forsakring",
    text: "Ang bolånefrågan: jag och min sambo Elin Sandström vill lösa bundet lån i förtid. Hennes pnr 991201-2391, mitt 850601-2387, jag heter Roland Wik. Vi bor på Maskeravägen 155. Skicka gärna kostnadsberäkning till person25@example.com eller ring 070 174 06 38.",
    forvantad: [
      "Elin Sandström",
      "991201-2391",
      "850601-2387",
      "Roland Wik",
      "Maskeravägen 155",
      "person25@example.com",
      "070 174 06 38",
    ],
  },
  {
    id: "bank-forsakring-12",
    kategori: "bank-forsakring",
    text: "Skadeanmälan bil. Krockade med ett vildsvin på riksväg 26 utanför Ljungby igår natt. Bilen är inte körbar. Märtha Kjellsson, pnr 000101-9801, tel 070-1740639. Vill ha ersättningsbil under reparationen.",
    forvantad: ["Märtha Kjellsson", "000101-9801", "070-1740639"],
  },
  {
    id: "bank-forsakring-13",
    kategori: "bank-forsakring",
    text: "det här är andra gången ni drar dubbel premie!!! mitt namn är kevin ahmadi, kolla pnr 640823-3234. drar pengarna tillbaka annars byter jag bolag. nås på person26@example.com",
    forvantad: ["kevin ahmadi", "640823-3234", "person26@example.com"],
  },
  {
    id: "bank-forsakring-14",
    kategori: "bank-forsakring",
    text: "Jag ringde nyss och pratade med en handläggare vid namn Siv Hansson om mitt spärrade bankkort, men samtalet bröts. Jag heter Greta Wennberg och mitt personnummer är 781101-2397. Försök gärna nå mig igen på 031-390 06 40 eller person27@example.com. Bor på Testkorpustorget 5.",
    forvantad: [
      "Siv Hansson",
      "Greta Wennberg",
      "781101-2397",
      "031-390 06 40",
      "person27@example.com",
      "Testkorpustorget 5",
    ],
  },
  {
    id: "bank-forsakring-15",
    kategori: "bank-forsakring",
    text: "Bolånelöfte för bostadsrätt i Västerås. Sökande: Nils-Göran Åkerman, 850601-2387, Påhittsgatan 9. Telefon 031-390 06 41. Medsökande är makan Ulla Åkerman på samma adress.",
    forvantad: [
      "Nils-Göran Åkerman",
      "850601-2387",
      "Påhittsgatan 9",
      "031-390 06 41",
      "Ulla Åkerman",
    ],
  },
  {
    id: "bank-forsakring-16",
    kategori: "bank-forsakring",
    text: "Vill byta utbetalningskonto för min utbetalda bilskadeersättning. Nytt konto hos annan bank, clearing 9021 konto 3300-0032 3232 3232. Mvh Ylva Frisk, 850623-2381, person28@example.com, 070 174 06 42",
    forvantad: [
      "Ylva Frisk",
      "850623-2381",
      "person28@example.com",
      "070 174 06 42",
      "3300-0032 3232 3232",
    ],
  },
  {
    id: "bank-forsakring-17",
    kategori: "bank-forsakring",
    text: "hej! jag har fått ett sms om att mitt kort är spärrat men jag har inte beställt något sånt?? heter douglas berntsson och bor på provdatagatan 17, pnr 900101-2385. kan ni ringa +46 70 174 06 43 snarast",
    forvantad: ["douglas berntsson", "provdatagatan 17", "900101-2385", "+46 70 174 06 43"],
  },
  {
    id: "bank-forsakring-18",
    kategori: "bank-forsakring",
    text: "Till handläggare Örjan Malmgren på skadeavdelningen: här kommer kompletterande uppgifter för vattenskadan. Fastighetsägare Inga-Lill Söderström, personnummer 991201-2391, adress Maskeragatan 6. Hon föredrar kontakt via sin son Erik Söderström på person29@example.com.",
    forvantad: [
      "Örjan Malmgren",
      "Inga-Lill Söderström",
      "991201-2391",
      "Maskeragatan 6",
      "Erik Söderström",
      "person29@example.com",
    ],
  },
]
