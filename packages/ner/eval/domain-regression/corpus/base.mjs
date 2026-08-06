/**
 * Privacy-safe synthetic domain regression corpus.
 *
 * Structured values come from the authority/owner-published fixtures listed in
 * docs/TEST_DATA.md; addresses use conspicuous synthetic markers. The prose is
 * author-composed and was never sourced from customer, patient or case records.
 */

export default [
  {
    id: "support-01",
    kategori: "support",
    text: "hallå!!! det här är tredje gången jag skriver nu. mitt bredband har legat nere i en vecka och ingen hör av sig. heter Malin Sjöberg och mitt kundnummer är 448192. ni kan nå mig på 0701740605 eller person1@example.com. jag vill ha prisavdrag annars byter jag leverantör!!!",
    forvantad: ["Malin Sjöberg", "0701740605", "person1@example.com"],
  },
  {
    id: "support-02",
    kategori: "support",
    text: "Hej! Jag beställde en fåtölj (orderTEST-88301) för tre veckor sen men den har inte kommit. Jag heter Patrik Lindqvist och bor på Testkorpusgatan 14, 123 45 Göteborg. Kan ni kolla vart paketet tagit vägen? Mitt telefonnummer är 070 174 06 06 om ni hellre ringer.",
    forvantad: ["Patrik Lindqvist", "Testkorpusgatan 14", "070 174 06 06"],
  },
  {
    id: "support-03",
    kategori: "support",
    text: "varför dras det dubbelt från mitt kort den här månaden?? jag heter sara ek och mejlen på kontot är person2@example.com. jag har betalat 199 kr den 3:e och samma belopp den 5:e. fixa det här nu, annars kontaktar jag konsumentverket.",
    forvantad: ["sara ek", "person2@example.com"],
  },
  {
    id: "support-04",
    kategori: "support",
    text: "Hej, vi fick en defekt diskmaskin levererad i tisdags. Installatören sa att vi skulle höra av oss hit direkt. Det är Anders och Katarina Björklund som gäller, adressen är Påhittsvägen 7 i Sollentuna. Anders nås enklast på 070-1740607. Ärendenummer RA-2024-5591.",
    forvantad: ["Anders och Katarina Björklund", "Påhittsvägen 7", "070-1740607"],
  },
  {
    id: "vard-01",
    kategori: "sjukhus",
    text: "Patient Ingrid Carlsson, 19000101-9801, inkommer via ambulans efter fall i hemmet. Vfu huvudtrauma, GCS 14, vakna ref. Boende på Provdatagatan 3B, Lund. Anhörig, sonen Mikael Carlsson 070-174 06 08, underrättad. Rt skalle utan patologiskt. Obs pga uttalad yrsel.",
    forvantad: [
      "Ingrid Carlsson",
      "19000101-9801",
      "Provdatagatan 3B",
      "Mikael Carlsson",
      "070-174 06 08",
    ],
  },
  {
    id: "vard-02",
    kategori: "sjukhus",
    text: "Återbesök diabetes typ 2. Gunvor Ekström, 640823-3234, har svårt att hålla blodsockret trots metformin 500x2. Pågående stressrelaterade besvär, nyligen skild. Bor ensam på Maskeratorget 5, Halmstad. Överläggning med dietist bokad. Pat uppmanad kontakta vårdcentralen på 031-390 06 09 vid försämring.",
    forvantad: ["Gunvor Ekström", "640823-3234", "Maskeratorget 5"],
  },
  {
    id: "vard-03",
    kategori: "sjukhus",
    text: "Remiss från VC angående Fatima Al-Rashid, 781101-2397, misstänkt utmattningssyndrom. Sjukskriven sedan mars, sömnstörningar, koncentrationssvårigheter. Bedomning av psykolog Beatrice Hultgren på Mottagning 2 rekommenderas. Patienten talar god svenska, tolk behövs ej. Hemadress: Testkorpusgatan 12, 123 45 Malmö.",
    forvantad: ["Fatima Al-Rashid", "781101-2397", "Beatrice Hultgren", "Testkorpusgatan 12"],
  },
  {
    id: "vard-04",
    kategori: "sjukhus",
    text: "Telefonsamtal med maka till patient Olle Vestman, 850601-2387, vårdas avd 6 Kiruna lasarett. Makan Britt Vestman oroad pga försämrat allmäntillstånd, ber om återkoppling. Nås på 0980-319 210. Överlämning skett till ansvarig läkare.",
    forvantad: ["Olle Vestman", "850601-2387", "Britt Vestman", "0980-319 210"],
  },
  {
    id: "epost-01",
    kategori: "epost",
    text: "Hej! Tack för mötet igår. Som utlovat bifogar jag offerten för q3. Hör gärna av dig om något är oklart så bokar vi ett uppföljningssamtal. Med vänliga hälsningar, Cecilia Norström, Key Account Manager, Tel: 070-1740611, person3@example.com, Nordcap Solutions AB, Påhittsgatan 22, 123 45 Stockholm.",
    forvantad: ["Cecilia Norström", "070-1740611", "person3@example.com", "Påhittsgatan 22"],
  },
  {
    id: "epost-02",
    kategori: "epost",
    text: "Bästa fru Andersson, enligt vårt telefonsamtal bekräftar jag härmed att ditt ärende om renoveringsbidrag mottagits. Saknad bygglovsansökan ska vara oss tillhanda senast den 15 augusti. Vänligen kontakta handläggare Tomas Birgersson, person4@example.com eller 031-390 06 12. Med vänlig hälsning, Gävle kommun.",
    forvantad: ["Tomas Birgersson", "person4@example.com", "031-390 06 12"],
  },
  {
    id: "epost-03",
    kategori: "epost",
    text: "Hej Helena! Förlåt för sent svar, semestern kom emellan. Ja, jag kan leda workshopen den 12 september. Skicka agendan så förbereder jag mig. Mvh Stefan Ahlström, VD, Sörmlands Tryckeri AB, Mobil: 0701740613, E-post: person5@example.com, Besöksadress: Provdatagatan 9, Eskilstuna",
    forvantad: ["Stefan Ahlström", "0701740613", "person5@example.com", "Provdatagatan 9"],
  },
  {
    id: "epost-04",
    kategori: "epost",
    text: "Ämne: Kallelse till årsstämma. Föreningens medlemmar kallas till årsstämma torsdagen den 20 mars kl 18.30 i föreningslokalen. Frågor besvaras av ordförande Agneta Sandell på person6@example.com eller 08-465 00 414. Anmälan till vaktmästaren om ni behöver nycklar. BRF Vildrosen, Maskeravägen 188, 123 45 Hägersten.",
    forvantad: ["Agneta Sandell", "person6@example.com", "08-465 00 414", "Maskeravägen 188"],
  },
  {
    id: "chatt-01",
    kategori: "chatt",
    text: "pratade med lisa andersson igår, hon fick jobbet på apoteket!! hon bor ju numera på testkorpusgatan 8 så det är nära för henne. skicka gratulationskort till henne va, hennes nya nummer är 070-1740615",
    forvantad: ["lisa andersson", "testkorpusgatan 8", "070-1740615"],
  },
  {
    id: "chatt-02",
    kategori: "chatt",
    text: "du glöm inte att hämta fredrik på torsdag, han landar 14:20. hör av dig till fredrik englund direkt om planet är sent, han svarar inte alltid på sms men mejlar på person7@example.com",
    forvantad: ["fredrik englund", "person7@example.com"],
  },
  {
    id: "chatt-03",
    kategori: "chatt",
    text: "va sa hon?? johan sa att dom flyttar till borås i augusti?? skicka person8@example.com till mig så frågar jag själv. eller ring 070-174 06 16, det är hans mobila",
    forvantad: ["person8@example.com", "070-174 06 16"],
  },
  {
    id: "chatt-04",
    kategori: "chatt",
    text: "haha ok men be careful med vad du säger åt camilla stenberg om festen, hon berättar allt för sin kille. hon bor i lägenheten bredvid mig på påhittsgatan 15 så hon hör ju allt ändå lol",
    forvantad: ["camilla stenberg", "påhittsgatan 15"],
  },
  {
    id: "hr-01",
    kategori: "hr",
    text: "Arbetsansökan – kundtjänstmedarbetare. Mitt namn är Yusuf Hassan och jag har arbetat inom kundtjänst i över sex år, senast på Tele2s avdelning i Västerås. Jag bor på Provdatagatan 21, 123 45 Stockholm, nås på 0701740617 eller person9@example.com. Referenser: min tidigare chef Maria Krona, 070 174 06 18.",
    forvantad: [
      "Yusuf Hassan",
      "Provdatagatan 21",
      "0701740617",
      "person9@example.com",
      "Maria Krona",
      "070 174 06 18",
    ],
  },
  {
    id: "hr-02",
    kategori: "hr",
    text: "Referenstagning för kandidat Elin Bergsten, personnummer 850623-2381, som sökt tjänsten som projektledare. Tidigare anställningar: Karlstad Energi AB 2018–2023, därefter konsult på Sigma. Utbildad civilingenjör KTH. Nuvarande bostadsadress enligt folkbokföringen: Maskeravägen 4, Sundsvall.",
    forvantad: ["Elin Bergsten", "850623-2381", "Maskeravägen 4"],
  },
  {
    id: "hr-03",
    kategori: "hr",
    text: "CV-utdrag: Pia Holmberg, född 1979, har arbetat som ekonomiassistent i 15 år. Kontaktuppgifter: person10@example.com, 070-1740619. Fastighetsadress: Testkorpusgatan 33, 123 45 Norrköping. Lönanspråk 38 000 kr. Tillgänglig från den 1 november.",
    forvantad: ["Pia Holmberg", "person10@example.com", "070-1740619", "Testkorpusgatan 33"],
  },
  {
    id: "hr-04",
    kategori: "hr",
    text: "Kontaktuppgifter för onboarding: Medarbetaren heter Daniel Mårtensson, pnr 900101-2385, och ska få tillgång till systemet från måndag. Skicka utrustningen till hans adress, Påhittsvägen 10, Täby. Handledare blir Jessica Lund, person11@example.com.",
    forvantad: [
      "Daniel Mårtensson",
      "900101-2385",
      "Påhittsvägen 10",
      "Jessica Lund",
      "person11@example.com",
    ],
  },
  {
    id: "ekonomi-01",
    kategori: "ekonomi",
    text: "Vi har mottagit er faktura nrTEST-55213 med OCRTEST-8842 9931 44 på 4 560 kr men kan inte styrka att tjänsten utförts. Vi begär korrigering. Mottagaren av fakturan är vår revisor Gun-Britt Åslund, Provdatagatan 2, 123 45 Uppsala. Återkom till henne på person12@example.com.",
    forvantad: ["Gun-Britt Åslund", "Provdatagatan 2", "person12@example.com"],
  },
  {
    id: "ekonomi-02",
    kategori: "ekonomi",
    text: "Påminnelse trots betalning! Jag, Rolf Eklund, betalade fakturan den 2 juni via bankgiro 991-2346 med referens KundTEST-11023, 2 890 kr. Nu kommer en ny räkning på samma belopp. Min adress är Maskeravägen 45, Söderhamn, och mitt telefonnummer 070-174 06 20. Jag vill ha skriftlig bekräftelse att skulden är kvittad.",
    forvantad: ["Rolf Eklund", "Maskeravägen 45", "070-174 06 20"],
  },
  {
    id: "ekonomi-03",
    kategori: "ekonomi",
    text: "Uppgifter för utbetalning av reseersättning: Anställd Mona Lindgren, pnr 991201-2391, bank Nordea, clearing 3300, konto 3300-0032 3232 3232. Resan avsåg kundmöte i Örebro, kostnad 3 120 kr inkl moms. Kontaktperson på respektive kund: Annika Forsberg, person13@example.com.",
    forvantad: [
      "Mona Lindgren",
      "991201-2391",
      "Annika Forsberg",
      "person13@example.com",
      "3300-0032 3232 3232",
    ],
  },
  {
    id: "ekonomi-04",
    kategori: "ekonomi",
    text: "Klagomål på inkassokrav från Sven-Olof Nyström, Testkorpusgatan 66, 123 45 Borås. Kravet avser ett gymabonnemang som sägs upp den 1 maj, och beloppet 899 kr bestrids. Kunden påpekar att inga påminnelser mottagits. E-post till kundtjänst: person14@example.com, telefon 031-390 06 21.",
    forvantad: ["Sven-Olof Nyström", "Testkorpusgatan 66", "person14@example.com", "031-390 06 21"],
  },
  {
    id: "forum-01",
    kategori: "forum",
    text: "Någon annan som haft problem med den här mäklaren? Min granne Henrik Sjöström sålde sin villa via dom i vintras och fick vänta tre månader på tillträdet. Han bor på Påhittsvägen 19 i Nacka och säger att han aldrig mer anlitar samma byrå. Själv gick jag med min försäljning via en annan mäklare i Skärholmen.",
    forvantad: ["Henrik Sjöström", "Påhittsvägen 19"],
  },
  {
    id: "forum-02",
    kategori: "forum",
    text: "Update efter min operation: allt gick bra och jag är hemma nu igen! Tack alla för pepp. Ska tipsa om doktorn, Susanna Rydberg på Sophiahemmet, hon var fantastisk. Kontorsnumret dit är 08-465 00 422 om någon undrar. Nu vila i fyra veckor enligt läkarens order.",
    forvantad: ["Susanna Rydberg", "08-465 00 422"],
  },
  {
    id: "forum-03",
    kategori: "forum",
    text: "Har någon testat den nya cykelstigen utefter sjön? Cyklade där med min dotter Alva i lördags och hon älskade det. Hon är 9 år och växer ur sin cykel, så jag funderar på att köpa en begagnad. Såg att en Pelle Östberg annonserat ut en 24-tummare på blocket för 800 kr i Växjö.",
    forvantad: ["Pelle Östberg"],
  },
  {
    id: "forum-04",
    kategori: "forum",
    text: "Ber om ursäkt om jag missförstått tidigare post, men jag såg att Louise Hammar skrev att återbetalningen kommit fram. Är det någon här som fått kontakt med henne direkt? Hennes mejl person15@example.com verkar inte funka längre, jag får studs på alla mejl.",
    forvantad: ["Louise Hammar", "person15@example.com"],
  },
  {
    id: "edge-01",
    kategori: "edge",
    text: "ring kalle om rörämnena, han vet var vi lagt dom. annars fråga gunnel i köket.",
    forvantad: ["kalle", "gunnel"],
  },
  {
    id: "edge-02",
    kategori: "edge",
    text: "Vår nya medarbetare Anne-Lise Gustafsson Dahl börjar på måndag. Hon har tidigare arbetat hos Ernst & Young och bor på Provdatagatan 2 i Hjo. Hennes mejl blir person16@example.com.",
    forvantad: ["Anne-Lise Gustafsson Dahl", "Provdatagatan 2", "person16@example.com"],
  },
  {
    id: "edge-03",
    kategori: "edge",
    text: "Journalanteckning: Kalle Svensson, pnr 850623-2381, kommer till återbesok tisdag. Bor på Oxtorget i Västerås, exakt nummer oklart men postnummer 123 45. Hustrun Lotta Svensson medföljer.",
    forvantad: ["Kalle Svensson", "850623-2381", "Lotta Svensson"],
  },
  {
    id: "edge-04",
    kategori: "edge",
    text: "Mötet flyttas till onsdag kl 13. Medverkande: Jean-François Dubois från vårt pariskontor, nås på person17@example.com eller +46 70 174 06 24. Hans svenska assistent Emma Söderlind bokar rummet.",
    forvantad: [
      "Jean-François Dubois",
      "person17@example.com",
      "+46 70 174 06 24",
      "Emma Söderlind",
    ],
  },
  {
    id: "edge-05",
    kategori: "edge",
    text: "Hej, jag tror jag skrivit fel mejladress när jag registrerade kontot. Den står som person18@example.com (med två n i efternamnet) men min riktiga adress är person19@example.com. Jag heter Jenny Karlsson och mitt medlemsnummer är 77123. Kan ni ändra?",
    forvantad: ["person18@example.com", "person19@example.com", "Jenny Karlsson"],
  },
  {
    id: "edge-06",
    kategori: "edge",
    text: "Beställning mottagen från Åsa Öberg, Leveransadress: E4 motellvägen (utan gatunummer, invid avfart 112), Tierp. Telefon 0701740625. Kunden önskar leverans på fredag eftermiddag.",
    forvantad: ["Åsa Öberg", "0701740625"],
  },
  {
    id: "edge-07",
    kategori: "edge",
    text: "Patienten uppger sitt personnummer som 19000101-9801 men journalystemet godkänner det inte. Hon heter Birgitta Tolvmanson och är född på Västmanlands sjukhus. Ring henne på 070 174 06 26 för att bekräfta uppgifterna.",
    forvantad: ["19000101-9801", "Birgitta Tolvmanson", "070 174 06 26"],
  },
]
