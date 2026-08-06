/**
 * Privacy-safe synthetic domain regression corpus.
 *
 * Structured values come from the authority/owner-published fixtures listed in
 * docs/TEST_DATA.md; addresses use conspicuous synthetic markers. The prose is
 * author-composed and was never sourced from customer, patient or case records.
 */

export default [
  {
    id: "vard-remiss-01",
    kategori: "vard-remiss",
    text: "REMISS till Ortopedmottagningen, Akademiska sjukhuset. Pat: Gunvor Sandström, 900101-2385. Remitteras pga ca 4 mån svällnad och instabilitet hö knä efter fall i trappan. MR visar misstänkt partiell ruptur akl. Tidigare frisk i övrigt, ej allergier. Bedömer ej brådskande men pat är högaktiv och önskar återgå till golf. Remitterande läkare: dr Henrik Lindqvist, Vårdcentralen Kråkudden, tel 031-390 06 68.",
    forvantad: ["Gunvor Sandström", "900101-2385", "Henrik Lindqvist", "031-390 06 68"],
  },
  {
    id: "vard-remiss-02",
    kategori: "vard-remiss",
    text: "remiss ang sven oskarsson 991201-2391. pat kom till akuten inatt kl 03 med bröstsmärta, ekg utan påtagliga ischemifynd, troponin x3 neg. Nu smärtfri. Önskar ändå remiss till kardiolog för arb ekg pga anamnes på ansträngningsutlöst besvär. obs pat bor ensam på Påhittsvägen 7 och har ingen anhörig i närheten. mvh karin, undersköterska akuten",
    forvantad: ["sven oskarsson", "991201-2391", "karin", "Påhittsvägen 7"],
  },
  {
    id: "vard-remiss-03",
    kategori: "vard-remiss",
    text: "LABBSVAR. Patient: Elsa-Marie Berggren, 850601-2387. Beställare: Annika Öhman, VC Söderport, Borlänge. Provtagningsdatum 2026-07-28. P-Glukos 7,8 (H), B-Hb 112 (L), S-Kreatinin 88, eGFR 62. CRP 5. S-Kalium 4,1. P-Glukos lätt förhöjt, rekommenderar fP-glukos + HbA1c vid nästa besök. Klinisk kommentar: glukosvärdet bör bekräftas fastande.",
    forvantad: ["Elsa-Marie Berggren", "850601-2387", "Annika Öhman"],
  },
  {
    id: "vard-remiss-04",
    kategori: "vard-remiss",
    text: "Röntgensvar lungrtg 2 proj. Pat: Milos Petrovic 000101-9801. Indikation: hosta 3 v, feber. Jmf m tidigare unders saknas. Normala lungor, ingen infilt, inga vätskenivåer. Hjärta ej förstorat. Slutsats: röntgen fynden passar ej för pneumoni, överväg virusinfektion. Undersökande radiolog: Sofia Wallentin, Röntgenavd 2. Svar till: VC Norr om Stadsparken, tfn 031-390 06 70.",
    forvantad: ["Milos Petrovic", "000101-9801", "Sofia Wallentin", "031-390 06 70"],
  },
  {
    id: "vard-remiss-05",
    kategori: "vard-remiss",
    text: "AMBULANSJOURNAL SOSTEST-1123047. Larminkomst 14:22:07, händelseadress Provdatavägen 14B, Länsmansgården, Uppsala. Man 60-tal, vaket tal men förvirrad, blodtryck 90/60, puls 112, sat 93% RA. Anhörig (dottern Frida på plats) uppger att fadern, Bertil Åsman 640823-3234, fallit i köket och slagit i höft. Transportlas IV, morfin 5 mg iv. Prioritet 2, ankomst akuten 14:57. Besättning: Tim Jönsson, Lennart Fa.",
    forvantad: [
      "Provdatavägen 14B",
      "Frida",
      "Bertil Åsman",
      "640823-3234",
      "Tim Jönsson",
      "Lennart Fa",
    ],
  },
  {
    id: "vard-remiss-06",
    kategori: "vard-remiss",
    text: "REMISSTEXTER ÄR ALDRIG ROLIGA ATT SKRIVA men här kommer en: Patienten Stina Holmberg, 781101-2397, remitteras till gynekologen på Akademiska pga recidiverande urinvägsinfektioner (4 st senaste året) samt dyspareuni. Odling visat e coli x3. Pat är 45, tre barn, vb 2 sectio. Test av ab-behandling med nitrofurantoin utan effekt. Önskar utredning mtp urodynamik. Remittent: Kerstin Sundell, distriktsläkare, VC Mörbylånga, tel 031-390 06 71, e-post person89@example.com.",
    forvantad: [
      "Stina Holmberg",
      "781101-2397",
      "Kerstin Sundell",
      "031-390 06 71",
      "person89@example.com",
    ],
  },
  {
    id: "vard-remiss-07",
    kategori: "vard-remiss",
    text: "journalanteckning akutmottagningen. pat torsten nyblom 850601-2387 inkom 23.10 med ambulans från adress Maskeragatan 3 efter olycka med vinkelslip. djup skärskada vänster underarm, ca 8 cm, pulsationell blödning initialt. tryckförband + tranexamsyra 1g iv. sutureras med 12 stygn i 2 lager. tetanusbooster givet. hemgång 02.15 med återbesök vc om 10 dgr för stygnborttagning. pat uppger att han är svetsare och måste jobba imorgon. pratade med honom om vikten av vila.",
    forvantad: ["torsten nyblom", "850601-2387", "Maskeragatan 3"],
  },
  {
    id: "vard-remiss-08",
    kategori: "vard-remiss",
    text: "112-LARMANTECKNING. LarmidTEST-88231, kommunikationscentral Mitt. Inringare: kvinnlig röst, uppger sig vara Maja Ekström och ringer från Testkorpusgatan 22, Höganäs. Man andas ej, misstänkt hjärtstopp i trapphuset. CPR instruerad via telefon i 4 min innan ambulans framme. Ringarens tel: 070-1740672. Patientidentifiering oklar vid larmtillfället, senare konstaterad: Leif Brännström, 850623-2381. ROSC efter 3 stötar, defibrillerad x3.",
    forvantad: [
      "Maja Ekström",
      "Testkorpusgatan 22",
      "070-1740672",
      "Leif Brännström",
      "850623-2381",
    ],
  },
  {
    id: "vard-remiss-09",
    kategori: "vard-remiss",
    text: "Remiss till BUP Östergötland. Pat: Nils-Åke Fredriksson, 900101-2385 (pojke 23 år). Föräldrarna medverkar ej vid besöket. Pat visar sedan ca ett halvår tecken på tvångstankar, kontrollerar spis och lås upp till 30 ggr/dygn. Fungerar dåligt i skolan (läser master i Linköping). SU-raden 0, AUDIT 2 poäng. Ingen aktuell suicidrisk enl pat. Remittent: Klas Wetterberg, ST-läkare psykiatri, VC Berga, tel 031-390 06 73. Obs pat nås enklast på mobil 0701740674 då han sällan svarar på brev.",
    forvantad: [
      "Nils-Åke Fredriksson",
      "900101-2385",
      "Klas Wetterberg",
      "031-390 06 73",
      "0701740674",
    ],
  },
  {
    id: "vard-remiss-10",
    kategori: "vard-remiss",
    text: "RÖNTGENSVAR THORAX. Margareta Eliasson 991201-2391 remitterad från VC Fjälkinge pga dyspné vid ansträngning. Lungrtg: inga akuta fynd, hjärta normalstorlek, inga pleuravätskor. Redan kända förändringar i höger övre lob (förhårdnader, förmodat gamla) oförändrade mot 2019. Rekommenderar spirometri om kliniken kvarstår. Radiolog on call: Dr. Farhad Naderi. Svarsdatum 2026-08-01.",
    forvantad: ["Margareta Eliasson", "991201-2391", "Farhad Naderi"],
  },
  {
    id: "vard-remiss-11",
    kategori: "vard-remiss",
    text: "hej det är susanne på vc granbäcken. skickar remiss i efterhand pga systemkrasch igår, patienten sitter kvar här: lars pettersson 850623-2381, kom in med akut ryggsmärta (lumbago ischias misstänkt) strålande ut i v ben, pat går inte att räta upp, kryper in till toaletten. Gett diklofenak 75 mg im + paracetamol. Bor på Påhittsvägen 5 i Forsmark, sambo. Skicka gärna tid för fysio snarast, pat är lantbrukare mitt i skördetider och är väldigt stressad över det.",
    forvantad: ["susanne", "lars pettersson", "850623-2381", "Påhittsvägen 5"],
  },
  {
    id: "vard-remiss-12",
    kategori: "vard-remiss",
    text: "Labbsvar mikrobiologi. Pat: Vivianne Ahlström, 000101-9801. Prov: svalgsekret, beställt av Peter Grankvist, VC Hästhagen, Nässjö. Fynd: Betahemolyserande streptokocker grupp A. EUCAST: känslig för pcV. Pat uppges vara penicillinallergisk sedan barndomen (osäkert vilken reaktion). Överväg klindamycin alt makrolid. Vid frågor ring labbet 031-390 06 76.",
    forvantad: ["Vivianne Ahlström", "000101-9801", "Peter Grankvist", "031-390 06 76"],
  },
  {
    id: "vard-remiss-13",
    kategori: "vard-remiss",
    text: "AMBULANSJOURNAL. Larmtid 07:44, prio 1. Händelse: Provdatagatan 44B, Södermalm, trappuppgång 3 tr. Pat liggande medvetslös i trapphus, bystander (grannen Rolf uppger han hittade pat vid postutdelning) påbörjat HLR. Maskeragatan 07:51. Pat identifierad via plånbok: Gunnar Vestman, 640823-3234. Initialt pVT, defib x4, adrenalin 1 mg x3, amiodaron 300 mg. ROSC 08:12. Intuberad, transport till SÖS IVA. Besättning: Anna-Klara Svensson (ambulanssjuksköterska), Jim Walfridsson (ambulanssjukvårdare). Kontaktperson: sambon Ewa, tel 070-174 06 77.",
    forvantad: [
      "Provdatagatan 44B",
      "Rolf",
      "Gunnar Vestman",
      "640823-3234",
      "Anna-Klara Svensson",
      "Jim Walfridsson",
      "Ewa",
      "070-174 06 77",
    ],
  },
  {
    id: "vard-remiss-14",
    kategori: "vard-remiss",
    text: "Remiss dermatologi. Pat: Beata Lindfors, 781101-2397, 114 år. Sedan ca 6 v rodnad och fjällning i ansiktet, mest periorbitalt. Provat hydrokortison mild och emolientia utan effekt. Pat har tidigare haft liknande besvär vid stress och säger själv att det är 'eksem igen'. Allergisk mot jordnötter (anafylaxi som barn). Remitterar för bedömning och ev pricktest. Remittent: Lisa-Marie Strand, AT-läkare VC Solhaga, Karlshamn.",
    forvantad: ["Beata Lindfors", "781101-2397", "Lisa-Marie Strand"],
  },
  {
    id: "vard-remiss-15",
    kategori: "vard-remiss",
    text: "112-larmanteckning, SOS Öst. Larm 17:02. Kvinna ringer och skriker att hennes man inte svarar när hon ropar. Adress: Testkorpusvägen 9, Vetlanda. Inringare ger namnet Sonja Wallin och telefonnummer 031-390 06 78. Ambulans dirigerad. Vid ankomst: man sittande vid matbordet, GCS 14, förvirrad, blodsocker 2,1. Pat: Åke Wallin, 850601-2387, typ 1-diabetiker. Glukagon 1 mg im av besättning, pat piggnar. Händelse avslutad 17:58 utan transport eftersom pat vägrar åka med och blodsocker nu 6,4.",
    forvantad: ["Testkorpusvägen 9", "Sonja Wallin", "031-390 06 78", "Åke Wallin", "850601-2387"],
  },
  {
    id: "vard-remiss-16",
    kategori: "vard-remiss",
    text: "remiss till ortopeden. har patient igen, hette vet du vem: Britt-Inger Carlsson 850623-2381. hon som vi pratade om på konferensen, den med knäartrosen som inte blir bättre. Nu har hon haft värk i hö höft i 3 mån, rtg visar måttlig artros. NSAID hjälper inte, pat mår illa av dem dessutom. Tror vi behöver diskutera protes. hon bor på Påhittsvägen 31 och har ingen bil, så hon behöver åka med anhörig om det blir op. remittent: ali hadadian, vc björkåsen",
    forvantad: ["Britt-Inger Carlsson", "850623-2381", "Påhittsvägen 31", "ali hadadian"],
  },
  {
    id: "vard-remiss-17",
    kategori: "vard-remiss",
    text: "Labbsvar endokrinologi. Pat: Fanny Roos, 900101-2385. TSH 6,8 (H), fT4 11 (L), fT3 normal. Kliniken: trötthet, viktuppgång, förstoppning. TPO-ak 340 (pos). Diagnos: autoimmun hypotyreos (Hashimoto). Startat levotyroxin 25 µg. Kontroll TSH om 8 v. Svar till beställare: Malin Bäckström, VC Skogås, tel 08-465 00 479.",
    forvantad: ["Fanny Roos", "900101-2385", "Malin Bäckström", "08-465 00 479"],
  },
  {
    id: "vard-remiss-18",
    kategori: "vard-remiss",
    text: "pat kom in till drop-in utan remiss. heter enver hoxha (pnr saknas, pat saknar svenskt personnummer, uppehållstillstånd enligt uppgift). skärskada höger hand efter arbetsplatsolycka, byggarbetsplats vid Provdatagatan 17. suturerat 3 stygn. pat talar bruten svenska, tolk behövdes via telefon. bossen ringde och ville ha sjukintyg direkt, sa att jag skriver intyg när pat kommer tillbaka om 2 v. obs pat har ingen fast adress än, bor hos kusinen provisoriskt.",
    forvantad: ["enver hoxha", "Provdatagatan 17"],
  },
]
