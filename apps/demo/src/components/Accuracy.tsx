import { GITHUB } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { navClick, type View } from "../routing"
import { PageToc } from "./PageToc"
import { TopBar } from "./TopBar"

interface ComparisonRow {
  system: string
  href?: string
  masked: string
  typedF1: string
  ours?: boolean
}

interface ComparisonCase {
  title: string
  rows: ComparisonRow[]
}

interface RedactionComparisonRow {
  system: string
  href: string
  fullHits: string
  partialLeaks: string
  misses: string
  ours?: boolean
}

interface SystemLink {
  label: string
  href: string
}

interface HistoricalComparisonRow {
  system: string
  href?: string
  links?: SystemLink[]
  description?: string
  size?: string
  masked: string
  typedF1: string
  ours?: boolean
}

interface HistoricalComparisonCase {
  title: string
  showSize: boolean
  rows: HistoricalComparisonRow[]
}

function SystemReference({
  system,
  href,
  links,
  externalLabel,
}: {
  system: string
  href?: string
  links?: SystemLink[]
  externalLabel: string
}) {
  return (
    <>
      {href ? (
        <a
          className="model-link"
          href={href}
          target="_blank"
          rel="noreferrer"
          aria-label={`${system} — ${externalLabel}`}
          translate="no"
        >
          {system}
          <ArrowUpRightIcon size={11} />
        </a>
      ) : (
        <span translate="no">{system}</span>
      )}
      {links && (
        <span className="model-links">
          {links.map((link) => (
            <a
              href={link.href}
              target="_blank"
              rel="noreferrer"
              aria-label={`${system}, ${link.label} — ${externalLabel}`}
              key={link.href}
            >
              {link.label}
              <ArrowUpRightIcon size={10} />
            </a>
          ))}
        </span>
      )}
    </>
  )
}

export function Accuracy({ go }: { go: (view: View) => void }) {
  const comparisonCases = copy.accuracy.comparisonCases as ComparisonCase[]
  const historicalComparisonCases = copy.accuracy
    .historicalComparisonCases as HistoricalComparisonCase[]
  const redactionComparisonRows = copy.accuracy.redactionComparisonRows as RedactionComparisonRow[]

  return (
    <>
      <header>
        <TopBar current="accuracy" go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-wide prose-with-toc accuracy-page">
          <h1>{copy.accuracy.title}</h1>
          <p className="prose-lede">{copy.accuracy.lede}</p>

          <PageToc label={copy.accuracy.tocLabel} items={copy.accuracy.toc} />

          <h2 id="matt">{copy.accuracy.metricsTitle}</h2>
          <p className="prose-body">{copy.accuracy.metricsBody}</p>

          <section className="benchmark-section" id="aktuellt" aria-labelledby="aktuellt-heading">
            <div className="benchmark-current">
              <div>
                <h2 id="aktuellt-heading">{copy.accuracy.currentTitle}</h2>
                <p>{copy.accuracy.currentBody}</p>
              </div>
              <dl>
                {copy.accuracy.currentStats.map((stat) => (
                  <div key={stat.label}>
                    <dt>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section
            className="benchmark-section comparison-section"
            id="kblab"
            aria-labelledby="kblab-heading"
          >
            <h2 id="kblab-heading">{copy.accuracy.comparisonTitle}</h2>
            <p className="prose-body">{copy.accuracy.comparisonBody}</p>
            <div className="comparison-grid">
              {comparisonCases.map((comparisonCase) => (
                <section className="comparison-case" key={comparisonCase.title}>
                  <h3>{comparisonCase.title}</h3>
                  <table>
                    <caption className="sr-only">{comparisonCase.title}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{copy.accuracy.comparisonTable.system}</th>
                        <th scope="col">{copy.accuracy.comparisonTable.masked}</th>
                        <th scope="col">{copy.accuracy.comparisonTable.typedF1}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonCase.rows.map((row) => (
                        <tr className={row.ours ? "comparison-own" : undefined} key={row.system}>
                          <th scope="row">
                            <SystemReference
                              system={row.system}
                              href={row.href}
                              externalLabel={copy.accuracy.externalLinkLabel}
                            />
                          </th>
                          <td>{row.masked}</td>
                          <td>{row.typedF1}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
            <p className="comparison-summary">{copy.accuracy.comparisonSummary}</p>
            <p className="comparison-limit">{copy.accuracy.comparisonLimit}</p>
          </section>

          <section
            className="benchmark-section comparison-section"
            id="logosguard"
            aria-labelledby="logosguard-heading"
          >
            <h2 id="logosguard-heading">{copy.accuracy.redactionComparisonTitle}</h2>
            <p className="prose-body">{copy.accuracy.redactionComparisonBody}</p>
            <div className="comparison-case redaction-comparison">
              <table>
                <caption className="sr-only">{copy.accuracy.redactionComparisonTitle}</caption>
                <thead>
                  <tr>
                    <th scope="col">{copy.accuracy.redactionComparisonTable.system}</th>
                    <th scope="col">{copy.accuracy.redactionComparisonTable.fullHits}</th>
                    <th scope="col">{copy.accuracy.redactionComparisonTable.partialLeaks}</th>
                    <th scope="col">{copy.accuracy.redactionComparisonTable.misses}</th>
                  </tr>
                </thead>
                <tbody>
                  {redactionComparisonRows.map((row) => (
                    <tr className={row.ours ? "comparison-own" : undefined} key={row.system}>
                      <th scope="row">
                        <SystemReference
                          system={row.system}
                          href={row.href}
                          externalLabel={copy.accuracy.externalLinkLabel}
                        />
                      </th>
                      <td data-label={copy.accuracy.redactionComparisonTable.fullHits}>
                        {row.fullHits}
                      </td>
                      <td data-label={copy.accuracy.redactionComparisonTable.partialLeaks}>
                        {row.partialLeaks}
                      </td>
                      <td data-label={copy.accuracy.redactionComparisonTable.misses}>
                        {row.misses}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="comparison-summary">{copy.accuracy.redactionComparisonSummary}</p>
            <p className="comparison-limit">{copy.accuracy.redactionComparisonLimit}</p>
          </section>

          <section
            className="benchmark-section comparison-section"
            id="modeller"
            aria-labelledby="modeller-heading"
          >
            <h2 id="modeller-heading">{copy.accuracy.historicalComparisonTitle}</h2>
            <p className="prose-body">{copy.accuracy.historicalComparisonBody}</p>
            <div className="historical-comparison-grid">
              {historicalComparisonCases.map((comparisonCase) => (
                <section className="comparison-case model-comparison" key={comparisonCase.title}>
                  <h3>{comparisonCase.title}</h3>
                  <table>
                    <caption className="sr-only">{comparisonCase.title}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{copy.accuracy.historicalComparisonTable.system}</th>
                        {comparisonCase.showSize && (
                          <th scope="col">{copy.accuracy.historicalComparisonTable.size}</th>
                        )}
                        <th scope="col">{copy.accuracy.historicalComparisonTable.masked}</th>
                        <th scope="col">{copy.accuracy.historicalComparisonTable.typedF1}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonCase.rows.map((row) => (
                        <tr className={row.ours ? "comparison-own" : undefined} key={row.system}>
                          <th scope="row">
                            <SystemReference
                              system={row.system}
                              href={row.href}
                              links={row.links}
                              externalLabel={copy.accuracy.externalLinkLabel}
                            />
                            {row.description && (
                              <span className="model-description">{row.description}</span>
                            )}
                          </th>
                          {comparisonCase.showSize && (
                            <td data-label={copy.accuracy.historicalComparisonTable.size}>
                              {row.size}
                            </td>
                          )}
                          <td data-label={copy.accuracy.historicalComparisonTable.masked}>
                            {row.masked}
                          </td>
                          <td data-label={copy.accuracy.historicalComparisonTable.typedF1}>
                            {row.typedF1}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
            <p className="comparison-summary">{copy.accuracy.historicalComparisonSummary}</p>
            <p className="comparison-limit">{copy.accuracy.historicalComparisonLimit}</p>
          </section>

          <h2 id="tolkning">{copy.accuracy.interpretationTitle}</h2>
          {copy.accuracy.interpretation.map((paragraph) => (
            <p className="prose-body" key={paragraph}>
              {paragraph}
            </p>
          ))}

          <h2 id="begransningar">{copy.accuracy.limitsTitle}</h2>
          <ul>
            {copy.accuracy.limits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <h2 id="kallor">{copy.accuracy.sourcesTitle}</h2>
          {copy.accuracy.provenance.map((paragraph) => (
            <p className="prose-body" key={paragraph}>
              {paragraph}
            </p>
          ))}
          <p className="prose-body">{copy.accuracy.sourcesBody}</p>
          <nav className="prose-foot foot-links" aria-label={copy.accuracy.sourcesTitle}>
            <ul>
              <li>
                <a href={GITHUB + "/blob/main/docs/BENCHMARKS.md"} target="_blank" rel="noreferrer">
                  {copy.accuracy.benchmarksCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
              <li>
                <a
                  href={GITHUB + "/blob/main/docs/benchmark-logosguard-2.4.4.json"}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.accuracy.redactionComparisonCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
              <li>
                <a
                  href={GITHUB + "/blob/main/bench/score-logosguard-domain.mjs"}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.accuracy.redactionScriptsCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
              <li>
                <a
                  href={GITHUB + "/blob/main/docs/benchmark-kblab-v19.json"}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.accuracy.comparisonCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
              <li>
                <a
                  href={GITHUB + "/blob/main/training/benchmark_competitors.py"}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.accuracy.scriptsCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
              <li>
                <a href="/" onClick={navClick(() => go("demo"))}>
                  {copy.accuracy.demoCta}
                </a>
              </li>
            </ul>
          </nav>
        </article>
      </main>
    </>
  )
}
