/**
 * Privacy-safe synthetic domain regression corpus.
 *
 * Structured values come from the authority/owner-published fixtures listed in
 * docs/TEST_DATA.md; addresses use conspicuous synthetic markers. The prose is
 * author-composed and was never sourced from customer, patient or case records.
 */

export default [
  {
    id: "blandat-webb-01",
    kategori: "blandat-webb",
    text: "Säljes: Husqvarna automower 310, köpt 2022, funkar utmärkt men vi flyttar till lägenhet. Pris 5500 kr, bud kommenteras inte. Hör av dig till Jörgen Ekström på 070-174 06 44, kan visa på Testkorpusvägen 14 i Östersund kvällstid.",
    forvantad: ["Jörgen Ekström", "070-174 06 44", "Testkorpusvägen 14"],
  },
  {
    id: "blandat-webb-02",
    kategori: "blandat-webb",
    text: "Köpte den här stavmixern i fredags och den höll exakt tre dagar innan den började ryka. Ringde kundtjänst och pratade med en Malin som lovade återköp men nu svarar ingen. Reklamerar den här, mitt ärendenummer är 4471-8820. /Veronica Salomonsson, person30@example.com",
    forvantad: ["Veronica Salomonsson", "person30@example.com", "Malin"],
  },
  {
    id: "blandat-webb-03",
    kategori: "blandat-webb",
    text: "hej! kul blogg som alltid. vi bor också i ett gammalt hus från 1912 och har exakt samma problem med drag i köket. hör gärna av dig om du hittar en bra hantverkare, jag nås på person31@example.com eller 0701740645. /kalle från arvika",
    forvantad: ["kalle", "person31@example.com", "0701740645"],
  },
  {
    id: "blandat-webb-04",
    kategori: "blandat-webb",
    text: "BOSTAD SÖKES: Ungdomspedagog, 34 år, söker 2:a eller 3:a i Gävle med omnejd, helst lugn trappuppgång. Fast anställning sedan 2019, inga husdjur, rökfri. Kan flytta in från 1 november. Kontakt: Ahmed Al-Rashid, 070 174 06 46, person32@example.com. Referenser lämnas av nuvarande hyresvärd Stig Brundin.",
    forvantad: ["Ahmed Al-Rashid", "070 174 06 46", "person32@example.com", "Stig Brundin"],
  },
  {
    id: "blandat-webb-05",
    kategori: "blandat-webb",
    text: "Insändare: Det är anmärkningsvärt att kommunen än en gång höjer parkeringsavgifterna i centrum samtidigt som busslinje 4 dras in. Vi som bor på Påhittsgatan 22 och inte har bil straffas dubbelt. Skrivet av Maj-Britt Hedlund, 070-1740647, i protest.",
    forvantad: ["Påhittsgatan 22", "Maj-Britt Hedlund", "070-1740647"],
  },
  {
    id: "blandat-webb-06",
    kategori: "blandat-webb",
    text: "säljer en trekko från lundberg, 6 mån gammal, nypris 3800 säljer för 2000 pga tidsbrist. hämtas i umeå, skriv här eller messa till sebastian 070-174 06 48",
    forvantad: ["sebastian", "070-174 06 48"],
  },
  {
    id: "blandat-webb-07",
    kategori: "blandat-webb",
    text: "★★☆☆☆ Beställde i måndags, skulle levereras onsdag, kom lördag — och då var kartongen öppnad. Kundtjänst hänvisade mellan varandra i fyra dagar. Till slut fick jag tag på Therese Sandberg som faktiskt löste det på tio minuter, henne ska all cred gå. Men jag handlar inte här igen. – Daniel Östlund, person33@example.com, 0701740649",
    forvantad: ["Therese Sandberg", "Daniel Östlund", "person33@example.com", "0701740649"],
  },
  {
    id: "blandat-webb-08",
    kategori: "blandat-webb",
    text: "Ledsen att höra om era problem! Vi hade samma strul med vår värmepump och det visade sig vara ett fel på expansionsventilen. Vår installatör Hasan kom på det direkt. Bor du i närheten av Falköping kan jag rekommendera honom varmt. Hälsningar Ingrid på Provdatagatan 8, person34@example.com",
    forvantad: ["Ingrid", "Provdatagatan 8", "person34@example.com", "Hasan"],
  },
  {
    id: "blandat-webb-09",
    kategori: "blandat-webb",
    text: "SÖKES: 1:a eller 2:a för uthyrning, gärna Södermalm eller nära pendel. Jag är 28, jobbar som sjuksköterska på natt, behöver det tyst dagtid. Pnr för kreditupplysning: 850623-2381. Nås bäst på person35@example.com. Mvh Elin Nyström",
    forvantad: ["850623-2381", "person35@example.com", "Elin Nyström"],
  },
  {
    id: "blandat-webb-10",
    kategori: "blandat-webb",
    text: "Insändaren om cykelbanan vid ån: Författaren, som uppenbarligen inte cyklar, föreslår att vi ska dela väg med bussarna. Jag har cyklat sträckan dagligen i elva år och blivit påkörd en gång — av en bil som svängde ut från just den rastplats som nu föreslås bli infart. Tänk om, tänk rätt. Lennart Sjöqvist, Maskeravägen 3, Katrineholm",
    forvantad: ["Lennart Sjöqvist", "Maskeravägen 3"],
  },
  {
    id: "blandat-webb-11",
    kategori: "blandat-webb",
    text: "Byter min Toyota Auris -16 mot mindre bil + mellanskillnad, eller säljer för 89 000. Gått 11 200 mil, nyservad, sommar+vinterdäck. Ring gunnar på 070-1740651 helst efter kl 17, bor i Skellefteå. Bara seriösa tack!!",
    forvantad: ["gunnar", "070-1740651"],
  },
  {
    id: "blandat-webb-12",
    kategori: "blandat-webb",
    text: "Den här espressoautomaten är värd varenda krona. Min fru Camilla var skeptisk först men nu gör hon tre koppar om dagen. Enda minus: vattentanken är lite bökig att fylla. Vi testade mot vår gamla DeLonghi och skillnaden är enorm. Rekommenderas! /Patrik Lundqvist",
    forvantad: ["Camilla", "Patrik Lundqvist"],
  },
  {
    id: "blandat-webb-13",
    kategori: "blandat-webb",
    text: "fy fan för den här leveranstjänsten alltså. paketet stod ute i regnet, kvittensen låg i grannens brevlåda på Testkorpusvägen 11 (jag bor på 9!). mailat dem tre gånger utan svar. mitt nr är 070-174 06 52 om nån på företaget läser det här, ring mig. Sara W",
    forvantad: ["Testkorpusvägen 11", "070-174 06 52", "Sara"],
  },
  {
    id: "blandat-webb-14",
    kategori: "blandat-webb",
    text: 'Tack för en fin text om föräldraledighet. Jag var hemma nio månader med vår son och min partner Nils tog resten, och ändå är det jag som får frågan "men vem tar hand om honom nu?". Tröttsamt. Vi bor i Visby för övrigt, där är förskolesituationen bättre än du beskriver. Med vänlig hälsning, Åsa Lindblom-Karlsson, person36@example.com',
    forvantad: ["Nils", "Åsa Lindblom-Karlsson", "person36@example.com"],
  },
  {
    id: "blandat-webb-15",
    kategori: "blandat-webb",
    text: "Säljer 4 st vinterdäck på fälg (205/55 R16), suttit på en Golf, två säsonger körda. 1200 kr för alla. Hämtas hos mig, Bo Andreasson, på Påhittsvägen 27 i Karlskrona. Sms:a 0701740653, svarar inte på okända samtal.",
    forvantad: ["Bo Andreasson", "Påhittsvägen 27", "0701740653"],
  },
  {
    id: "blandat-webb-16",
    kategori: "blandat-webb",
    text: 'Varning för "hantverkaren" som annonserat här tidigare. Han tog 8000 i förskott för att byta takpannor och har inte synt till på tre veckor, telefonen är avstängd. Jag har polisanmält, mitt referensnummer hos polisen kan ni få om ni mailar mig: person37@example.com. Sprid vidare så ingen annan blir lurad. Britt Göransson, 1949 års modell, pnr 000101-9801 för den som tvivlar på att jag är äkta.',
    forvantad: ["person37@example.com", "Britt Göransson", "000101-9801"],
  },
  {
    id: "blandat-webb-17",
    kategori: "blandat-webb",
    text: "Bostad bytes! Har 3:a om 74 kvm på Provdatagatan 15 i Malmö med balkong i söder, söker 4:a eller större i samma område, barnen behöver varsitt rum. Hyra 11 400. Bara seriösa förfrågningar. Kontakta mig, Farhad Karimi, person38@example.com eller 070 174 06 54.",
    forvantad: ["Provdatagatan 15", "Farhad Karimi", "person38@example.com", "070 174 06 54"],
  },
  {
    id: "blandat-webb-18",
    kategori: "blandat-webb",
    text: "Insändare: När ska politiken förstå att landsbygden behöver sina skolor? Min dotter åker 4 mil enkel resa till skolan sedan klasserna på vår by ska slås ihop. Jag har skrivit till kommunen fyra gånger, nås på person39@example.com om någon där vill svara. Nästa val vet vi var vi lägger rösten. Torbjörn Åhl, 070-1740655",
    forvantad: ["person39@example.com", "Torbjörn Åhl", "070-1740655"],
  },
]
