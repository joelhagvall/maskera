import { GITHUB, HF_MODEL } from "../constants"
import { ArrowUpRightIcon } from "../icons"
import type { View } from "../routing"
import { Coverage } from "./Coverage"
import { TopBar } from "./TopBar"

export function Transparency({ go }: { go: (view: View) => void }) {
  return (
    <>
      <TopBar current="transparency" go={go} />

      <main id="main-content">
        <article className="prose">
          <h1>Integritet & transparens</h1>
          <p className="prose-lede">
            maskera är ett integritetsverktyg, och då ska korten ligga på bordet. Här är vad det
            gör, hur det fungerar, hur modellen har tränats och var gränserna går.
          </p>

          <nav className="toc" aria-label="Innehåll på sidan">
            <p>På den här sidan</p>
            <ul>
              <li>
                <a href="#hur-fungerar">Hur fungerar det?</a>
              </li>
              <li>
                <a href="#vad-maskeras">Vad maskeras?</a>
              </li>
              <li>
                <a href="#dataflode">Så behandlas din text</a>
              </li>
              <li>
                <a href="#modelltraning">Hur modellen tränats</a>
              </li>
              <li>
                <a href="#begransningar">Hur bra den är, ärligt</a>
              </li>
              <li>
                <a href="#testdata">Testdata i exemplen</a>
              </li>
              <li>
                <a href="#integritetspolicy">Integritetspolicy</a>
              </li>
            </ul>
          </nav>

          <h2 id="hur-fungerar">Hur fungerar det?</h2>
          <ul>
            <li>
              maskera läser texten och ersätter de personuppgifter som upptäcks med platshållare,
              till exempel <code>[NAMN_1]</code> eller <code>[PERSONNUMMER_1]</code>. AI-tjänsten
              ser platshållarna i stället för de upptäckta uppgifterna. Efteråt kan du sätta
              tillbaka originalen lokalt.
            </li>
            <li>
              <strong>Två skydd arbetar tillsammans.</strong> <strong>Regler</strong> letar efter
              personuppgifter med fasta format, som personnummer, organisationsnummer, telefonnummer
              och e-post. Kontrollsiffror verifieras när formatet har dem. Andra uppgifter hittas
              med mönster och rimlighetskontroller.
            </li>
            <li>
              <strong>En liten AI-modell</strong> tar hand om resten: namn, platser, organisationer
              och adresser i löpande text. Tekniken kallas <strong>NER</strong> (“named entity
              recognition”). Modellen har lärt sig att utifrån sammanhanget avgöra <em>att</em> ett
              ord är ett namn eller en plats, även namn den aldrig har sett förut. Det är därför
              fasta sökmönster inte räcker: det går inte att lista alla namn som finns.
            </li>
            <li>
              Modellen är så liten att den kan <strong>köras direkt i webbläsaren</strong>, med
              samma teknik som driver lokal AI på din enhet, så texten behöver aldrig skickas iväg
              för att analyseras.
            </li>
          </ul>

          <Coverage />

          <h2 id="dataflode">Så behandlas din text</h2>
          <ul>
            <li>
              <strong>All maskering sker på din enhet</strong>, i webbläsaren eller på din egen
              server (för utvecklare: WASM/WebGPU eller Node). Texten och återställningsnyckeln
              skickas inte till Maskera eller någon annan tjänst för att maskeras.
            </li>
            <li>
              <strong>Webbstatistiken är anonym och cookiefri.</strong> Vercel Analytics räknar
              sidvisningar utan att ta emot texten du skriver. Texten i verktyget utlöser inga
              analysanrop.
            </li>
            <li>
              <strong>Webbhotellet hanterar tekniska anropsuppgifter.</strong> Vercel kan behandla
              uppgifter som IP-adress för att leverera och skydda webbplatsen. Texten du skriver och
              återställningsnyckeln ingår inte i dessa anrop.
            </li>
            <li>
              <strong>De anrop som kan göras</strong>, för fullständighetens skull: med npm-paketets
              standardinställningar hämtas modellfilen en gång från Hugging Face och körmiljön från
              ett CDN. Båda är kod och modellvikter som hämtas en gång och cachas,{" "}
              <strong>aldrig din text</strong>. Allt går att lägga på egen server. På den här sidan
              levereras modell, körmiljö och typsnitt från samma webbplats.
            </li>
            <li>
              Själva regeldelen är vanlig kod utan AI-modell: den har{" "}
              <strong>inga nätverksberoenden alls</strong> och fungerar helt fristående.
            </li>
          </ul>

          <h2 id="modelltraning">Hur modellen tränats</h2>
          <ul>
            <li>
              <strong>Inga insamlade personuppgifter i träningen.</strong> Modellen tränades på
              maskingenererade meningar plus sex publika, öppet licensierade korpusar (CC BY 4.0)
              med redan publicerad text:
              <ul>
                <li>
                  <a
                    href="https://github.com/klintan/swedish-ner-corpus"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Swedish NER Corpus
                  </a>{" "}
                  (nyheter)
                </li>
                <li>
                  <a
                    href="https://huggingface.co/datasets/KBLab/sucx3_ner"
                    target="_blank"
                    rel="noreferrer"
                  >
                    SUCX 3.0
                  </a>{" "}
                  (blandade genrer, KBLab)
                </li>
                <li>
                  <a
                    href="https://huggingface.co/datasets/AmazonScience/massive"
                    target="_blank"
                    rel="noreferrer"
                  >
                    MASSIVE
                  </a>{" "}
                  (chattmeningar)
                </li>
                <li>
                  <a
                    href="https://spraakbanken.gu.se/resurser/sic2"
                    target="_blank"
                    rel="noreferrer"
                  >
                    SIC2
                  </a>{" "}
                  (bloggtext)
                </li>
                <li>
                  <a
                    href="https://huggingface.co/datasets/MultiCoNER/multiconer_v2"
                    target="_blank"
                    rel="noreferrer"
                  >
                    MultiCoNER v2
                  </a>{" "}
                  (uppslagstext)
                </li>
                <li>
                  foruminlägg ur Språkbankens{" "}
                  <a
                    href="https://spraakbanken.gu.se/resurser/flashback"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Flashback
                  </a>
                  - och{" "}
                  <a
                    href="https://spraakbanken.gu.se/resurser/familjeliv"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Familjeliv
                  </a>
                  -korpusar
                </li>
              </ul>
              <strong>Inga användardata, ingenting insamlat för det här projektet.</strong> Exakta
              urval och andelar finns på{" "}
              <a href={HF_MODEL} target="_blank" rel="noreferrer">
                modellkortet
              </a>
              , och generatorn ligger öppen på GitHub.
            </li>
            <li>
              <strong>Basmodell:</strong> KB-BERT från Kungliga biblioteket, fri att använda (CC0).
              Jag har vidaretränat den för att hitta personuppgifter och sedan komprimerat den till
              en mindre modell, som ligger öppet på{" "}
              <a href={HF_MODEL} target="_blank" rel="noreferrer">
                Hugging Face
              </a>
              .
            </li>
            <li>
              <strong>Hela kedjan går att göra om från grunden.</strong> Data, träning,
              komprimering, export och utvärdering är skript som ligger öppet på GitHub. Inget är
              gömt.
            </li>
          </ul>

          <h2 id="begransningar">Hur bra den är, ärligt</h2>
          <ul>
            <li>
              Öppet utvärderad mot både en handbyggd testuppsättning och ett oberoende publikt
              dataset. Siffror och förbehåll finns på GitHub, bland annat att träffsäkerheten
              sjunker på text som ligger långt från det modellen tränats på.
            </li>
            <li>
              <strong>Kända svaga punkter</strong>, verifierade mot samma pipeline som demon kör:
              tabellartade dumpar, till exempel skannade listor med efternamnet först i kolumner,
              kan läcka namn, och uppgifter skrivna med bokstäver ("noll sju noll …") fångas inte
              alls, eftersom reglerna letar efter siffror. Versaler, gemener, felstavningar,
              chattspråk och slarviga nummerformat klarar den däremot. Prova själv i demon.
            </li>
            <li>
              <strong>Det är ett extra skyddslager, inte en garanti.</strong> Uppgifter med bestämt
              format, som personnummer och organisationsnummer, hittas av reglerna och är mycket
              pålitligt. Namn och platser i löpande text bygger på modellen och{" "}
              <strong>den kommer att missa saker</strong>. Behåll dina övriga kontroller.
            </li>
            <li>
              maskera är ett <strong>verktyg för dataminimering</strong> som stödjer arbetet med
              GDPR, men det är <strong>ingen garanti för regelefterlevnad</strong> och gör inga
              juridiska utfästelser. Du är fortsatt personuppgiftsansvarig.
            </li>
          </ul>

          {/* The concrete values below must stay in sync with the example
              texts in scenarios.ts: the whole point is that a visitor can
              cross-check every identifier shown in the demo against its
              source. */}
          <h2 id="testdata">Testdata i exemplen</h2>
          <p className="prose-body">
            Personerna i exempeltexterna är påhittade, och varje uppgift med ett riktigt format är
            ett värde som den ansvariga aktören själv har reserverat för test och fiktion. Inget
            exempel visar en verklig persons uppgifter. Några värden är med flit slarvigt skrivna i
            exemplen (tolv siffror, mellanslag i stället för bindestreck, versaler), eftersom riktig
            text ser ut så. Här är varje värde, så att du kan kontrollera själv:
          </p>
          <ul>
            <li>
              <strong>Personnummer:</strong> <code>991201-2391</code>, <code>850601-2387</code>,{" "}
              <code>781101-2397</code>, <code>020301-2398</code> och <code>640823-3234</code> kommer
              alla ur{" "}
              <a
                href="https://www.skatteverket.se/omoss/digitalasamarbeten/omvaraoppnadata/testpersonnummersomoppendata.4.5b35a6251761e6914202df9.html"
                target="_blank"
                rel="noreferrer"
              >
                Skatteverkets öppna testpersonnummer
              </a>
              , utgivna just för att användas i test och demonstrationer.
            </li>
            <li>
              <strong>Organisationsnummer:</strong> <code>202100-4748</code> tillhör den fiktiva{" "}
              <em>Kommun A</em> i{" "}
              <a
                href="https://www7.skatteverket.se/portal-wapi/open/apier-och-oppna-data/utvecklarportalen/v1/getFile/tjanstebeskrivning-folkbokforingsuppgifter-for-offentliga-aktorer-v3/pdf/1.0.3/tjanstebeskrivning-folkbokforingsuppgift-offentliga-aktorer-v3.pdf"
                target="_blank"
                rel="noreferrer"
              >
                Skatteverkets testdokumentation för Navet
              </a>
              .
            </li>
            <li>
              <strong>Telefonnummer:</strong> <code>070-174 06 05</code>, <code>070-174 06 32</code>
              , <code>070-174 06 58</code>, <code>070-174 06 71</code> och{" "}
              <code>08-465 004 12</code> ligger i{" "}
              <a
                href="https://pts.se/internet-och-telefoni/telefonnummer-och-adressering/telefonnummer-till-bocker-och-filmer/"
                target="_blank"
                rel="noreferrer"
              >
                PTS nummerserier reserverade för böcker och film
              </a>
              , som aldrig delas ut till abonnenter.
            </li>
            <li>
              <strong>Kort-, konto- och gironummer:</strong> kortnumret{" "}
              <code>4242 4242 4242 4242</code> är{" "}
              <a href="https://docs.stripe.com/testing" target="_blank" rel="noreferrer">
                Stripes publicerade testkort
              </a>
              , IBAN <code>SE42 8000 0890 1191 4616 8423</code> är{" "}
              <a
                href="https://www.swedbank.se/foretag/betala-och-ta-betalt/betala/fakturahantering/betala-via-fil/mig.html"
                target="_blank"
                rel="noreferrer"
              >
                Swedbanks testkonto för filvalidering
              </a>{" "}
              och bankgiro <code>991-2346</code> är{" "}
              <a
                href="https://www.bankgirot.se/kundservice/exempelfiler/"
                target="_blank"
                rel="noreferrer"
              >
                Bankgirots eget exempelvärde
              </a>
              .
            </li>
            <li>
              <strong>E-postadresser:</strong> alla använder <code>example.com</code>, en av{" "}
              <a href="https://www.iana.org/help/example-domains" target="_blank" rel="noreferrer">
                IANA:s reserverade exempeldomäner
              </a>{" "}
              som aldrig kan tillhöra någon.
            </li>
            <li>
              <strong>Adresser:</strong> Påhittsgatan och Påhittsvägen finns inte, och{" "}
              <code>123 45</code> är exempelpostnumret i{" "}
              <a
                href="https://www.postnord.se/siteassets/-pdf/ovrigt/skicka-ratt-med-postnord-20260126.pdf"
                target="_blank"
                rel="noreferrer"
              >
                PostNords egen adresseringsguide
              </a>
              .
            </li>
          </ul>

          <h2 id="integritetspolicy">Integritetspolicy</h2>
          <ul>
            <li>
              <strong>Personuppgiftsansvarig:</strong> Joel Hägvall. Kontakt sker via{" "}
              <a href="https://joelhagvall.com" target="_blank" rel="noreferrer">
                joelhagvall.com
              </a>
              .
            </li>
            <li>
              <strong>Webbstatistik:</strong> Vercel Analytics räknar sidvisningar med anonym,
              cookiefri statistik utan profilering. Statistiken innehåller aldrig texten du skriver
              i verktyget.
            </li>
            <li>
              <strong>Hosting:</strong> Vercel kan behandla tekniska anropsuppgifter, som IP-adress,
              för att leverera webbplatsen och skydda den mot angrepp. Texten och
              återställningsnyckeln ingår inte.
            </li>
            <li>
              <strong>En inställning sparas lokalt:</strong> växlar du till mörkt läge sparas valet
              i webbläsarens egen lagring (localStorage), så att det ligger kvar till nästa besök.
              Det är ingen cookie, det lämnar aldrig din enhet och det går inte att koppla till dig.
            </li>
            <li>
              <strong>Vad verktyget behandlar:</strong> texten och återställningsnyckeln behandlas
              lokalt i din webbläsare. De skickas inte till mig eller någon annan tjänst för
              maskering.
            </li>
            <li>
              <strong>Dina rättigheter:</strong> har du frågor om webbplatsens behandling av
              personuppgifter eller vill använda dina rättigheter, hör av dig via länken ovan.
            </li>
          </ul>

          <p className="prose-foot">
            Fullständig version (med FAQ) och all källkod finns på GitHub.{" "}
            <a href={`${GITHUB}/blob/main/docs/TRANSPARENCY.md`} target="_blank" rel="noreferrer">
              Läs hela dokumentet
              <ArrowUpRightIcon size={13} />
            </a>
          </p>
        </article>
      </main>
    </>
  )
}
