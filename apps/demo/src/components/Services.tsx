import { contactMailto, GITHUB, NPM_MCP } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon, CheckIcon } from "../icons"
import { portalUrl } from "../portal"
import type { View } from "../routing"
import { navClick, viewPaths } from "../routing"
import { CopyButton } from "./CopyButton"
import { ExtensionInstall, SERVICES_SECTIONS } from "./ExtensionInstall"
import { ProductScene } from "./HeroStage"
import { PageToc } from "./PageToc"
import { TopBar } from "./TopBar"

const TRACK_SECTIONS: Record<string, string> = {
  extension: SERVICES_SECTIONS.extension,
  agents: SERVICES_SECTIONS.agents,
  sdk: SERVICES_SECTIONS.code,
}

/**
 * One plan cell in the comparison table: "included" as a check and "not
 * included" as a dash, each with its word for screen readers and the
 * Markdown copy; any other value (a limit, a price) as text.
 */
function PlanCell({ value }: { value: string }) {
  const compare = copy.services.compare
  if (value === compare.included || value === compare.notIncluded) {
    const included = value === compare.included
    return (
      <td className={included ? "plan-yes" : "plan-no"}>
        {included ? <CheckIcon size={16} aria-hidden="true" /> : <span aria-hidden="true">–</span>}
        <span className="sr-only">{value}</span>
      </td>
    )
  }
  return <td>{value}</td>
}

/**
 * One long page with every track visible: an overview table, then the
 * extension, AI agents and own-code sections, then Free vs Pro. The section
 * ids are the old tab hashes (#tillagg, #agenter, #kod, #jamfor), so earlier
 * links still land on the right track.
 */
export function Services({ go, onCoverage }: { go: (view: View) => void; onCoverage: () => void }) {
  const services = copy.services
  const compare = services.compare
  const track = (id: string) => {
    const found = services.tracks.find((item) => item.id === id)
    if (!found) throw new Error(`services.tracks is missing ${id}`)
    return found
  }
  const extension = track("extension")
  const agents = track("agents")
  const sdk = track("sdk")

  return (
    <>
      <header>
        <TopBar current="services" go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-with-toc services-page">
          <h1>{services.title}</h1>
          <p className="prose-lede">{services.lede}</p>

          <PageToc items={services.toc} />
          <div className="services-content">
            <section id="oversikt" aria-labelledby="oversikt-heading" className="services-section">
              <h2 id="oversikt-heading" className="sr-only">
                {services.overview.title}
              </h2>
              <div className="ext-table-wrap services-overview">
                <table className="data-table" aria-labelledby="oversikt-heading">
                  <thead>
                    <tr>
                      <td />
                      {services.tracks.map((item) => (
                        <th key={item.id} scope="col">
                          {item.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {services.overview.rows.map((row) => (
                      <tr key={row.label}>
                        <th scope="row">{row.label}</th>
                        {row.values.map((value, index) => (
                          <td key={`${row.label}-${services.tracks[index]?.id}`}>{value}</td>
                        ))}
                      </tr>
                    ))}
                    <tr>
                      <td />
                      {services.tracks.map((item) => (
                        <td key={item.id}>
                          <a href={`#${TRACK_SECTIONS[item.id]}`}>{item.cta} ↓</a>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section
              id={SERVICES_SECTIONS.extension}
              aria-labelledby="tillagg-heading"
              className="services-section"
            >
              <div className="services-section-head">
                <h2 id="tillagg-heading">{extension.title}</h2>
                <p className="services-section-meta">{extension.badge}</p>
              </div>
              <p className="services-section-body">{extension.summary}</p>
              <ProductScene stage="browser" />
              <ExtensionInstall />
            </section>

            <section
              id={SERVICES_SECTIONS.compare}
              aria-labelledby="jamfor-heading"
              className="services-section ext-compare"
            >
              <h2 id="jamfor-heading">{compare.title}</h2>
              <div className="ext-table-wrap">
                <table className="data-table" aria-labelledby="jamfor-heading">
                  <thead>
                    <tr>
                      <th scope="col">{compare.featureColumn}</th>
                      <th scope="col">
                        {compare.freeTitle}
                        <span className="plan-price">{compare.freePrice}</span>
                      </th>
                      <th scope="col">
                        {compare.proTitle}
                        <span className="plan-price">{compare.proPrice}</span>
                      </th>
                      <th scope="col">
                        {compare.teamTitle}
                        <span className="plan-price">{compare.teamPrice}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {compare.rows.map((row) => (
                      <tr key={row.feature}>
                        <th scope="row">{row.feature}</th>
                        <PlanCell value={row.free} />
                        <PlanCell value={row.pro} />
                        <PlanCell value={row.team} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="ext-plan-actions">
                <div className="ext-plan-col">
                  <p className="ext-trial-price">{compare.trialPrice}</p>
                  <p className="ext-trial-details">{compare.trialDetails}</p>
                  <div className="ext-plan-cta-wrap">
                    <a
                      className="ext-trial-cta"
                      href={portalUrl(
                        "/login?buy=extension-pro&signup=true",
                        "services_compare_trial",
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {compare.startTrialCta}
                      <ArrowUpRightIcon size={13} />
                    </a>
                  </div>
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
                <div className="ext-plan-col">
                  <p className="ext-trial-price">{compare.teamHeading}</p>
                  <p className="ext-trial-details">{compare.teamDetails}</p>
                  <div className="ext-plan-cta-wrap">
                    <a
                      className="ext-trial-cta ext-trial-cta-secondary"
                      href={portalUrl(
                        "/login?buy=extension-team&signup=true",
                        "services_compare_team",
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {compare.teamCta}
                      <ArrowUpRightIcon size={13} />
                    </a>
                  </div>
                  <p className="ext-trial-links">
                    <a href={contactMailto(compare.teamMailSubject)}>{compare.teamInvoiceCta}</a>
                  </p>
                </div>
              </div>
            </section>

            <section
              id={SERVICES_SECTIONS.agents}
              aria-labelledby="agenter-heading"
              className="services-section"
            >
              <div className="services-section-head">
                <h2 id="agenter-heading">{agents.title}</h2>
                <p className="services-section-meta">{agents.badge}</p>
              </div>
              <p className="services-section-body">{services.agents.body}</p>
              <ProductScene stage="agent" />
              <ul className="sdk-points">
                {services.agents.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>

              <div className="services-cta-row">
                <a
                  className="ext-trial-cta"
                  href={viewPaths.docs}
                  onClick={navClick(() => go("docs"))}
                >
                  {services.agents.setupCta}
                </a>
                <a className="agent-llms-link" href={NPM_MCP} target="_blank" rel="noreferrer">
                  {services.agents.npmCta}
                  <ArrowUpRightIcon size={12} />
                </a>
              </div>
            </section>

            <section
              id={SERVICES_SECTIONS.code}
              aria-labelledby="kod-heading"
              className="services-section"
            >
              <div className="services-section-head">
                <h2 id="kod-heading">{sdk.title}</h2>
                <p className="services-section-meta">{sdk.badge}</p>
              </div>
              <p className="services-section-body">{services.sdk.body}</p>
              <ProductScene stage="code" />

              <div className="code-block install-tabs">
                <div className="code-head">
                  <span className="shared-language-label">{services.sdk.packageManagerLabel}</span>
                  <CopyButton
                    text={services.sdk.installCommand}
                    className="code-copy"
                    iconSize={14}
                    ariaLabel={copy.copyButton.copyCode}
                    title={copy.copyButton.copy}
                  />
                </div>
                <pre tabIndex={0}>
                  <code>
                    <span className="code-line">{services.sdk.installCommand}</span>
                  </code>
                </pre>
              </div>

              <div className="services-cta-row">
                <a
                  className="ext-trial-cta"
                  href={viewPaths.docsSdk}
                  onClick={navClick(() => go("docsSdk"))}
                >
                  {services.sdk.cta}
                </a>
                <a className="agent-llms-link" href={GITHUB} target="_blank" rel="noreferrer">
                  {services.sdk.githubCta}
                  <ArrowUpRightIcon size={12} />
                </a>
              </div>
            </section>
          </div>

          <p className="coverage-link">
            <a href={`${viewPaths.transparency}#vad-maskeras`} onClick={navClick(onCoverage)}>
              {copy.coverage.linkCta}
            </a>
            <span aria-hidden="true"> · </span>
            <a href={viewPaths.accuracy} onClick={navClick(() => go("accuracy"))}>
              {copy.accuracy.servicesCta}
            </a>
          </p>
        </article>
      </main>
    </>
  )
}
