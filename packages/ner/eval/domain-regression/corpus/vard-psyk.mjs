/**
 * Privacy-safe synthetic domain regression corpus.
 *
 * Structured values come from the authority/owner-published fixtures listed in
 * docs/TEST_DATA.md; addresses use conspicuous synthetic markers. The prose is
 * author-composed and was never sourced from customer, patient or case records.
 */

export default [
  {
    id: "vard-psyk-01",
    kategori: "vard-psyk",
    text: "Journalanteckning psykiatriska mottagningen. Patient: Karin Eklund, 781101-2397. Kontaktorsak: uppföljning depression. p.t. beskriver fortsatt nedsatt stämningsläge men bättre sömn sedan dosjustering av sertralin till 100 mg. Anamn: inga suicidtankar idag. Status: adekvat affekt, god ögonkontakt. Plan: återbesök om 6 v veckor.",
    forvantad: ["Karin Eklund", "781101-2397"],
  },
  {
    id: "vard-psyk-02",
    kategori: "vard-psyk",
    text: "BUP samtalsanteckning. Närvarande: Liam Hedström (20110415, dvs 850601-2387 ej korrekt — se identitetshandling), mamma Sara Hedström och pappa Jonas Hedström. Samtal om skolfrånvaro och konflikter hemma. Liam tystlåten i början, öppnade upp när föräldrarna lämnade rummet. Nästa samtal bokat, mammas tel 070-174 06 57 vid avbokning.",
    forvantad: ["Liam Hedström", "Sara Hedström", "Jonas Hedström", "850601-2387", "070-174 06 57"],
  },
  {
    id: "vard-psyk-03",
    kategori: "vard-psyk",
    text: "telkontakt med anhörig. ringde upp maken Bo Söderqvist, 0701740658, ang fru Margareta Söderqvist 850623-2381. Bo orolig över att hon slutat äta ordentligt och står upp om nätterna. informerade om vikten av att hon tar sitt mirtazapin. erbjöd tid hos kurator, bo ska återkomma.",
    forvantad: ["Bo Söderqvist", "0701740658", "Margareta Söderqvist", "850623-2381"],
  },
  {
    id: "vard-psyk-04",
    kategori: "vard-psyk",
    text: "Bedömning inför LPT-fråga. Patienten Elsa Nyberg, 900101-2385, intagen pga akut psykos med vanföreställningar. Status: hyperverbal, tryckt tal, påverkad dygnsrytm. Anamn enl sambon Tobias Nyberg: medicinslett sedan 3 v, tidigare ep 2021. Kontaktorsak: hämtad av polis efter utåtagerande i bostaden. Rekom vård enligt LPT, överlämnat till jourläkare.",
    forvantad: ["Elsa Nyberg", "900101-2385", "Tobias Nyberg"],
  },
  {
    id: "vard-psyk-05",
    kategori: "vard-psyk",
    text: "Hembesök psykiatriska öppenvården kl 10.30 hos p.t. Gustav Öhrn, 991201-2391, Påhittsvägen 17, Borlänge. p.t. öppnade efter ca 10 min. Lägenheten ostädad, odiskad disk, men p.t. själv acceptabelt hygienisk. Har ätit lite. Stämmer av medicinering: olanzapin 10 mg finns hemma, dosett ifylld. Dotter Ulrika Öhrn deltog per telefon 070 174 06 59. Nästa hembesök om 2 v.",
    forvantad: ["Gustav Öhrn", "991201-2391", "Påhittsvägen 17", "Ulrika Öhrn", "070 174 06 59"],
  },
  {
    id: "vard-psyk-06",
    kategori: "vard-psyk",
    text: "BUP utredning adhd, första besök. Elev: Nora Blom, 900101-2385. Anamn: koncentrationssvårigheter sedan lågstadiet, strukturerat arbetsminne enligt skolans observationer. Mamma Pia Blom rapporterar sömnsvårigheter. Plan: QB-test, formulär till skola och föräldrar, återbudgivning om 6 v. Kontakt mottagningen via mamma person86@example.com.",
    forvantad: ["Nora Blom", "900101-2385", "Pia Blom", "person86@example.com"],
  },
  {
    id: "vard-psyk-07",
    kategori: "vard-psyk",
    text: "ordination: p.t. Amir Haddad 000101-9801. forts venlafaxin 75 mg x2, tillägg mirtazapin 15 mg till natten pga insomningssvårigheter. p.t. informerad om biverkningar, förstått. egenkontroll efter 4 v, sjuksköterska ringer upp. e-recept utfärdat.",
    forvantad: ["Amir Haddad", "000101-9801"],
  },
  {
    id: "vard-psyk-08",
    kategori: "vard-psyk",
    text: "Samtalsanteckning kurator. Klient: Veronica Lindqvist, 640823-3234. Tema: ångest kopplat till separation, barnens boende. Grät under stora delar av samtalet men framkom att hon sover bättre än i våras. Pågående kontakt med familjerätten. Ex-maken Henrik Lindqvist har inte hört av sig på 3 mån. Överens om fortsatt samtal varannan vecka.",
    forvantad: ["Veronica Lindqvist", "640823-3234", "Henrik Lindqvist"],
  },
  {
    id: "vard-psyk-09",
    kategori: "vard-psyk",
    text: "Jouranteckning. p.t. Filip Ahlström, 781101-2397, inburen av ambulans efter överdos av alvedon, taget i förtvivlan efter bråk med partnern. p.t. medv klar, ångrar sig. Giftinformation kontaktad, läkemedelsbehandling påbörjad på akuten. Suicidriskbedömning: låg-medel, framför allt impulsiv handlande. Vänligen kolla med systern Malin Ahlström 070-174 06 61 innan utskrivning. Vaktskötare sitter inne.",
    forvantad: ["Filip Ahlström", "781101-2397", "Malin Ahlström", "070-174 06 61"],
  },
  {
    id: "vard-psyk-10",
    kategori: "vard-psyk",
    text: "Telefonåterbudgivning BUP. Samtal med mor Anneli Karlsson ang sonen Oliver Karlsson 850601-2387. BUP-kontakten har gett diagnos AST (autismspektrumtillstånd) enligt utredning. Mamman lättad men orolig för gymnasievalet. Skickar habiliteringsremiss. Oliver själv nåbar på person87@example.com, vill ha information direkt.",
    forvantad: ["Anneli Karlsson", "Oliver Karlsson", "850601-2387", "person87@example.com"],
  },
  {
    id: "vard-psyk-11",
    kategori: "vard-psyk",
    text: "Status psykiatrisk avd: Siv Bergman, 850623-2381, dag 12 på avd. Sover 6-7 h med zopiklon. Äter ca 75%. Delaktig i gemenskapen, i morse promenad på gården med skötare. Forts avstämning av litium, senaste nivå 0,8. Anhörigkontakt: sonen Rickard Bergman ringde 0701740662, fick info med p:s samtycke. Planerad utskrivning tors om allt stabilt.",
    forvantad: ["Siv Bergman", "850623-2381", "Rickard Bergman", "0701740662"],
  },
  {
    id: "vard-psyk-12",
    kategori: "vard-psyk",
    text: "kontaktorsak: sömnproblem + oro. p.t. daniel sjöström, 900101-2385, påträffad i väntrummet 15 min före bokad tid. beskriver att han vaknar kl 03 varje natt och ligger och maler om jobbet. ingen suicidaltank, inga psykossymtom. erbjöds sömnhygienskola hos ssk, p.t. tackar ja. prova inte sömntabletter än enligt p:t:s egen önskan.",
    forvantad: ["daniel sjöström", "900101-2385"],
  },
  {
    id: "vard-psyk-13",
    kategori: "vard-psyk",
    text: "Anhörigsamtal psykiatriska kliniken. Närvarande: dotter Cecilia Rask och sonen Mikael Rask, patienten Birgitta Rask 991201-2391 avböjde att delta. Diskussion om mammas minnessvikt och säkerheten i hemmet — hon bor ensam på Provdatagatan 4 i Västerås. Rekommenderar biståndshandläggare och trygghetslarm. Cecilia tar kontakt med kommunen, hennes tel 070 174 06 63.",
    forvantad: [
      "Cecilia Rask",
      "Mikael Rask",
      "Birgitta Rask",
      "991201-2391",
      "Provdatagatan 4",
      "070 174 06 63",
    ],
  },
  {
    id: "vard-psyk-14",
    kategori: "vard-psyk",
    text: "Bedömning ätstörningsmottagningen. Patient: Tuva Lindén, 991201-2391. BMI 17,1, stabil vikt sedan förra månaden. p.t. motiverad, äter enligt måltidsplan på mottagningen 3 dgr/v. Mamma Karolina Lindén med vid dagens besök, samtal om hemsituationen och pusslande vid måltider. Labbeställning ordinerad. Åter om 2 v.",
    forvantad: ["Tuva Lindén", "991201-2391", "Karolina Lindén"],
  },
  {
    id: "vard-psyk-15",
    kategori: "vard-psyk",
    text: "missat besök igen. p.t. Hassan Yilmaz, 000101-9801, uteblev från bokat samtal kl 14. ringde mobil 070-174 06 65, inget svar. sms skickat. detta är tredje uteblivna tiden i rad — diskutera på teammötet om fortsatt vårdplan eller utskrivning enl rutin.",
    forvantad: ["Hassan Yilmaz", "000101-9801", "070-174 06 65"],
  },
  {
    id: "vard-psyk-16",
    kategori: "vard-psyk",
    text: "Intagningssamtal BUP familjeenheten. Familjen: föräldrar Maria och Stefan Ek, barnen Elsa Ek (14 år) och Hugo Ek (9 år). Kontaktorsak: Elsas vägran att gå till skolan sedan höstlovet. Anamn: oroligt på skolan, klassen delad i höstas. Maria Ek bär mycket av samtalet, Stefan tyst. Hembesök föreslaget pga svårt att komma hit — familjen bor på Maskeravägen 23, Enköping. Stefans tel 0701740666.",
    forvantad: ["Maria", "Stefan Ek", "Elsa Ek", "Hugo Ek", "Maskeravägen 23", "0701740666"],
  },
  {
    id: "vard-psyk-17",
    kategori: "vard-psyk",
    text: "Läkemedelsgenomgång äldrepsykiatri. p.t. Ingrid Sundqvist 640823-3234: citalopram 20 mg, quetiapin 25 mg note, zopiklon 7,5 mg p.r.n. dottern Agneta Palmér undrade om quetiapin kan tas bort — bokar läkartid för det. p.t. förvirrad igår kväll enligt hemtjänst, ingen feber. fortsatt observation.",
    forvantad: ["Ingrid Sundqvist", "640823-3234", "Agneta Palmér"],
  },
  {
    id: "vard-psyk-18",
    kategori: "vard-psyk",
    text: "Psykologbedömning trauma. Klient Petter Vikström, 781101-2397, remitterad från företagshälsovården efter arbetsplatsolycka i februari. Symtombild förenlig med PTSD: mardrömmar, undvikande av garaget där olyckan skedde. Förslag: EMDR-behandling 10-12 sessioner. p.t. nåbar bäst på person88@example.com dagtid, jobbar skift.",
    forvantad: ["Petter Vikström", "781101-2397", "person88@example.com"],
  },
  {
    id: "vard-psyk-19",
    kategori: "vard-psyk",
    text: "Kontaktorsak: återinsjuknande i bipolär sjukdom typ II. p.t. Sanna Löfgren, 850601-2387, har slutat med lamotrigin för 2 mån sen pga hudutslag, ej återkopplat trots påminnelser. Hypoman period i juni enl maken Erik Löfgren (070 174 06 67). Nu depressiv fas. Startar litium efter njurfunktionsprov. Remiss till Bipolärskolan, p.t. och maken välkomnas.",
    forvantad: ["Sanna Löfgren", "850601-2387", "Erik Löfgren", "070 174 06 67"],
  },
  {
    id: "vard-psyk-20",
    kategori: "vard-psyk",
    text: "hembesök pga uteblivna besök, far mider. knackade på hos p.t. edvin holmberg 850623-2381, testkorpusgatan 8 lgh 1203, gävle. öppnade ej först, granne uppgav att han sågs igår. efter 15 min öppnade p.t. — tillståndet i lägenheten anmärkningsvärt, sophögar. oro för vanvård. p.t. nekar till insatser. överväger orosanmälan till soc, diskuteras med chef imorgon.",
    forvantad: ["edvin holmberg", "850623-2381", "testkorpusgatan 8 lgh 1203"],
  },
]
