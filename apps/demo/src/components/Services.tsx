import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import type { View } from "../routing"
import { navClick, viewPaths } from "../routing"
import { TopBar } from "./TopBar"

const BOOKING_EMAIL = "hej@maskera.dev"
const PORTAL = "https://app.maskera.dev"

function bookingEmail(subjectLine: string) {
  const subject = encodeURIComponent(subjectLine)
  return `mailto:${BOOKING_EMAIL}?subject=${subject}`
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

function products(): Product[] {
  return [
    // Gateway is featured: it is the product on sale today.
    {
      name: copy.services.products[0].name,
      price: copy.services.products[0].price,
      pilot: {
        price: copy.services.products[0].pilotPrice!,
        terms: copy.services.products[0].pilotTerms!,
      },
      tagline: copy.services.products[0].tagline,
      featured: true,
      points: copy.services.products[0].points,
      cta: copy.services.gatewayInterestCta,
      href: bookingEmail(copy.services.gatewayEmailSubject),
      secondaryCta: copy.services.gatewayDocsCta,
      secondaryHref: portal("/gateway", "business_gateway"),
      destination: copy.services.gatewayContactNote,
      note: copy.services.products[0].note,
    },
    {
      name: copy.services.products[1].name,
      price: copy.services.products[1].price,
      tagline: copy.services.products[1].tagline,
      points: copy.services.products[1].points,
      cta: copy.services.products[1].cta!,
      href: viewPaths.dev,
      view: "dev",
    },
  ]
}

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
            <span className="pkg-annual">
              {copy.services.products[0].annualPrefix} {product.price}
            </span>
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
        <a
          className="pkg-cta"
          href={product.href}
          onClick={onClick}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
        >
          {product.cta}
          {external && <ArrowUpRightIcon size={13} />}
        </a>
        {product.secondaryCta && product.secondaryHref ? (
          <a
            className="pkg-cta pkg-cta-secondary"
            href={product.secondaryHref}
            target={secondaryExternal ? "_blank" : undefined}
            rel={secondaryExternal ? "noreferrer" : undefined}
          >
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
  const gatewayFlow = copy.services.flow

  return (
    <>
      <header>
        <TopBar current="services" go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-wide">
          <h1>{copy.services.title}</h1>
          <p className="prose-lede">{copy.services.lede}</p>
          <p className="prose-sub">{copy.services.sublede}</p>

          <div className="pkgs">
            {products().map((product) => (
              <ProductCard key={product.name} product={product} go={go} />
            ))}
          </div>

          <p className="coverage-link">
            {copy.coverage.servicesLink}{" "}
            <a href={`${viewPaths.transparency}#vad-maskeras`} onClick={navClick(onCoverage)}>
              {copy.coverage.linkCta}
            </a>
          </p>

          <h2>{copy.services.flowTitle}</h2>
          <p>{copy.services.flowBody}</p>
          <div className="flow-band">
            <p className="flow-band-label">{copy.services.flowLabel}</p>
            <div className="flow">
              {gatewayFlow.map((step, index) => (
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

          <h2>{copy.services.considerTitle}</h2>
          <ul>
            <li>
              <strong>{copy.services.considerations[0].title}</strong>{" "}
              {copy.services.considerations[0].body}{" "}
              <a href={viewPaths.accuracy} onClick={navClick(() => go("accuracy"))}>
                {copy.accuracy.servicesCta}
              </a>
              .
            </li>
            <li>
              <strong>{copy.services.considerations[1].title}</strong>{" "}
              {copy.services.considerations[1].body}
            </li>
          </ul>
        </article>
      </main>
    </>
  )
}
