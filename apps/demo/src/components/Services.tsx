import { GITHUB } from "../constants"
import { ArrowUpRightIcon, MaskeraMark } from "../icons"
import { navClick, viewPaths } from "../routing"
// Single source of truth: the same overview figure the README embeds.
import oversiktUrl from "../../../../docs/oversikt.svg"

const EMAIL = "work@joelhagvall.com"
const BOOKING = "https://calendly.com/joel-hagvall/30min"

function mailto(subject: string) {
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`
}

// utm_content shows up on the Calendly booking, so each card's clicks stay
// attributable to its package.
function booking(pkg: string) {
  return `${BOOKING}?utm_source=maskera_dev&utm_content=${pkg}`
}

type Pkg = {
  name: string
  price: string
  tagline: string
  points: string[]
  slug: string
  featured?: boolean
  note?: string
}

const PACKAGES: Pkg[] = [
  {
    name: "AI-integritetsgranskning",
    price: "från 7 500 kr",
    tagline: "Fast pris. Ni vet var ni står innan ni bygger vidare.",
    points: [
      "Genomgång av era AI-flöden: var personuppgifter kan nå externa tjänster",
      "Live-demo av maskering på er egen exempeldata",
      "Rekommenderad arkitektur och prioriterad åtgärdslista",
      "Fast offert på implementation, om ni vill gå vidare",
    ],
    slug: "granskning",
  },
  {
    name: "Integrationssprint",
    price: "från 25 000 kr",
    tagline: "3 till 5 arbetsdagar, fast pris.",
    featured: true,
    points: [
      "maskera integreras i ert flöde, före ChatGPT, Claude, supportverktyg eller analys",
      "Identifierare och regler anpassas för just er datatyp",
      "Mätning på er data: vad som fångas, före och efter anpassningen",
      "Tester, dokumentation och överlämning till ert team",
    ],
    slug: "sprint",
    // Time-limited scarcity claim: must be updated or removed no later than
    // the August launch post, and immediately once both pilot slots are
    // taken. A stale "pilotplatser kvar" reads as fake urgency.
    note: "2 pilotplatser kvar: från 19 000 kr, mot att projektet får användas som anonymiserat referenscase.",
  },
  {
    name: "Löpande avtal",
    price: "från 5 000 kr/mån",
    tagline: "För er som kör maskera i produktion.",
    points: [
      "Modelluppdateringar och stöd för nya typer av känsliga uppgifter",
      "Vi verifierar mot er datatyp vid varje uppdatering, så att träffsäkerheten inte försämras",
      "Kvartalsvis riskgenomgång av era AI-flöden, även sådana som tillkommer",
      "Prioriterad support",
    ],
    slug: "avtal",
  },
]

export function Services({ onBack, onDev }: { onBack: () => void; onDev: () => void }) {
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
        <article className="prose prose-wide">
          <h1>Tjänster</h1>
          <p className="prose-lede">
            Använder ni AI på text som kan innehålla personuppgifter? Jag hjälper er att hitta och
            maskera känsliga uppgifter lokalt, innan texten når externa AI-tjänster, loggar eller
            analysverktyg.
          </p>
          <p className="prose-sub">
            maskera är öppen källkod och gratis att använda. Behöver ni hjälp med implementationen
            erbjuder jag fasta tjänstepaket, och ni arbetar direkt med personen som byggt verktyget
            och tränat den svenska modellen.
          </p>

          <figure className="oversikt">
            <img
              src={oversiktUrl}
              alt="Översikt i tre steg: din text innehåller känsliga uppgifter som namn, personnummer och telefonnummer; maskera byter ut dem på din enhet med regler och en AI-modell, inget lämnar datorn; mottagaren ser bara platshållare som [NAMN]. Svaret får de riktiga uppgifterna tillbaka hos dig."
              width="1200"
              height="690"
              loading="lazy"
            />
          </figure>

          <div className="pkgs">
            {PACKAGES.map((p) => (
              <section key={p.name} className={`pkg${p.featured ? " featured" : ""}`}>
                <h2 className="pkg-name">{p.name}</h2>
                <p className="pkg-price">{p.price}</p>
                <p className="pkg-tag">{p.tagline}</p>
                <ul>
                  {p.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                {p.note && <p className="pkg-note">{p.note}</p>}
                <a className="pkg-cta" href={booking(p.slug)} target="_blank" rel="noreferrer">
                  Boka ett kostnadsfritt samtal
                </a>
              </section>
            ))}
          </div>

          <h2>Så går det till</h2>
          <ol className="how">
            <li>
              <strong>Mejla ett par rader</strong> om ert dataflöde: vilken typ av text, vart den
              skickas i dag och vad som oroar er. Inga bilagor eller persondata behövs.
            </li>
            <li>
              <strong>Kort samtal, kostnadsfritt.</strong> Vi går igenom flödet och jag visar direkt
              hur maskering skulle se ut på ett anonymiserat exempel som liknar er data.
            </li>
            <li>
              <strong>Fast offert.</strong> Tydligt avgränsad leverans till fast pris, inga löpande
              timmar utan tak. Passar det inte säger jag det också.
            </li>
          </ol>

          <h2>Innan ni köper, det finstilta</h2>
          <ul>
            <li>
              <strong>Maskering är riskminskning, inte en garanti.</strong> Uppgifter med bestämt
              format, som personnummer, fångas av regler och är mycket pålitligt. Namn och platser i
              löpande text bygger på en AI-modell som kan missa saker. Jag mäter och redovisar
              träffsäkerheten på er datatyp i stället för att lova hundra procent. Läs mer under{" "}
              <a href={viewPaths.transparency}>integritet &amp; transparens</a>.
            </li>
            <li>
              <strong>Ingen inlåsning.</strong> maskera är öppen källkod. Integrationskod,
              konfiguration och dokumentation som tas fram för er äger ni. Säger ni upp avtalet
              fortsätter er integration att fungera.
            </li>
            <li>
              <strong>All maskering körs hos er.</strong> I webbläsaren eller på er server. Er data
              passerar aldrig mig eller någon tredje part, inte ens under projektet.
            </li>
          </ul>

          <p className="prose-foot">
            <a href={booking("foot")} target="_blank" rel="noreferrer">
              Boka ett kostnadsfritt samtal
            </a>{" "}
            direkt i kalendern, eller mejla ett par rader om ert dataflöde:{" "}
            <a href={mailto("Maskera: tjänster")}>{EMAIL}</a>
          </p>
        </article>
      </main>
    </>
  )
}
