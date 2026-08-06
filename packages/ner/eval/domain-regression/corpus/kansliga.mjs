/**
 * Privacy-safe synthetic domain regression corpus.
 *
 * Structured values come from the authority/owner-published fixtures listed in
 * docs/TEST_DATA.md; addresses use conspicuous synthetic markers. The prose is
 * author-composed and was never sourced from customer, patient or case records.
 */

export default [
  {
    id: "kansliga-01",
    kategori: "kansliga",
    text: "Hej Lawen Begravningsbyrå! Det är Maj-Lis Holmberg, dotter till avlidne Sigvard Holmberg, 991201-2391. Vi vill boka in begravningen och undrar om ni kan ringa mig på 070 174 06 11 så vi kan gå igenom detaljerna. Pappa bodde på Påhittsvägen 7 i Enköping.",
    forvantad: [
      "Maj-Lis Holmberg",
      "Sigvard Holmberg",
      "991201-2391",
      "070 174 06 11",
      "Påhittsvägen 7",
    ],
  },
  {
    id: "kansliga-02",
    kategori: "kansliga",
    text: "ANTECKNING socialtjänsten. Klient: Karin Emanuelsson, 900101-2385. Har sökt ekonomiskt bistånd för hyra och el. Bor ensam med två barn på Provdatagatan 14, Falun. Uppsagd från arbetet i maj. Följs upp av handläggare om två veckor.",
    forvantad: ["Karin Emanuelsson", "900101-2385", "Provdatagatan 14"],
  },
  {
    id: "kansliga-03",
    kategori: "kansliga",
    text: "hej jag vet inte vart jag ska vända mig. min man slog mig igår igen och jag har barnen hos min syster nu. jag heter sofia lindqvist och bor på maskeravägen 3 i nynäshamn men jag vågar inte vara hemma. kan ni ringa 0701740613? snälla ring inte för sent på kvällen",
    forvantad: ["sofia lindqvist", "maskeravägen 3", "0701740613"],
  },
  {
    id: "kansliga-04",
    kategori: "kansliga",
    text: "Till begravningsbyrån i Västerås: Min farbror Ernst Glad, 640823-3234, avled i fredags. Jag, Nina Glad, är kontaktperson. Jag nås på person68@example.com eller 070-174 06 13. Undrar om kostnad för kremation och om ni hanterar dödsboet åt oss.",
    forvantad: ["Ernst Glad", "640823-3234", "Nina Glad", "person68@example.com", "070-174 06 13"],
  },
  {
    id: "kansliga-05",
    kategori: "kansliga",
    text: "Beslutsförslag LVU: Vårdnadshavare Lisa Granberg, 781101-2397, har vid upprepade tillfällen lämnat barnet Alvin Granberg (2015) utan uppsikt. Grannar på Testkorpusvägen 22 i Hallsberg har larmat polis tre gånger. Rekommenderar omedelbart omhändertagande.",
    forvantad: ["Lisa Granberg", "781101-2397", "Alvin Granberg", "Testkorpusvägen 22"],
  },
  {
    id: "kansliga-06",
    kategori: "kansliga",
    text: "Från stödlinjen: Tack för ditt samtal i natt, Ahmed. Som vi pratade om skickar jag numren till skyddat boende till din mail person69@example.com. Du kan också nå mig direkt på 0701740614 om det brådskar. Mvh volontär Stina på jourlinjen.",
    forvantad: ["Ahmed", "person69@example.com", "0701740614", "Stina"],
  },
  {
    id: "kansliga-07",
    kategori: "kansliga",
    text: "klient rolf edlund 850601-2387 ringer åter om bidraget. säger att han inte fått utbetalningen trots beslut. bor på påhittsgatan 9 hudiksvall. han var mycket upprörd och nämnde att hans dotter camilla edlund ska hjälpa honom med papperen. återkoppla snarast.",
    forvantad: ["rolf edlund", "850601-2387", "påhittsgatan 9", "camilla edlund"],
  },
  {
    id: "kansliga-08",
    kategori: "kansliga",
    text: "Hej! Vi ska ordna begravning för mamma, Birgit Åhs, 850623-2381. Hon önskade vita rosor och psalm 249. Vi syskon är fyra stycken: jag (Eva Åhs-Melin, person70@example.com, 070 174 06 15), min bror Ola Åhs och systrarna. Ceremonin gärna i Örebro.",
    forvantad: [
      "Birgit Åhs",
      "850623-2381",
      "Eva Åhs-Melin",
      "person70@example.com",
      "070 174 06 15",
      "Ola Åhs",
    ],
  },
  {
    id: "kansliga-09",
    kategori: "kansliga",
    text: "Anteckning efter hembesök hos Gunvor Stål, 900101-2385, Provdatagatan 18, Köping. Lägenheten saneringsbehövande, klienten nekar insatser. Missbruk misstänks. Grannen Birger på 031-390 06 16 har ringt in oro flera gånger. Ärendet skickas vidare till LVM-handläggare.",
    forvantad: ["Gunvor Stål", "900101-2385", "Provdatagatan 18", "Birger", "031-390 06 16"],
  },
  {
    id: "kansliga-10",
    kategori: "kansliga",
    text: "jag sitter i bilen utanför huset nu och vågar inte gå in. han är full igen. mitt namn är petra wallin och jag bor på maskeravägen 11 i kumla. min adress får absolut inte synas någonstans, han hittar mig annars. kan ni sms:a mig på 0701740617 istället för att ringa",
    forvantad: ["petra wallin", "maskeravägen 11", "0701740617"],
  },
  {
    id: "kansliga-11",
    kategori: "kansliga",
    text: "Angående dödsboet efter Tore Ljung, 850601-2387: Begravningsbyrån meddelar att kistan levereras till kapellet på tisdag. Anhörig, systern Maud Ljung (0701740618), önskar att notan skickas till person71@example.com. Avlidne bodde senast på Testkorpusvägen 5, Arboga.",
    forvantad: [
      "Tore Ljung",
      "850601-2387",
      "Maud Ljung",
      "0701740618",
      "person71@example.com",
      "Testkorpusvägen 5",
    ],
  },
  {
    id: "kansliga-12",
    kategori: "kansliga",
    text: "Ekonomiskt bistånd - avslag. Sökande: Yousef Al-Kader, 000101-9801, adress Påhittsgatan 27, Sala. Sökande saknar fullständiga kontoutdrag för april och maj trots två påminnelser. Ny ansökan möjlig när underlag inkommit. Sökande informerad per telefon 070 174 06 19.",
    forvantad: ["Yousef Al-Kader", "000101-9801", "Påhittsgatan 27", "070 174 06 19"],
  },
  {
    id: "kansliga-13",
    kategori: "kansliga",
    text: 'Journalanteckning kvinnojouren: Klienten, som kallar sig "Sara", berättar att hon flytt från sin partner tillsammans med sonen Liam, 6 år. Hon vistas just nu på skyddad adress i länet och vill inte uppge gatuadress. Kontakt sker endast via hennes nya nummer 070-1740620. Följdsamtal bokat nästa vecka.',
    forvantad: ["Sara", "Liam", "070-1740620"],
  },
  {
    id: "kansliga-14",
    kategori: "kansliga",
    text: "Till er på Rosenlunds begravningsbyrå. Min mormor Hjördis Wennerberg har somnat in, hennes personnummer är 640823-3234... förlåt det ska vara farmor. Jag heter Viktor Wennerberg och står som kontakt, telefon 070-174 06 21. Kan ni hjälpa oss med urnsättning i Heby?",
    forvantad: ["Hjördis Wennerberg", "640823-3234", "Viktor Wennerberg", "070-174 06 21"],
  },
  {
    id: "kansliga-15",
    kategori: "kansliga",
    text: "uppföljning lvu-ärende. placerad ungdom: ellen söderström, född 781101-2397. placerad i familjehem i Lindesberg sedan mars. biologisk mor veronica söderström ringde enheten gråtande och krävde umgänge. mor nås på 0701740622. sammanträde med nämnden planerat.",
    forvantad: ["ellen söderström", "781101-2397", "veronica söderström", "0701740622"],
  },
  {
    id: "kansliga-16",
    kategori: "kansliga",
    text: "Jag skriver åt min vän som inte vågar själv. Hon heter Annika Bjurström, 850601-2387, och håller sig gömd hos mig sedan måndagen. Hennes ex har stakat henne i månader. Min adress där hon bor nu är Provdatagatan 16 i Skinnskatteberg, men den får inte läcka ut! Nå henne via mig: person72@example.com eller 070 174 06 23.",
    forvantad: [
      "Annika Bjurström",
      "850601-2387",
      "Provdatagatan 16",
      "person72@example.com",
      "070 174 06 23",
    ],
  },
  {
    id: "kansliga-17",
    kategori: "kansliga",
    text: "Ärende ekonomiskt bistånd, månadsansökan. Klient: Bertil Nordqvist, 850623-2381. Uppger boendekostnad för hyresrätt på Maskeragatan 2, Surahammar. Klientens bror, Stefan Nordqvist, står som borgensman för depositionen och kan nås på 031-390 06 24. Beviljas grundbelopp enligt norm.",
    forvantad: [
      "Bertil Nordqvist",
      "850623-2381",
      "Maskeragatan 2",
      "Stefan Nordqvist",
      "031-390 06 24",
    ],
  },
  {
    id: "kansliga-18",
    kategori: "kansliga",
    text: "Ang begravning av Karin Asp, 900101-2385. Vi i familjen vill ha en enkel borgerlig ceremoni. Dottern Mikaela Asp ordnar med musiken, hennes mail är person73@example.com. Betalning sköter sonen Jonny Asp, 070-174 06 25. Avlidnas adress var Testkorpusgatan 45 i Skinnskatteberg.",
    forvantad: [
      "Karin Asp",
      "900101-2385",
      "Mikaela Asp",
      "person73@example.com",
      "Jonny Asp",
      "070-174 06 25",
      "Testkorpusgatan 45",
    ],
  },
]
