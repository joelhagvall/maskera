import { ArrowUpRightIcon } from "../icons"
import type { View } from "../routing"
import { navClick, viewPaths } from "../routing"
import { TopBar } from "./TopBar"

const EMAIL = "hej@maskera.dev"
const BOOKING = "https://calendly.com/joel-hagvall/30min"
const CLOUD = "https://app.maskera.dev"

function mailto(subject: string) {
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`
}

function booking(pkg: string) {
  return `${BOOKING}?utm_source=maskera_dev&utm_content=${pkg}`
}

function cloud(path: string, content: string) {
  const url = new URL(path, CLOUD)
  url.searchParams.set("utm_source", "maskera_dev")
  url.searchParams.set("utm_medium", "referral")
  url.searchParams.set("utm_content", content)
  return url.href
}

type Product = {
  name: string
  price: string
  /** The low-commitment entry offer, shown as a second price line under the
      annual anchor so the realistic first purchase reads as a price, not a
      sentence. Terms carry the credit condition in quieter type. */
  pilot?: { price: string; terms: string }
  tagline: string
  points: string[]
  cta: string
  href: string
  featured?: boolean
  view?: View
  note?: string
}

const PRODUCTS: Product[] = [
  {
    name: "Open source",
    price: "0 kr",
    tagline: "För team som vill äga integration och drift själva.",
    points: [
      "Kör i webbläsaren eller Node",
      "Text och återställningsnyckel stannar i er miljö",
      "MIT-licens, utan användningsavgift eller inlåsning",
      "Svensk modell och färdiga regler för vanliga personuppgifter",
    ],
    cta: "Installera och kom igång",
    href: viewPaths.dev,
    view: "dev",
  },
  // Gateway is featured: it is the product on sale today.
  {
    name: "Maskera Gateway",
    price: "149 000 kr/år",
    pilot: {
      price: "60 dagars pilot: 49\u00a0000 kr",
      terms: "Hela beloppet avräknas mot årslicensen vid köp inom 30 dagar.",
    },
    tagline: "För verksamheter som behöver köra i sin egen miljö.",
    featured: true,
    points: [
      "Signerad container för Docker eller Kubernetes",
      "Maskerar AI-trafiken innan den lämnar ert nätverk",
      "Ingen GPU eller databas; den svenska modellen på 43\u00a0MB ingår",
      "Central policy, företagsinloggning och säkerhetsuppdateringar",
    ],
    cta: "Läs om Gateway",
    href: cloud("/gateway", "business_gateway"),
    note: "Startnivå: 2 CPU-kärnor och 2\u00a0GB RAM. Priser exkl. moms.",
  },
  // Maskera Cloud is deliberately not offered while the product line is
  // Gateway-first (decision 2026-07-25). Reinstate this card — and the Cloud
  // row in the choice table below, plus the third .pkgs grid column in
  // styles.css — if hosted demand materialises.
  // {
  //   name: "Maskera Cloud",
  //   price: "från 0 kr",
  //   tagline: "För team som vill komma igång utan egen drift.",
  //   points: [
  //     "Färdigt API, klart att integrera direkt",
  //     "Er befintliga OpenAI-kod fungerar: byt bara adressen",
  //     "Bearbetning i minnet hos ett EU-ägt bolag i EU",
  //     "Ingen lagring av innehållet i era anrop",
  //   ],
  //   cta: "Se priser för Cloud",
  //   href: cloud("/pricing", "business_cloud"),
  // },
]

const GATEWAY_FLOW = [
  "Er applikation: originaltext",
  "Gateway: maskerar i er miljö",
  "AI-tjänsten: endast skyddad text",
  "Gateway: återställer svaret",
] as const

function ProductCard({ product, go }: { product: Product; go: (view: View) => void }) {
  const onClick = product.view ? navClick(() => go(product.view as View)) : undefined
  // Cloud and Gateway leave for the customer portal on another subdomain.
  // The two sites deliberately share one visual identity, so each leaving
  // button says so itself: the same outbound arrow the GitHub link uses,
  // plus the destination right under the button. A single note below all
  // three cards read as an afterthought and got missed.
  const external = product.href.startsWith("http")

  return (
    <section className={`pkg${product.featured ? " featured" : ""}`}>
      <h2 className="pkg-name">{product.name}</h2>
      <p className="pkg-price">{product.price}</p>
      {product.pilot && (
        <p className="pkg-pilot">
          <span className="pkg-pilot-price">{product.pilot.price}</span>
          <span className="pkg-pilot-terms">{product.pilot.terms}</span>
        </p>
      )}
      <p className="pkg-tag">{product.tagline}</p>
      <ul>
        {product.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      {product.note && <p className="pkg-note">{product.note}</p>}
      <a className="pkg-cta" href={product.href} onClick={onClick}>
        {product.cta}
        {external && <ArrowUpRightIcon size={13} />}
      </a>
      {/* Ghost copy on the internal card keeps all three CTA rows on one
          baseline; without it the outbound cards' captions push their
          buttons up relative to the open source card's. */}
      <p className={`pkg-dest${external ? "" : " pkg-dest-ghost"}`} aria-hidden={!external}>
        Öppnas på app.maskera.dev, Maskeras kundportal
      </p>
    </section>
  )
}

export function Services({ go }: { go: (view: View) => void }) {
  return (
    <>
      <TopBar current="services" go={go} />

      <main id="main-content">
        <article className="prose prose-wide">
          <h1>Maskera för företag</h1>
          <p className="prose-lede">
            Börja gratis och kör själva, eller installera Maskera Gateway i er egen miljö. Samma
            svenska maskering, två sätt att ta den till produktion.
          </p>
          <p className="prose-sub">
            Open source-versionen kan ni börja med direkt. Gateway säljs via pilot — boka en
            genomgång så kommer ni igång.
          </p>

          <div className="pkgs">
            {PRODUCTS.map((product) => (
              <ProductCard key={product.name} product={product} go={go} />
            ))}
          </div>

          <h2>Vilket alternativ passar er?</h2>
          <div
            className="choice-table"
            role="region"
            aria-label="Jämförelse av Maskeras driftformer"
          >
            <dl>
              <div>
                <dt>Ni vill ha full kontroll och kan drifta själva</dt>
                <dd>Välj open source.</dd>
              </div>
              <div>
                <dt>Text och återställningsnycklar måste stanna i er miljö</dt>
                <dd>Välj Maskera Gateway.</dd>
              </div>
              {/* The Cloud row returns with the Cloud card above if hosted
                  demand materialises.
              <div>
                <dt>Ni vill integrera snabbt och slippa egen drift</dt>
                <dd>Välj Maskera Cloud.</dd>
              </div>
              */}
            </dl>
          </div>

          <h2>Så skyddar Gateway AI-flödet</h2>
          <p>
            Varje AI-anrop som ni skickar genom Gateway maskeras före den godkända AI-tjänsten.
            Originaltexten och återställningsnyckeln stannar i er miljö.
          </p>
          <div className="flow-band">
            <p className="flow-band-label">Dataflöde för Gateway</p>
            <div className="flow">
              {GATEWAY_FLOW.map((step, index) => (
                <span className="flow-item" key={step}>
                  {index > 0 ? (
                    <span className="flow-arrow" aria-hidden="true">
                      →
                    </span>
                  ) : null}
                  <span className="flow-step">{step}</span>
                </span>
              ))}
            </div>
          </div>

          <h2>Bra att veta innan ni väljer</h2>
          <ul>
            <li>
              <strong>Maskering minskar risk, men är inte en garanti.</strong> Namn och platser i
              löpande text identifieras av en AI-modell som kan missa uppgifter. Träffsäkerheten
              mäts öppet och löften om hundra procent undviks. Läs mer under{" "}
              <a href={viewPaths.transparency}>integritet &amp; transparens</a>.
            </li>
            <li>
              <strong>Ingen inlåsning i kärnan.</strong> Open source-paketen är MIT-licensierade och
              fortsätter fungera även om ni inte köper Gateway eller konsultstöd.
            </li>
          </ul>

          <h2>Behöver ni hjälp med införandet?</h2>
          <section className="implementation-help">
            <p>
              <strong>Teknisk onboarding och anpassad integration</strong> erbjuds separat, från
              25&nbsp;000 kr exkl. moms. Jag hjälper ert team att koppla Maskera till rätt flöde och
              lämnar över tester och dokumentation.
            </p>
            <a className="pkg-cta" href={booking("implementation")}>
              Boka ett införandesamtal
            </a>
          </section>

          <p className="prose-foot">
            Osäkra på vilket alternativ som passar? Mejla{" "}
            <a href={mailto("Maskera för företag")}>{EMAIL}</a> eller{" "}
            <a href={booking("business_foot")}>boka ett kostnadsfritt samtal</a>.
          </p>
        </article>
      </main>
    </>
  )
}
