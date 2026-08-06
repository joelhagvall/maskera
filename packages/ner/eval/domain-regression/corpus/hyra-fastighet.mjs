/**
 * Privacy-safe synthetic domain regression corpus.
 *
 * Structured values come from the authority/owner-published fixtures listed in
 * docs/TEST_DATA.md; addresses use conspicuous synthetic markers. The prose is
 * author-composed and was never sourced from customer, patient or case records.
 */

export default [
  {
    id: "hyra-fastighet-01",
    kategori: "hyra-fastighet",
    text: "Hej! Det droppar från elementet i köket igen, tredje gången nu. Jag bor på Påhittsgatan 12, lgh 1102 och är hemma efter 16. Hälsningar Lisa Andersson, 070 174 06 62.",
    forvantad: ["Påhittsgatan 12", "Lisa Andersson", "070 174 06 62"],
  },
  {
    id: "hyra-fastighet-02",
    kategori: "hyra-fastighet",
    text: "FELANMÄLAN. Ärende gäller tvättstugan på Provdatavägen 4B. Torktumlaren tar inte betalt men startar inte heller. Kontakta mig på person44@example.com eller 070-1740663. Mvh Karl-Gustav Berg, lgh 1201.",
    forvantad: ["Provdatavägen 4B", "person44@example.com", "070-1740663", "Karl-Gustav Berg"],
  },
  {
    id: "hyra-fastighet-03",
    kategori: "hyra-fastighet",
    text: "till störningsjouren: grannen i 1103 ovanför oss spelar trummor kl 23 på en tisdag. har pratat me han men han bryr sig inte. vi bor maskeragatan 7 lgh 1102. ring mig 070-174 06 64 / maja",
    forvantad: ["maskeragatan 7", "070-174 06 64", "maja"],
  },
  {
    id: "hyra-fastighet-04",
    kategori: "hyra-fastighet",
    text: "Jag vill överlåta mitt kontrakt på Testkorpusgatan 22, lgh 0903 till min syster Sara Nyström (pnr 900101-2385) från och med 1 november. Jag heter själv Emma Nyström, 000101-9801, och ni når mig på person45@example.com.",
    forvantad: [
      "Testkorpusgatan 22",
      "Sara Nyström",
      "900101-2385",
      "Emma Nyström",
      "000101-9801",
      "person45@example.com",
    ],
  },
  {
    id: "hyra-fastighet-05",
    kategori: "hyra-fastighet",
    text: "Detta är en formell protest mot hyreshöjningen på 4,8 % för lägenheten på Påhittsgatan 3, lgh 1402. Höjningen saknar förhandlingsunderlag och överstiger vad Hyresgästföreningen meddelat. Undertecknad: Olof Sandell, personnummer 640823-3234, telefon 031-390 06 66.",
    forvantad: ["Påhittsgatan 3", "Olof Sandell", "640823-3234", "031-390 06 66"],
  },
  {
    id: "hyra-fastighet-06",
    kategori: "hyra-fastighet",
    text: "Hej kontaktpersonen på växeln sa att ni heter Fastighetsservice och att jag ska prata med er kontaktperson Jenny Hollström direkt. Mitt vatten i badrummet blir aldrig varmt. Adress Provdatastigen 9, lgh 0601. Jag heter Nils Pettersson och mitt nummer är 070-1740667.",
    forvantad: ["Jenny Hollström", "Provdatastigen 9", "Nils Pettersson", "070-1740667"],
  },
  {
    id: "hyra-fastighet-07",
    kategori: "hyra-fastighet",
    text: "ang dörrtelefonen: den har inte funkat sen i fredags, leverantören kom ju aldrig. bud går åt grannen istället. vi är två som bor här, jag Amina Yusuf och min man Idris Yusuf. Maskeragatan 15 lgh 0802. maila person46@example.com, jag kollar oftare än telefonen.",
    forvantad: ["Amina Yusuf", "Idris Yusuf", "Maskeragatan 15", "person46@example.com"],
  },
  {
    id: "hyra-fastighet-08",
    kategori: "hyra-fastighet",
    text: "Hej, jag flyttar ut den 31 oktober och vill anmäla slutbesiktning för Testkorpusvägen 27, lgh 1304. Bankgiro för depositionen ska återbetalas till mig. Kontakt: Henrik Lindqvist, 781101-2397, tel 070-174 06 68, e-post person47@example.com.",
    forvantad: [
      "Testkorpusvägen 27",
      "Henrik Lindqvist",
      "781101-2397",
      "070-174 06 68",
      "person47@example.com",
    ],
  },
  {
    id: "hyra-fastighet-09",
    kategori: "hyra-fastighet",
    text: "Klämt i ventilationen på Påhittsgatan 6 lgh 0503 låter som ett jetplan på nätterna. Har anmält det här två gånger sen mars utan återkoppling. Sover inte ordentligt. Jag heter Pia Fahlström och bor själv med min dotter. Vänligen återkom till 0701740669.",
    forvantad: ["Påhittsgatan 6", "Pia Fahlström", "0701740669"],
  },
  {
    id: "hyra-fastighet-10",
    kategori: "hyra-fastighet",
    text: "Till hyresvärden: jag har fått hemfallenhet för bostadsrätt och säljer min hyresrätt på Provdatavägen 2C, lgh 1004. Önskar godkännande av andrahandsuthyrning till min kollega Dawit Gebru, pnr 850601-2387, under 12 månader. Vänliga hälsningar Birgitta Åslund, 850623-2381, person48@example.com, 070 174 06 70.",
    forvantad: [
      "Provdatavägen 2C",
      "Dawit Gebru",
      "850601-2387",
      "Birgitta Åslund",
      "850623-2381",
      "person48@example.com",
      "070 174 06 70",
    ],
  },
  {
    id: "hyra-fastighet-11",
    kategori: "hyra-fastighet",
    text: "Hej! Kan ni kolla varför det kommer mögel i sovrummet igen? Samma ställe som i fjol. Vi bor på Maskeragatan 19, lgh 0702. Ring före besöket, hunden är skygg. // Jonte Karlsson 070-1740671",
    forvantad: ["Maskeragatan 19", "Jonte Karlsson", "070-1740671"],
  },
  {
    id: "hyra-fastighet-12",
    kategori: "hyra-fastighet",
    text: "Störningsanmälan: lägenheten under oss, Testkorpusgatan 8 lgh 0901, har fester varje helg fram till 04. Vi har barn som ska upp tidigt. Tidigare larm ska finnas hos er. Vår kontaktperson hos er är väl Fredrik Ekeblad? Jag heter Susanna Myhr, min man är Peter Myhr, tel 070-174 06 72.",
    forvantad: [
      "Testkorpusgatan 8",
      "Fredrik Ekeblad",
      "Susanna Myhr",
      "Peter Myhr",
      "070-174 06 72",
    ],
  },
  {
    id: "hyra-fastighet-13",
    kategori: "hyra-fastighet",
    text: "Hej, jag heter Leila Ahmadi och bor på Påhittsstigen 11, lgh 1501. Jag fick hem en avi om hyreshöjning som jag inte förstår. Kan någon ringa mig på 0701740673 och förklara på enkel svenska? Jag kan även nås på person49@example.com. Tack!",
    forvantad: ["Leila Ahmadi", "Påhittsstigen 11", "0701740673", "person49@example.com"],
  },
  {
    id: "hyra-fastighet-14",
    kategori: "hyra-fastighet",
    text: "Felanmälan hissen i trapphus B, Provdatavägen 33. Den stannar mellan planen och lamporna blinkar. Många äldre i huset. Min mamma Greta Vallin, 900101-2385, bor i lgh 0204 och vågar inte åka den. Jag anmäler åt henne: Tomas Vallin, 070 174 06 74.",
    forvantad: ["Provdatavägen 33", "Greta Vallin", "900101-2385", "Tomas Vallin", "070 174 06 74"],
  },
  {
    id: "hyra-fastighet-15",
    kategori: "hyra-fastighet",
    text: "överlåtelse!! jag ska plugga i norge ett år och tänkte att lillasyster tar över kontraktet på maskeravägen 5 lgh 0304. hon heter tilda fors och har fast jobb. jag är elin fors, 991201-2391, och min mail person50@example.com funkar även om jag är borta. hör av er!!!",
    forvantad: ["maskeravägen 5", "tilda fors", "elin fors", "991201-2391", "person50@example.com"],
  },
  {
    id: "hyra-fastighet-16",
    kategori: "hyra-fastighet",
    text: "Hej. Infällda spisen i vår lägenhet på Testkorpusvägen 17, lgh 0605, värmer bara på en platta. Vi har vant oss men barnen behöver varm mat. Beställ gärna elektriker via er jour. Vänligen Anders Hagman och Cecilia Hagman, telefon 031-390 06 75.",
    forvantad: ["Testkorpusvägen 17", "Anders Hagman", "Cecilia Hagman", "031-390 06 75"],
  },
  {
    id: "hyra-fastighet-17",
    kategori: "hyra-fastighet",
    text: "Ärende: hyresavierna ska fortsättningsvis skickas till min nya adress Påhittsgatan 14, lgh 1105. Gamla adressen ska tas bort ur era register. Jag heter Margareta Sköld, pnr 991201-2391. Telefon 0701740677 om något är oklart.",
    forvantad: ["Påhittsgatan 14", "Margareta Sköld", "991201-2391", "0701740677"],
  },
  {
    id: "hyra-fastighet-18",
    kategori: "hyra-fastighet",
    text: "Hej, det är Måns i 1204 på Provdatagränd 9. Någon har klottrat i källargången igen och cykelrummet är uppbrutet. Larmet gick inte. Jag ringde störningsjouren igår men ingen kom. Er kontaktperson Veronica Stjerna lovade åtgärd i maj. Ring tillbaka: 070 174 06 78.",
    forvantad: ["Måns", "Provdatagränd 9", "Veronica Stjerna", "070 174 06 78"],
  },
]
