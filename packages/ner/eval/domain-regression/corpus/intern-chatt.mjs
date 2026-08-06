/**
 * Privacy-safe synthetic domain regression corpus.
 *
 * Structured values come from the authority/owner-published fixtures listed in
 * docs/TEST_DATA.md; addresses use conspicuous synthetic markers. The prose is
 * author-composed and was never sourced from customer, patient or case records.
 */

export default [
  {
    id: "intern-chatt-01",
    kategori: "intern-chatt",
    text: "standup: jag är klar med login-fixen, kvar är deploy till staging. emma h tar över testerna för jag ska på tandläkaren kl 14. hör av mig på 070-1740679 om nåt brinner :)",
    forvantad: ["emma h", "070-1740679"],
  },
  {
    id: "intern-chatt-02",
    kategori: "intern-chatt",
    text: "Hej alla! Vi har en ny kollega som börjar måndag: Lisa Bergström. Hon nås på person51@example.com tills hennes konto är klart, interna kontot blir nog klart i veckan. Ge henne en varm välkomstkram!",
    forvantad: ["Lisa Bergström", "person51@example.com"],
  },
  {
    id: "intern-chatt-03",
    kategori: "intern-chatt",
    text: "hr-update: ang sjukskrivningen för kalle så är han sjukskriven 100% t o m 15/9, läkarintyget kom in igår. han har pnr 000101-9801 i systemet om löneteamet frågar. ingen info vidare utanför denna kanal tack.",
    forvantad: ["kalle", "000101-9801"],
  },
  {
    id: "intern-chatt-04",
    kategori: "intern-chatt",
    text: "någon som har telefonnumret till kontaktpersonen hos kund i Malmö? det ska vara en Sara Lindqvist, tror hennes nr är 070-174 06 80. behöver boka om mötet på tors",
    forvantad: ["Sara Lindqvist", "070-174 06 80"],
  },
  {
    id: "intern-chatt-05",
    kategori: "intern-chatt",
    text: "onboardingchecklista för den nya praktikanten: skapa ad-konto, beställ nyckelkort, maila välkomstmailet till person52@example.com så länge. han bor på Maskeragatan 45 om vi ska skicka datorn hem.",
    forvantad: ["person52@example.com", "Maskeragatan 45"],
  },
  {
    id: "intern-chatt-06",
    kategori: "intern-chatt",
    text: "planering kundmöte nästa vecka: jag, johan och Petter Sandberg åker dit tis 9.30. kundens beställare heter Ingrid Holmberg, mail person53@example.com. ta med offertunderlaget!",
    forvantad: ["johan", "Petter Sandberg", "Ingrid Holmberg", "person53@example.com"],
  },
  {
    id: "intern-chatt-07",
    kategori: "intern-chatt",
    text: "fy vad segt, har legat i möte med ekonomichefen hela fm. Greta Wennberg ska ringa mig på 0701740681 kl 15, kan nån ta min telefon om jag inte hinner tillbaka?",
    forvantad: ["Greta Wennberg", "0701740681"],
  },
  {
    id: "intern-chatt-08",
    kategori: "intern-chatt",
    text: "notera att ändrad löneinfo för anställd 640823-3234 ska in i systemet före fredag. det gäller alltså Birgitta Olsson som gått upp i tjänstegrad.",
    forvantad: ["640823-3234", "Birgitta Olsson"],
  },
  {
    id: "intern-chatt-09",
    kategori: "intern-chatt",
    text: "födelsedagsfika på fredag!! 🎂 sara fyller år, vi samlas i köket 14.30. swisha lotta svensson 30 kr om du är med på presentkortet, hennes nr är 070 174 06 82",
    forvantad: ["sara", "lotta svensson", "070 174 06 82"],
  },
  {
    id: "intern-chatt-10",
    kategori: "intern-chatt",
    text: "kan någon kolla varför Åke har två konton i kundregistret? ena står det Åke Petersson, person54@example.com, andra bara ake p med gamla numret 08-465 00 483. slå ihop dem pls",
    forvantad: ["Åke", "Åke Petersson", "person54@example.com", "ake p", "08-465 00 483"],
  },
  {
    id: "intern-chatt-11",
    kategori: "intern-chatt",
    text: "standup imorgon flyttas till 9.45 för jag ska lämna barn på förskolan. annika b leder den om jag är sen, pinga henne på teams. /Karl",
    forvantad: ["annika b", "Karl"],
  },
  {
    id: "intern-chatt-12",
    kategori: "intern-chatt",
    text: "HR här igen. Nu är det klart: rehabiliteringsmötet med den sjukskrivna kollegan bokat, kontakta mig om ni behöver detaljer. Hen heter Jesper Falk, pnr 781101-2397, och ska inte kontaktas direkt av teamet under sjukskrivningen.",
    forvantad: ["Jesper Falk", "781101-2397"],
  },
  {
    id: "intern-chatt-13",
    kategori: "intern-chatt",
    text: "kund vill ha demo på plats hos dem, adressen är Testkorpusvägen 7 i Eskilstuna. ansvarig där heter fatima, hennes mail person55@example.com. vem kan åka?",
    forvantad: ["Testkorpusvägen 7", "fatima", "person55@example.com"],
  },
  {
    id: "intern-chatt-14",
    kategori: "intern-chatt",
    text: "påminnelse: nya konsulten Filip Norén börjar idag, påhittsgatan 34. hans privata mail tills ad-kontot är klart: person56@example.com, tel 070-174 06 84",
    forvantad: ["Filip Norén", "person56@example.com", "070-174 06 84"],
  },
  {
    id: "intern-chatt-15",
    kategori: "intern-chatt",
    text: "vet nån om ulla jobbar idag? hennes telefon verkar avstängd, provade 0701740685 men går bara till röstsvar. hon skulle ju skicka kvartalsrapporten",
    forvantad: ["ulla", "0701740685"],
  },
  {
    id: "intern-chatt-16",
    kategori: "intern-chatt",
    text: "lite känsligt men: vi måste prata om situationen med en medarbetare, gäller hälsan. hennes pnr i lönesystemet är 850601-2387. håll detta inom ledningsgruppen, boka möte med mig och hr-chefen.",
    forvantad: ["850601-2387"],
  },
  {
    id: "intern-chatt-17",
    kategori: "intern-chatt",
    text: "kundmötet gick bra 👍 de vill ha uppföljning med vår säljare Oskar Melin, person57@example.com, och deras nya it-chef Gunnar Ahl ska vara med nästa gång. han bor visst granne med mig på Provdatavägen 3 lol",
    forvantad: ["Oskar Melin", "person57@example.com", "Gunnar Ahl", "Provdatavägen 3"],
  },
  {
    id: "intern-chatt-18",
    kategori: "intern-chatt",
    text: "glömde säga det på standup men taxi bokat till mässan tors 7.30, upphämtning hos mig, Maskeragatan 22. mejla kvittona till mig sen på person58@example.com så bokför jag. /henke",
    forvantad: ["Maskeragatan 22", "person58@example.com", "henke"],
  },
]
