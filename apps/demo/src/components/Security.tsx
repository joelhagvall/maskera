import { GITHUB } from "../constants"
import copy, { fill } from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { formatCount } from "../independentBench"
import { linkify } from "../linkify"
import {
  auditedClients,
  auditFigures,
  auditRun,
  localModelTested,
  openChecks,
  publicGates,
} from "../mcpAudit"
import { navClick, type View, viewPaths } from "../routing"
import { Code } from "./CodeSnippet"
import { PageToc } from "./PageToc"
import { TopBar } from "./TopBar"

const ADVISORY_URL = GITHUB + "/security/advisories/new"
const ISSUES_URL = GITHUB + "/issues"
const PRODUCTION_URL = GITHUB + "/blob/main/docs/PRODUCTION.md"
const EXTENSION_PRIVACY_URL = "https://app.maskera.dev/extension/privacy"
const AUDIT_URL = GITHUB + "/blob/main/packages/mcp/AUDIT.md"
const AUDIT_JSON_URL = GITHUB + "/blob/main/packages/mcp/audit-results.json"

export function Security({ go }: { go: (view: View) => void }) {
  return (
    <>
      <header>
        <TopBar current="security" go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-with-toc security-page">
          <h1>{copy.security.title}</h1>
          <p className="prose-lede">{copy.security.lede}</p>

          <PageToc items={copy.security.toc} />

          <TextSection id="dataflode" title={copy.security.dataFlowTitle}>
            {copy.security.dataFlow}
          </TextSection>

          <TextSection id="artefakter" title={copy.security.artifactsTitle}>
            {copy.security.artifacts}
          </TextSection>

          <TextSection id="aterstallning" title={copy.security.restoreTitle}>
            {copy.security.restore}
          </TextSection>

          <AuditSection go={go} />

          <h2 id="omfattning">{copy.security.scopeTitle}</h2>
          <p className="prose-body">{copy.security.scopeIntro}</p>
          <ul>
            {copy.security.inScope.map((item) => (
              <li key={item}>{linkify(item, { go })}</li>
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
            {copy.security.extensionBody}{" "}
            <a href={EXTENSION_PRIVACY_URL}>
              {copy.security.extensionCta}
              <ArrowUpRightIcon size={13} />
            </a>
          </p>
        </article>
      </main>
    </>
  )
}

function AuditSection({ go }: { go: (view: View) => void }) {
  const s = copy.security
  const of = (done: number, total: number) =>
    fill(s.auditOf, { done: formatCount(done), total: formatCount(total) })
  const figures = [
    {
      key: "canaryLeaks",
      label: fill(s.auditFigures.canaryLeaks, {
        types: formatCount(auditFigures.canaryTypes),
        surfaces: formatCount(auditFigures.surfaces),
      }),
      value: formatCount(auditFigures.canaryLeaks),
    },
    {
      key: "mutations",
      label: s.auditFigures.mutations,
      value: of(auditFigures.mutationsKilled, auditFigures.mutationsTotal),
    },
    {
      key: "crossSession",
      label: s.auditFigures.crossSession,
      value: formatCount(auditFigures.crossSessionLeaks),
    },
    {
      key: "offlineEgress",
      label: s.auditFigures.offlineEgress,
      value: formatCount(auditFigures.offlineEgress),
    },
  ]
  const clients = [
    ...auditedClients.map((name) => s.auditClientNames[name]),
    ...(localModelTested ? [s.auditLocalModel] : []),
  ]

  return (
    <section id="granskning" aria-labelledby="granskning-heading">
      <h2 id="granskning-heading">{s.auditTitle}</h2>
      {s.auditBody.map((paragraph) => (
        <p className="prose-body" key={paragraph}>
          {paragraph}
        </p>
      ))}
      <p className="prose-body">
        {fill(s.auditRun, {
          date: auditRun.date,
          version: auditRun.packageVersion,
          revision: auditRun.modelRevision.slice(0, 12),
          verdict: s.auditVerdicts[auditRun.verdict],
        })}
      </p>

      <dl className="benchmark-tldr audit-figures">
        {figures.map((figure) => (
          <div key={figure.key}>
            <dt>{figure.label}</dt>
            <dd>{figure.value}</dd>
          </div>
        ))}
      </dl>

      <div className="audit-gates">
        <table className="data-table">
          <caption className="sr-only">{s.auditTable.caption}</caption>
          <thead>
            <tr>
              <th scope="col">{s.auditTable.requirement}</th>
              <th scope="col">{s.auditTable.result}</th>
            </tr>
          </thead>
          <tbody>
            {publicGates.map((gate) => (
              <tr key={gate.id}>
                <th scope="row">{s.auditGates[gate.id]}</th>
                <td data-label={s.auditTable.result}>{s.auditStatus[gate.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="prose-body">{fill(s.auditClients, { clients: clients.join(", ") })}</p>
      {openChecks.length > 0 ? (
        <>
          <p className="prose-body">{s.auditOpenTitle}</p>
          <ul>
            {openChecks.map((check) => (
              <li key={check.id}>
                {s.auditOpenChecks[check.id as keyof typeof s.auditOpenChecks]}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="prose-body">
        {s.auditLimits}{" "}
        <a href={viewPaths.accuracy} onClick={navClick(() => go("accuracy"))}>
          {s.auditAccuracyCta}
        </a>
        .
      </p>

      <p className="prose-body">{s.auditReproduce}</p>
      <Code languageLabel={s.auditCodeLabel}>{s.auditCommands}</Code>
      <div className="security-actions">
        <a href={AUDIT_URL} target="_blank" rel="noreferrer">
          {s.auditReportCta}
          <ArrowUpRightIcon size={13} />
        </a>
        <a href={AUDIT_JSON_URL} target="_blank" rel="noreferrer">
          {s.auditJsonCta}
          <ArrowUpRightIcon size={13} />
        </a>
      </div>
    </section>
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
