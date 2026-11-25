import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { PORTAL_ORIGIN, portalUrl } from "../portal"
import type { View } from "../routing"
import { navClick, viewPaths } from "../routing"
import { TopBar } from "./TopBar"

const EXTENSION_DOWNLOAD_URL = `${PORTAL_ORIGIN}/downloads/maskera-extension-0.1.0.zip`

type Product = {
  name: string
  price: string
  subPrice?: { label: string; terms: string }
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
  const [extension, openSource] = copy.services.products

  return [
    {
      name: extension.name,
      price: extension.price,
      subPrice: {
        label: extension.freeLine!,
        terms: extension.trialTerms!,
      },
      tagline: extension.tagline,
      featured: true,
      points: extension.points,
      cta: extension.cta!,
      href: portalUrl("/login?buy=extension-pro&signup=true", "services_extension_trial"),
      secondaryCta: extension.secondaryCta,
      secondaryHref: "#installera",
      destination: copy.services.extensionPortalNote,
      note: extension.note,
    },
    {
      name: openSource.name,
      price: openSource.price,
      tagline: openSource.tagline,
      points: openSource.points,
      cta: openSource.cta!,
      href: viewPaths.dev,
      view: "dev",
    },
  ]
}

function ProductCard({ product, go }: { product: Product; go: (view: View) => void }) {
  const onClick = product.view ? navClick(() => go(product.view as View)) : undefined
  const external = product.href.startsWith("http")
  const secondaryExternal = product.secondaryHref?.startsWith("http") ?? false

  return (
    <section className={`pkg${product.featured ? " featured" : ""}`}>
      <h2 className="pkg-name">{product.name}</h2>
      <p className="pkg-price">{product.price}</p>
      {product.subPrice ? (
        <p className="pkg-pilot">
          <span className="pkg-annual">{product.subPrice.label}</span>
          <span className="pkg-pilot-terms">{product.subPrice.terms}</span>
        </p>
      ) : null}
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
      {/* Ghost copy keeps every card's CTA row on one baseline. */}
      <p
        className={`pkg-dest${product.destination ? "" : " pkg-dest-ghost"}`}
        aria-hidden={!product.destination}
      >
        {product.destination ?? copy.services.extensionPortalNote}
      </p>
    </section>
  )
}

export function Services({ go, onCoverage }: { go: (view: View) => void; onCoverage: () => void }) {
  const extensionFlow = copy.services.flow
  const install = copy.services.install
  const compare = copy.services.compare

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

          <section id="installera" aria-labelledby="installera-heading" className="ext-install">
            <div className="ext-install-head">
              <h2 id="installera-heading">{install.title}</h2>
              <p className="ext-install-req">{install.requirements}</p>
              <a className="ext-install-cta" href={EXTENSION_DOWNLOAD_URL} download>
                {install.downloadCta}
                <ArrowUpRightIcon size={13} />
              </a>
            </div>
            <ol className="ext-install-steps">
              {install.steps.map((step) => (
                <li key={step.title}>
                  <strong>{step.title}</strong>
                  <p>{step.detail}</p>
                </li>
              ))}
            </ol>
          </section>

          <section id="jamfor" aria-labelledby="jamfor-heading" className="ext-compare">
            <h2 id="jamfor-heading">{compare.title}</h2>
            <div className="ext-table-wrap">
              <table className="ext-table" aria-labelledby="jamfor-heading">
                <thead>
                  <tr>
                    <th scope="col">{compare.featureColumn}</th>
                    <th scope="col">{compare.freeTitle}</th>
                    <th scope="col" className="ext-col-pro">
                      {compare.proTitle}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {compare.rows.map((row) => (
                    <tr key={row.feature}>
                      <th scope="row">{row.feature}</th>
                      <td>{row.free}</td>
                      <td className="ext-col-pro">{row.pro}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ext-trial-row">
              <div className="ext-trial-copy">
                <p className="ext-trial-price">{compare.trialPrice}</p>
                <p className="ext-trial-details">{compare.trialDetails}</p>
                <p className="ext-trial-links">
                  <a
                    href={portalUrl("/extension/terms", "services_extension_terms")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {compare.termsCta}
                    <ArrowUpRightIcon size={12} />
                  </a>
                  <span aria-hidden="true"> · </span>
                  <a
                    href={portalUrl("/extension/privacy", "services_extension_privacy")}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {compare.privacyCta}
                    <ArrowUpRightIcon size={12} />
                  </a>
                </p>
              </div>
              <a
                className="ext-trial-cta"
                href={portalUrl("/login?buy=extension-pro&signup=true", "services_compare_trial")}
                target="_blank"
                rel="noreferrer"
              >
                {compare.startTrialCta}
                <ArrowUpRightIcon size={13} />
              </a>
            </div>
          </section>

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
              {extensionFlow.map((step, index) => (
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
