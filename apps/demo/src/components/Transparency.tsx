import { GITHUB, HF_MODEL } from "../constants"
import { ArrowUpRightIcon, MaskeraMark } from "../icons"
import { navClick, viewPaths } from "../routing"

export function Transparency({
  onBack,
  onDev,
  onServices,
}: {
  onBack: () => void
  onDev: () => void
  onServices: () => void
}) {
  return (
    <>
      <div className="topbar">
        <span className="wordmark">
          <MaskeraMark size={20} />
          maskera
        </span>
        <nav className="head-links">
          <a className="ghlink" href={viewPaths.dev} onClick={navClick(onDev)}>
            För utvecklare
          </a>
          <a className="ghlink" href={viewPaths.services} onClick={navClick(onServices)}>
            Tjänster
          </a>
          <a className="ghlink" href={GITHUB} target="_blank" rel="noreferrer">
            GitHub
            <ArrowUpRightIcon size={13} />
          </a>
        </nav>
      </div>
      <a className="back" href={viewPaths.demo} onClick={navClick(onBack)}>
        ← Tillbaka till startsidan
      </a>

      <main>
        <article className="prose">
          <h1>Integritet & transparens</h1>
          <p className="prose-lede">
            maskera är ett integritetsverktyg, och då ska korten ligga på bordet. Här är vad det
            gör, hur det fungerar, hur modellen har tränats och var gränserna går.
          </p>

          <h2>Hur fungerar det?</h2>
          <ul>
            <li>
              maskera läser texten och ersätter personuppgifter med platshållare, till exempel{" "}
              <code>[NAMN_1]</code> eller <code>[PERSONNUMMER_1]</code>. AI-tjänsten får bara
              platshållarna, och efteråt kan du sätta tillbaka originalen lokalt.
            </li>
            <li>
              <strong>Två skydd arbetar tillsammans.</strong> <strong>Regler</strong> hittar allt
              som har ett bestämt format: personnummer, organisationsnummer, telefonnummer och
              e-post. Det sker med matematisk säkerhet, till exempel via kontrollsiffran i ett
              personnummer.
            </li>
            <li>
              <strong>En liten AI-modell</strong> tar hand om resten: namn, platser och
              organisationer i löpande text. Tekniken kallas <strong>NER</strong> (“named entity
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

          <h2>Var din data tar vägen: ingenstans</h2>
          <ul>
            <li>
              <strong>All maskering sker på din enhet</strong>, i webbläsaren eller på din egen
              server (för utvecklare: WASM/WebGPU eller Node). Din text skickas{" "}
              <strong>aldrig</strong> någonstans för att maskeras.
            </li>
            <li>
              <strong>Ingen spårning av dig eller din text, inga cookies.</strong> Det enda sidan
              mäter är anonyma sidvisningar (Vercel Analytics, cookiefritt), och det anropet
              innehåller aldrig något du skrivit. Kontrollera själv i webbläsarens utvecklarverktyg
              under Network: skriv något på startsidan och se att din text inte utlöser ett enda
              anrop.
            </li>
            <li>
              <strong>De anrop som kan göras</strong>, för fullständighetens skull: med npm-paketets
              standardinställningar hämtas modellfilen en gång från Hugging Face och körmiljön från
              ett CDN. Båda är kod och modellvikter som hämtas en gång och cachas,{" "}
              <strong>aldrig din text</strong>. Allt går att lägga på egen server, och{" "}
              <strong>den här sidan gör precis det</strong>: modell, körmiljö och typsnitt ligger
              lokalt, så sidan gör inga anrop till tredje part.
            </li>
            <li>
              Själva regeldelen är vanlig kod utan AI-modell: den har{" "}
              <strong>inga nätverksberoenden alls</strong> och fungerar helt fristående.
            </li>
          </ul>

          <h2>Hur modellen tränats</h2>
          <ul>
            <li>
              <strong>Inga insamlade personuppgifter i träningen.</strong> Modellen tränades på
              maskingenererade meningar plus ett publikt, öppet licensierat nyhetsdataset:{" "}
              <strong>inga användardata, ingenting insamlat för det här projektet</strong>.
              Nyhetstexterna innehåller redan publicerade meningar om offentliga personer.
              Generatorn ligger öppen på GitHub.
            </li>
            <li>
              <strong>Basmodell:</strong> KB-BERT från Kungliga biblioteket, fri att använda (CC0).
              Vi har vidaretränat den för att hitta personuppgifter och sedan komprimerat den till
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

          <h2>Hur bra den är, ärligt</h2>
          <ul>
            <li>
              Öppet utvärderad mot både en handbyggd testuppsättning och ett oberoende publikt
              dataset. Siffror och förbehåll finns på GitHub, bland annat att träffsäkerheten
              sjunker på text som ligger långt från det modellen tränats på.
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
            exempel visar en verklig persons uppgifter. Här är varje värde, så att du kan
            kontrollera själv:
          </p>
          <ul>
            <li>
              <strong>Personnummer:</strong> <code>991201-2391</code>, <code>850601-2387</code>,{" "}
              <code>781101-2397</code> och <code>020301-2398</code> kommer alla ur{" "}
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
              <strong>Telefonnummer:</strong> <code>070-174 06 05</code>, <code>070-174 06 58</code>
              , <code>070-174 06 71</code> och <code>08-465 004 12</code> ligger i{" "}
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
              <strong>Vad den här webbplatsen samlar in:</strong> endast anonym, cookiefri
              besöksstatistik (Vercel Analytics) för att räkna sidvisningar. Inga cookies, ingen
              profilering, inga personuppgifter, och aldrig text du skriver i verktyget.
            </li>
            <li>
              <strong>Vad verktyget behandlar:</strong> ingenting lämnar din enhet. Text du maskerar
              behandlas lokalt i din webbläsare och skickas aldrig till oss eller till tredje part.
              Se avsnitten ovan för detaljer.
            </li>
            <li>
              <strong>Dina rättigheter:</strong> eftersom vi varken lagrar eller kan koppla data
              till dig finns inga personuppgifter att begära ut, rätta eller radera. Har du frågor,
              hör av dig via länken ovan.
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
