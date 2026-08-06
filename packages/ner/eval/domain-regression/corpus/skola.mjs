/**
 * Privacy-safe synthetic domain regression corpus.
 *
 * Structured values come from the authority/owner-published fixtures listed in
 * docs/TEST_DATA.md; addresses use conspicuous synthetic markers. The prose is
 * author-composed and was never sourced from customer, patient or case records.
 */

export default [
  {
    id: "skola-01",
    kategori: "skola",
    text: "Hej! Albin Lindqvist i 4B är sjuk idag, feber sen igår kväll. Han är hemma med mig. Hälsningar mamma Sara Lindqvist, 070 174 06 39",
    forvantad: ["Albin Lindqvist", "Sara Lindqvist", "070 174 06 39"],
  },
  {
    id: "skola-02",
    kategori: "skola",
    text: "Frånvaroanmälan för min dotter Elsa Bergström (pnr 850601-2387). Hon har vabbat hela veckan och vi har tid hos läkaren på fredag. Hör av er om ni behöver intyg. /Maria Bergström",
    forvantad: ["Elsa Bergström", "850601-2387", "Maria Bergström"],
  },
  {
    id: "skola-03",
    kategori: "skola",
    text: "Hej fröken! Tyvärr måste vi hämta Wille tidigt imorgon, tandläkarkl 14. Vi bor ju på Provdatagatan 7 så det är nära att svänga förbi. Mvh Johan och Petra",
    forvantad: ["Wille", "Provdatagatan 7", "Johan", "Petra"],
  },
  {
    id: "skola-04",
    kategori: "skola",
    text: "Till mentor Kristina Åberg. Jag är orolig för min son Noah Engström i 7A. Han har varit ledsen länge och pratar om att ingen vill vara med honom på rasterna. Kan vi boka ett samtal nästa vecka? Nå mig på 070-1740640 eller person82@example.com. Tack på förhand, Johan Engström",
    forvantad: ["Noah Engström", "070-1740640", "person82@example.com", "Johan Engström"],
  },
  {
    id: "skola-05",
    kategori: "skola",
    text: "Utvecklingssamtal 12/3 – Ella Norén, klass 5C. Närvarande: Ella, mamma Lotta Norén, klasslärare. Ella trivs bra socialt men matematiken går trögt, särskilt multiplikation. Mamma undrar om extra anpassningar. Nytt samtal i höst. Kontakt: person83@example.com",
    forvantad: ["Ella Norén", "Lotta Norén", "person83@example.com"],
  },
  {
    id: "skola-06",
    kategori: "skola",
    text: "hej! lille Hugo har spytt hela natten så han stannar hemma idag. ring mig om det är nåt, 070-174 06 41. /pappa Oskar",
    forvantad: ["Hugo", "070-174 06 41", "Oskar"],
  },
  {
    id: "skola-07",
    kategori: "skola",
    text: "Meddelande via Unikum: Saga Ekholm hämtas idag av sin mormor Birgitta Ekholm då jag sitter i möte till 17. Mormor hämtar ca 15.30. Godkänner ni detta? Mvh Frida Ekholm, 0701740642",
    forvantad: ["Saga Ekholm", "Birgitta Ekholm", "Frida Ekholm", "0701740642"],
  },
  {
    id: "skola-08",
    kategori: "skola",
    text: "Hej förskolan! Vi bytte adress förra veckan, kan ni uppdatera i systemet? Ny adress är Maskeravägen 44 i Bagarmossen. Gäller både Liam Hedman (Solrosen) och storebror Axel Hedman som går i fritids. Tack! /Anna Hedman",
    forvantad: ["Maskeravägen 44", "Liam Hedman", "Axel Hedman", "Anna Hedman"],
  },
  {
    id: "skola-09",
    kategori: "skola",
    text: "Angående matsedeln: min dotter Maja Lind (6B) är laktosintolerant och fick fel mat igår. Hon fick magont och vi hämtade henne tidigt. Vill att ni flaggar detta i köket. Ring mig gärna: Karin Lind 070 174 06 43.",
    forvantad: ["Maja Lind", "Karin Lind", "070 174 06 43"],
  },
  {
    id: "skola-10",
    kategori: "skola",
    text: "Hej! Jag skriver för mitt barn Theodor Ahlström, personnummer 850623-2381, som ska börja ettan till hösten. Vi har precis flyttat hit från Falun och behöver skicka in vaccinationsintyg. Vart skickar jag dem? Med vänlig hälsning, Cecilia Ahlström, person84@example.com",
    forvantad: ["Theodor Ahlström", "850623-2381", "Cecilia Ahlström", "person84@example.com"],
  },
  {
    id: "skola-11",
    kategori: "skola",
    text: "frånvaro: ida sjuk idag. hostar som en galning. hoppas hon är tillbaka på måndag /henrik",
    forvantad: ["ida", "henrik"],
  },
  {
    id: "skola-12",
    kategori: "skola",
    text: "Till rektor och mentor: Jag heter Patrik Sjöberg och är pappa till Alma Sjöberg i 8C. Alma berättade att hon blivit utsatt för kränkande kommentarer i skolkorridoren av äldre elever. Detta är andra gången det händer och jag kräver att ni agerar enligt skolans plan mot kränkande behandling. Jag vill ha återkoppling inom en vecka. Ni når mig på 070-1740644 eller person85@example.com.",
    forvantad: ["Patrik Sjöberg", "Alma Sjöberg", "070-1740644", "person85@example.com"],
  },
  {
    id: "skola-13",
    kategori: "skola",
    text: "Glömt att anmäla – Viktor är hos sin pappa i Örebro hela vecka 42 så han är inte på fritids. För säkerhets skull: mitt nummer är 070-174 06 45 om något händer. /Malin, mamma till Viktor Hallgren",
    forvantad: ["Viktor", "070-174 06 45", "Malin", "Viktor Hallgren"],
  },
  {
    id: "skola-14",
    kategori: "skola",
    text: "Vab idag för båda ungarna. Selma har feber och Nils sover dåligt. Jag är hemma imorgon också om det behövs. Hälsningar från Jonas på Testkorpusvägen 3",
    forvantad: ["Selma", "Nils", "Jonas", "Testkorpusvägen 3"],
  },
  {
    id: "skola-15",
    kategori: "skola",
    text: "Anteckning efter samtal med förälder 2026-03-04. Förälder: Gunilla Strand, tel 0701740646, gäller sonen Melvin Strand (klass 3A, pnr 900101-2385). Tidigare antecknat pnr i registret stämde ej, administrationen ska korrigera. Melvin har svårt att koncentrera sig på förmiddagarna. Familjen håller på med separation vilket påverkar honom. Uppföljning om 6 veckor.",
    forvantad: ["Gunilla Strand", "0701740646", "Melvin Strand", "900101-2385"],
  },
  {
    id: "skola-16",
    kategori: "skola",
    text: "Hej Bumbibjörnarna! Tack för en fin vecka. Edith har pratat jättemycket om det nya klätterstället. En fråga: kan ni kolla så hennes solhatt ligger i hatthylla två? Vi hittar den inte hemma. Kram, Lisa och Daniel (Ediths föräldrar). Ps. Mormor Ulla-Britt Karlsson hämtar på torsdag.",
    forvantad: ["Edith", "Lisa", "Daniel", "Ulla-Britt Karlsson"],
  },
  {
    id: "skola-17",
    kategori: "skola",
    text: "Hej, det är Ebbe Sandins mamma. Ebbe kommer sent imorgon, vi har läkartid kl 9 hos BVC i Knivsta. Han är på plats senast 10.30. Behöver han ha med matsäck då? Mvh Therese Sandin",
    forvantad: ["Ebbe Sandin", "Ebbe", "Therese Sandin"],
  },
  {
    id: "skola-18",
    kategori: "skola",
    text: "OBS fel nummer i elevhälsans lista! Rätt telefon till mig är 070 174 06 47 (inte 070-1740648 som står hos er). Gäller kontakt för min dotter Alice Wahlgren i förskoleklass. Vänligen Anders Wahlgren, Påhittsvägen 18",
    forvantad: ["070 174 06 47", "Alice Wahlgren", "Anders Wahlgren", "Påhittsvägen 18"],
  },
]
