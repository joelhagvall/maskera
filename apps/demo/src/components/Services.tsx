import copy from "../i18n/sv.json"
import { ArrowUpRightIcon } from "../icons"
import type { View } from "../routing"
import { navClick, viewPaths } from "../routing"
import { TopBar } from "./TopBar"

const EMAIL = "hej@maskera.dev"
const BOOKING = "https://calendly.com/joel-hagvall/30min"
const PORTAL = "https://app.maskera.dev"

function mailto(subject: string) {
  return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}`
}

function booking(pkg: string) {
  return `${BOOKING}?utm_source=maskera_dev&utm_content=${pkg}`
}

function portal(path: string, content: string) {
  const url = new URL(path, PORTAL)
  url.searchParams.set("utm_source", "maskera_dev")
  url.searchParams.set("utm_medium", "referral")
  url.searchParams.set("utm_content", content)
  return url.href
}

type Product = {
  name: string
  price: string
  /** The low-commitment entry offer and the card's PRIMARY price line: the
      pilot is the realistic first purchase (same narrative as
      app.maskera.dev/pricing), so it renders big and the annual license
      becomes the secondary line under it. Terms carry the credit condition
      in quieter type. */
  pilot?: { price: string; terms: string }
  tagline: string
  points: string[]
  cta: string
  href: string
  secondaryCta?: string
  secondaryHref?: string
  destination?: string
  featured?: boolean
  view?: View
  note?: string
}

const PRODUCTS: Product[] = [
  // Gateway is featured: it is the product on sale today.
  {
    name: "Maskera Gateway",
    price: "149 000 kr/år",
    pilot: {
      price: "60-dagars pilot: 49\u00a0000 kr",
      terms:
        "Hela beloppet dras av från den första årslicensen när samma organisation köper den inom 30 dagar efter pilotens slut.",
    },
    tagline: "För verksamheter som vill ha en signerad leverans, gemensamma regler och support.",
    featured: true,
    points: [
      "Signerad container för Docker eller Kubernetes",
      "Maskerar AI-trafiken innan den lämnar ert nätverk",
      "Ingen GPU eller databas; den svenska modellen på 43\u00a0MB ingår",
      "Gemensamma regler, företagsinloggning och säkerhetsuppdateringar",
    ],
    cta: copy.services.gatewayInterestCta,
    href: mailto(copy.services.gatewayInterestSubject),
    secondaryCta: copy.services.gatewayDocsCta,
    secondaryHref: portal("/gateway", "business_gateway"),
    destination: copy.services.gatewayContactNote,
    note: "Kör i er miljö på så lite som 2 CPU-kärnor och 2\u00a0GB RAM. Priser exkl. moms.",
  },
  {
    name: "Öppen källkod",
    price: "0 kr",
    tagline: "För team som vill bygga och underhålla integrationen själva.",
    points: [
      "Kör i webbläsaren eller Node",
      "Texten och nyckeln med originaluppgifterna stannar i er miljö",
      "MIT-licens, utan användningsavgift eller inlåsning",
      "Svensk modell och färdiga regler för vanliga personuppgifter",
    ],
    cta: "Installera och kom igång",
    href: viewPaths.dev,
    view: "dev",
  },
]

const GATEWAY_FLOW = [
  "Er applikation: originaltext",
  "Gateway: maskerar i er miljö",
  "AI-tjänsten: endast maskerad text",
  "Gateway: återställer svaret",
] as const

function ProductCard({ product, go }: { product: Product; go: (view: View) => void }) {
  const onClick = product.view ? navClick(() => go(product.view as View)) : undefined
  // Gateway interest goes directly to email; only the secondary docs action
  // leaves for the customer portal, marked by the outbound arrow.
  const external = product.href.startsWith("http")
  const secondaryExternal = product.secondaryHref?.startsWith("http") ?? false

  return (
    <section className={`pkg${product.featured ? " featured" : ""}`}>
      <h2 className="pkg-name">{product.name}</h2>
      {product.pilot ? (
        <>
          <p className="pkg-price">{product.pilot.price}</p>
          <p className="pkg-pilot">
            <span className="pkg-annual">Årslicens: {product.price}</span>
            <span className="pkg-pilot-terms">{product.pilot.terms}</span>
          </p>
        </>
      ) : (
        <p className="pkg-price">{product.price}</p>
      )}
      <p className="pkg-tag">{product.tagline}</p>
      <ul>
        {product.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      {product.note && <p className="pkg-note">{product.note}</p>}
      <div className="pkg-actions">
        <a className="pkg-cta" href={product.href} onClick={onClick}>
          {product.cta}
          {external && <ArrowUpRightIcon size={13} />}
        </a>
        {product.secondaryCta && product.secondaryHref ? (
          <a className="pkg-cta pkg-cta-secondary" href={product.secondaryHref}>
            {product.secondaryCta}
            {secondaryExternal && <ArrowUpRightIcon size={13} />}
          </a>
        ) : null}
      </div>
      {/* Ghost copy keeps both cards' CTA rows on one baseline. */}
      <p
        className={`pkg-dest${product.destination ? "" : " pkg-dest-ghost"}`}
        aria-hidden={!product.destination}
      >
        {product.destination ?? copy.services.gatewayContactNote}
      </p>
    </section>
  )
}

export function Services({ go, onCoverage }: { go: (view: View) => void; onCoverage: () => void }) {
  return (
    <>
      <header>
        <TopBar current="services" go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-wide">
          <h1>Maskera för företag</h1>
          <p className="prose-lede">{copy.services.lede}</p>
          <p className="prose-sub">{copy.services.sublede}</p>

          <div className="pkgs">
            {PRODUCTS.map((product) => (
              <ProductCard key={product.name} product={product} go={go} />
            ))}
          </div>

          <p className="coverage-link">
            {copy.coverage.servicesLink}{" "}
            <a href={`${viewPaths.transparency}#vad-maskeras`} onClick={navClick(onCoverage)}>
              {copy.coverage.linkCta}
            </a>
          </p>

          <h2>Så skyddar Gateway AI-flödet</h2>
          <p>
            Texten maskeras innan varje AI-anrop lämnar ert nätverk, utan att skickas via ett
            externt Maskera‑API. Originaltexten och nyckeln med originaluppgifterna stannar i er
            miljö.
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
              mäts öppet, och hundra procent utlovas aldrig.{" "}
              <a href={viewPaths.accuracy} onClick={navClick(() => go("accuracy"))}>
                {copy.accuracy.servicesCta}
              </a>
              .
            </li>
            <li>
              <strong>Ingen inlåsning i kärnan.</strong> Paketen med öppen källkod är
              MIT-licensierade och fortsätter fungera även om ni inte köper Gateway eller
              konsultstöd.
            </li>
          </ul>

          <h2>Behöver ni hjälp med införandet?</h2>
          <section className="implementation-help">
            <p>
              <strong>Tekniskt införande och anpassad integration</strong> erbjuds separat. Jag
              hjälper ert team att koppla Maskera till rätt flöde och lämnar över tester och
              dokumentation.
            </p>
            <a className="pkg-cta" href={booking("implementation")}>
              Boka ett introduktionssamtal
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
