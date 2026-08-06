/**
 * Privacy-safe synthetic domain regression corpus.
 *
 * Structured values come from the authority/owner-published fixtures listed in
 * docs/TEST_DATA.md; addresses use conspicuous synthetic markers. The prose is
 * author-composed and was never sourced from customer, patient or case records.
 */

export default [
  {
    id: "edge2-01",
    kategori: "edge2",
    text: "Hej! Ebba Björk ringde och sa att leveransen till sommarstugan är sen. Hon bor på Maskeravägen 8 i Fjälkinge, hennes nummer är 070-174 06 56.",
    forvantad: ["Ebba Björk", "Maskeravägen 8", "070-174 06 56"],
  },
  {
    id: "edge2-02",
    kategori: "edge2",
    text: "ärende: sten ros (ja det är ett namn) vill att vi ändrar hans fakturaadress till Testkorpusgatan 14 lgh 1102, 123 45 stockholm. han nås på person40@example.com",
    forvantad: ["sten ros", "Testkorpusgatan 14 lgh 1102", "person40@example.com"],
  },
  {
    id: "edge2-03",
    kategori: "edge2",
    text: "Kund: Linnéa Dahl, personnummer 640823-3234. Hon frågade om en dahlia (blomman, alltså) går att beställa till bröllopet. Jag lovade återkomma i morgon.",
    forvantad: ["Linnéa Dahl", "640823-3234"],
  },
  {
    id: "edge2-04",
    kategori: "edge2",
    text: "Samordningsnummer kund: TEST-700178-2395 (ogiltigt format enl. kunden själv, systemet vägrar ta det). Kunden heter Mario Berglund och vill bli uppringd på 0701740657 när det är löst.",
    forvantad: ["700178-2395", "Mario Berglund", "0701740657"],
  },
  {
    id: "edge2-05",
    kategori: "edge2",
    text: "Vikarieanmälan: personen har samordningsnummer 781101-2397? eller var det vanligt pnr... Kolla med HR. Det är vikarien som täcker upp för Anna under mammaledigheten.",
    forvantad: ["781101-2397", "Anna"],
  },
  {
    id: "edge2-06",
    kategori: "edge2",
    text: "Flyttärende med två personer på samma abonnemang: Gunnar Sjöström, 850601-2387, och hans fru Maj Sjöström, 850623-2381. Båda ska flyttas till Påhittsvägen 21, Nacka.",
    forvantad: ["Gunnar Sjöström", "850601-2387", "Maj Sjöström", "850623-2381", "Påhittsvägen 21"],
  },
  {
    id: "edge2-07",
    kategori: "edge2",
    text: "Hej support! Tre personnummer i samma familj: 900101-2385, 991201-2391 och 020301-2398. Kolla om alla tre är upplagda på rätt avtal. Det gäller familjen Ek.",
    forvantad: ["900101-2385", "991201-2391", "020301-2398", "Ek"],
  },
  {
    id: "edge2-08",
    kategori: "edge2",
    text: "Hi, this is about my invoice. My name is Sara Lindqvist and my personnummer is 000101-9801. Sorry for writing in English, my Swedish är inte så bra. Kan ni ändå svara på svenska?",
    forvantad: ["Sara Lindqvist", "000101-9801"],
  },
  {
    id: "edge2-09",
    kategori: "edge2",
    text: "From: Jonas Falk\nSubject: password reset\n\nHi team, can you reset the lösenord for my account? Min mail är person41@example.com och kundnumret hittar ni under mitt personnummer 640823-3234. Tack!",
    forvantad: ["Jonas Falk", "person41@example.com", "640823-3234"],
  },
  {
    id: "edge2-10",
    kategori: "edge2",
    text: "SCANNED INBETALNINGSKORT (OCR):\n\nBetalningsmottagare: ELISAB\nET KARLBERG\nPNR: 580722-437\n2\nAdress: Provdatavägen 17,\nSollefteå",
    forvantad: ["580722-437", "Provdatavägen 17", "ELISAB", "ET KARLBERG"],
  },
  {
    id: "edge2-11",
    kategori: "edge2",
    text: "OCR-läsning av receptet blev så här:\nPatient: Rune\nHolmquist\nPersonnr 730928-\n1231\nTelefon: 070-\n174-06 83\nHämtas på apoteket Torsplan.",
    forvantad: ["Holmquist", "730928-", "1231", "070-", "174-06 83", "Rune"],
  },
  {
    id: "edge2-12",
    kategori: "edge2",
    text: "Kunden Petronella Ekström uppger adress Maskeragatan 45, 3 tr, lägenhet 1204, 123 45 Göteborg. Portkoden ska inte ligga i systemet längre enligt henne.",
    forvantad: ["Petronella Ekström", "Maskeragatan 45, 3 tr, lägenhet 1204"],
  },
  {
    id: "edge2-13",
    kategori: "edge2",
    text: "nytt flyttkort: Bengt Wallin, Testkorpusallé 101 lgh 1803 (18e våningen), 123 45 sthlm. gamla adressen ska avslutas den 30e.",
    forvantad: ["Bengt Wallin", "Testkorpusallé 101 lgh 1803"],
  },
  {
    id: "edge2-14",
    kategori: "edge2",
    text: "Det är Karlssons bil som står i vägen för snöröjningen, grannen sa att vi kan ringa Karlsson på 070-1740659. Annars får vi skjuta undan den, hans mackapär är fruktansvärd att backa.",
    forvantad: ["Karlsson", "070-1740659"],
  },
  {
    id: "edge2-15",
    kategori: "edge2",
    text: "Hämtaren kommer hos Annas mamma i morgon bitti. Annas mamma heter Ulla Brännström och bor på Påhittsgatan 3 i Knivsta. Anna själv är inte hemma.",
    forvantad: ["Ulla Brännström", "Påhittsgatan 3", "Anna"],
  },
  {
    id: "edge2-16",
    kategori: "edge2",
    text: "pnr från kund (kopierade in det så här, kolla med mellanslag): 781101 2397. Kunden Veronika Mellander säger att det är så det står på hennes id-kort.",
    forvantad: ["781101 2397", "Veronika Mellander"],
  },
  {
    id: "edge2-17",
    kategori: "edge2",
    text: "Kundservice logg: personnummer angavs som '850601-2387' men i ett senare mejl stod det 8506 23-2381 (felradat, antagligen copy-paste). Det är Filip Östling, person42@example.com, som vill ha sin deklarationsavi.",
    forvantad: ["850601-2387", "8506 23-2381", "Filip Östling", "person42@example.com"],
  },
  {
    id: "edge2-18",
    kategori: "edge2",
    text: "Namnet låter som ett sammansatt ord men det är två: Kerstin Fält. Hon och maken Ove Fält delar nummer 031-390 06 60 och bor på Provdatavägen 9 i Visby.",
    forvantad: ["Kerstin Fält", "Ove Fält", "031-390 06 60", "Provdatavägen 9"],
  },
  {
    id: "edge2-19",
    kategori: "edge2",
    text: "Adressen i ordern står som Maskeratorget 2 vån 2 c/o Lindgrens, Malmö — det är alltså Karin Lindgren som mottar paketet åt sin svåger. Telefon vid problem: 0701740661.",
    forvantad: ["Maskeratorget 2 vån 2", "Karin Lindgren", "0701740661"],
  },
  {
    id: "edge2-20",
    kategori: "edge2",
    text: "Blandat gränsfall: kunden 'Bo Gran' (inte granen gran) har pnr 900101-2385, hans dotter Hedda Gran 991201-2391, och båda står på kontraktet för Testkorpusvägen 27 lgh 2 i Vadstena. Bo skrev under med bläckpenna, skicka kopia till person43@example.com.",
    forvantad: [
      "Bo Gran",
      "900101-2385",
      "Hedda Gran",
      "991201-2391",
      "Testkorpusvägen 27 lgh 2",
      "person43@example.com",
    ],
  },
]
