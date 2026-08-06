/**
 * Privacy-safe synthetic domain regression corpus.
 *
 * Structured values come from the authority/owner-published fixtures listed in
 * docs/TEST_DATA.md; addresses use conspicuous synthetic markers. The prose is
 * author-composed and was never sourced from customer, patient or case records.
 */

export default [
  {
    id: "telefon-transkript-01",
    kategori: "telefon-transkript",
    text: "Agent: Tack för att du ringer kundtjänst, mitt namn är Sara, hur kan jag hjälpa dig? Kund: hej hej, ööh, det är det är Morgan Flemmingström som ringer, jag undrar över fakturan som kom i måndags. Agent: Okej Morgan, kan du ta ditt kundnummer? Kund: nej alltså jag hittar det inte, men ni kan väl slå upp mig på namnet istället.",
    forvantad: ["Morgan Flemmingström"],
  },
  {
    id: "telefon-transkript-02",
    kategori: "telefon-transkript",
    text: "Kund: mitt personnummer, vänta lite... åttioett noll två noll sex... nej vänta, jag säger fel, det är 991201-2391. Agent: Tack, då hittar jag dig direkt. Kund: bra bra, för det är bråttom med det här ärendet.",
    forvantad: ["991201-2391"],
  },
  {
    id: "telefon-transkript-03",
    kategori: "telefon-transkript",
    text: "Agent: Vilken e-postadress vill du ha bekräftelsen till? Kund: ööh, det är pelle punkt johansson snabel-a outlook punkt com. Agent: Kan du bokstavera efternamnet? Kund: j-o-h-a-n-s-s-o-n. Agent: Tack Pelle Johansson, då skickar jag dit.",
    forvantad: ["pelle punkt johansson snabel-a outlook punkt com", "Pelle Johansson"],
  },
  {
    id: "telefon-transkript-04",
    kategori: "telefon-transkript",
    text: "Kund: jag heter Kajsa, det stavas k-a-j-s-a. Kajsa Lundmark alltså. Agent: Förlåt, kan du upprepa efternamnet, det brusar i linjen. Kund: L-u-n-d-m-a-r-k! Agent: Tack, nu hörde jag.",
    forvantad: ["Kajsa Lundmark", "k-a-j-s-a"],
  },
  {
    id: "telefon-transkript-05",
    kategori: "telefon-transkript",
    text: "Kund: du når mig på noll sju noll två ett fyra sex fem åtta, kan du läsa upp det tillbaka? Agent: Ja, noll sju noll två ett fyra sex fem åtta, stämmer det? Kund: japp, exakt så.",
    forvantad: ["noll sju noll två ett fyra sex fem åtta"],
  },
  {
    id: "telefon-transkript-06",
    kategori: "telefon-transkript",
    text: "Kund: jag bor på Maskeragatan 14... förlåt, jag menade Provdatagatan 14, så klart, i Göteborg. Agent: Okej, Provdatagatan 14, då ändrar jag det i systemet. Kund: ja tack, annars kommer ju breven fel igen.",
    forvantad: ["Provdatagatan 14"],
  },
  {
    id: "telefon-transkript-07",
    kategori: "telefon-transkript",
    text: "Agent: Kan jag få ditt personnummer och ett telefonnummer? Kund: visst, personnummer 850601-2387 och telefon 0701740650. Agent: Tack. Kund: ring helst efter klockan fem, jag jobbar skift.",
    forvantad: ["850601-2387", "0701740650"],
  },
  {
    id: "telefon-transkript-08",
    kategori: "telefon-transkript",
    text: "Kund: jag he- jag heter Bosse... Bosse Wetterqvist, och min fru Ingrid Wetterqvist står också på avtalet. Agent: Ska jag lägga till henne som kontaktperson? Kund: ja gör det, hon brukar ringa åt oss båda.",
    forvantad: ["Bosse Wetterqvist", "Ingrid Wetterqvist"],
  },
  {
    id: "telefon-transkript-09",
    kategori: "telefon-transkript",
    text: "Kund: min mejl, öh, det stavas m-a-r-i-a punkt e-k-l-u-n-d snabel-a hotmail punkt com. Agent: Okej, så maria punkt eklund på hotmail? Kund: ja precis, med k i eklund. Agent: Då är det noterat, tack Maria Eklund.",
    forvantad: ["m-a-r-i-a punkt e-k-l-u-n-d snabel-a hotmail punkt com", "Maria Eklund"],
  },
  {
    id: "telefon-transkript-10",
    kategori: "telefon-transkript",
    text: "Kund: hej det är kalle som ringer igen, vi pratades ju vid i förra veckan om elavtalet. Agent: Hej Kalle, vilket nummer ringer du ifrån? Kund: TEST-070 174 06 51, men jag byter snart operatör så ni får det nya sen.",
    forvantad: ["kalle", "070 174 06 51"],
  },
  {
    id: "telefon-transkript-11",
    kategori: "telefon-transkript",
    text: "Agent: Vilken adress ska teknikern till? Kund: adressen är Testkorpusvägen 7 B, andra våningen, portkoden får han vid dörren. Agent: Och personnumret för abonnemanget? Kund: det är sexsiosju elva noll fyra... alltså 000101-9801.",
    forvantad: ["Testkorpusvägen 7 B", "000101-9801"],
  },
  {
    id: "telefon-transkript-12",
    kategori: "telefon-transkript",
    text: "Kund: jag heter Åsa Ström... alltså Å-s-a, inte Osa, det blir alltid fel i era system. Agent: Förlåt, Åsa Ström med Å, nu är det rättat. Kund: äntligen, tack.",
    forvantad: ["Åsa Ström"],
  },
  {
    id: "telefon-transkript-13",
    kategori: "telefon-transkript",
    text: "Kund: mitt mobilnummer är noll sju tre nio... vänta... nej jag säger det med siffror istället: 070-1740652. Agent: Tack, då skickar jag sms dit. Kund: gör det.",
    forvantad: ["070-1740652"],
  },
  {
    id: "telefon-transkript-14",
    kategori: "telefon-transkript",
    text: "Agent: Vem har jag nöjet att prata med? Kund: Gun-Britt Törnros, med bindestreck alltså, Gun-Britt. Agent: Och e-posten? Kund: gun punkt britt snabel-a bredband punkt net, fast jag kollar den sällan, ring hellre.",
    forvantad: ["Gun-Britt Törnros", "gun punkt britt snabel-a bredband punkt net"],
  },
  {
    id: "telefon-transkript-15",
    kategori: "telefon-transkript",
    text: "Kund: personnumret är noll tre noll fyra noll fyra... ett två tre två. Agent: Kan du säga det med bindestreck? Kund: TEST-640823-3234. Agent: Perfekt, då hittade jag dig.",
    forvantad: ["640823-3234"],
  },
  {
    id: "telefon-transkript-16",
    kategori: "telefon-transkript",
    text: "Agent: Så ditt nummer är 070-174 06 53, har jag fattat rätt? Kund: ja, 070-174 06 53, exakt. Agent: Då ringer vi upp på det i eftermiddag. Kund: bra, svara gör jag i alla fall.",
    forvantad: ["070-174 06 53"],
  },
  {
    id: "telefon-transkript-17",
    kategori: "telefon-transkript",
    text: "Kund: hej det är Veronica Sande- *pip* ...hallå, försvann jag? Agent: Nej nej, jag hör dig, vi bröts en sekund. Kund: okej, numret är 070 174 06 55 om vi bryts igen, ring tillbaka dit. Agent: Absolut, Veronica.",
    forvantad: ["Veronica", "070 174 06 55"],
  },
  {
    id: "telefon-transkript-18",
    kategori: "telefon-transkript",
    text: "Kund: jag bor i Norge nu för tiden, så jag har norskt nummer, plus fyra sju, alltså +46 70 174 06 56. Agent: Då noterar jag det som utlandsnummer. Kund: ja, och namnet är förtäljt, Torbjörn Haugli, H-a-u-g-l-i.",
    forvantad: ["+46 70 174 06 56", "Torbjörn Haugli"],
  },
]
