import { GITHUB } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import type { View } from "../routing"
import { TopBar } from "./TopBar"

const ADVISORY_URL = GITHUB + "/security/advisories/new"
const ISSUES_URL = GITHUB + "/issues"
const PRODUCTION_URL = GITHUB + "/blob/main/docs/PRODUCTION.md"
const GATEWAY_URL = "https://app.maskera.dev/gateway"

export function Security({ go }: { go: (view: View) => void }) {
  return (
    <>
      <header>
        <TopBar current="security" go={go} />
      </header>

      <main id="main-content">
        <article className="prose security-page">
          <h1>{copy.security.title}</h1>
          <p className="prose-lede">{copy.security.lede}</p>

          <nav className="toc" aria-label={copy.security.tocLabel}>
            <p>{copy.security.tocLabel}</p>
            <ul>
              {copy.security.toc.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <TextSection id="dataflode" title={copy.security.dataFlowTitle}>
            {copy.security.dataFlow}
          </TextSection>

          <TextSection id="artefakter" title={copy.security.artifactsTitle}>
            {copy.security.artifacts}
          </TextSection>

          <TextSection id="aterstallning" title={copy.security.restoreTitle}>
            {copy.security.restore}
          </TextSection>

          <h2 id="omfattning">{copy.security.scopeTitle}</h2>
          <p className="prose-body">{copy.security.scopeIntro}</p>
          <ul>
            {copy.security.inScope.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="prose-body">{copy.security.qualityBody}</p>

          <h2 id="rapportera">{copy.security.reportTitle}</h2>
          <p className="prose-body">{copy.security.reportBody}</p>
          <div className="security-actions">
            <a href={ADVISORY_URL} target="_blank" rel="noreferrer">
              {copy.security.advisoryCta}
              <ArrowUpRightIcon size={13} />
            </a>
            <a href={ISSUES_URL} target="_blank" rel="noreferrer">
              {copy.security.issuesCta}
              <ArrowUpRightIcon size={13} />
            </a>
          </div>

          <h2 id="produktion">{copy.security.productionTitle}</h2>
          <p className="prose-body">{copy.security.productionBody}</p>
          <p className="prose-body">
            <a href={PRODUCTION_URL} target="_blank" rel="noreferrer">
              {copy.security.productionCta}
              <ArrowUpRightIcon size={13} />
            </a>
          </p>

          <p className="prose-foot">
            {copy.security.gatewayBody}{" "}
            <a href={GATEWAY_URL}>
              {copy.security.gatewayCta}
              <ArrowUpRightIcon size={13} />
            </a>
          </p>
        </article>
      </main>
    </>
  )
}

function TextSection({ id, title, children }: { id: string; title: string; children: string[] }) {
  return (
    <section id={id} aria-labelledby={id + "-heading"}>
      <h2 id={id + "-heading"}>{title}</h2>
      {children.map((paragraph) => (
        <p className="prose-body" key={paragraph}>
          {paragraph}
        </p>
      ))}
    </section>
  )
}
