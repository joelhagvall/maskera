import { GITHUB } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { navClick, type View, viewPaths } from "../routing"
import { PageToc } from "./PageToc"
import { TopBar } from "./TopBar"

interface BarGroup {
  title: string
  items: { label: string; valueText: string; pct: number; ours: boolean }[]
}

interface ComparisonRow {
  system: string
  description: string
  size: string
  normal: string
  lowercase: string
  ours: boolean
}

interface ContextExample {
  input: string
  result: string
}

interface HistoricalRow {
  system: string
  size: string
  normal: string
  lowercase: string
  ours: boolean
}

function ComparisonBars({
  items,
}: {
  items: { label: string; valueText: string; pct: number; ours?: boolean }[]
}) {
  return (
    <div className="bench-bars" aria-hidden="true">
      {items.map((item) => (
        <div className={`bench-bar-row${item.ours ? " is-ours" : ""}`} key={item.label}>
          <div className="bench-bar-meta">
            <span className="bench-bar-label" translate="no">
              {item.label}
            </span>
            <span className="bench-bar-value">{item.valueText}</span>
          </div>
          <div className="bench-bar-track">
            <div
              className="bench-bar-fill"
              style={{ width: `${Math.min(100, Math.max(0, item.pct))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Accuracy({
  go,
  onTryContext,
}: {
  go: (view: View) => void
  onTryContext?: () => void
}) {
  const barGroups = copy.accuracy.comparisonBarGroups as BarGroup[]
  const rows = copy.accuracy.comparisonRows as ComparisonRow[]
  const contextExamples = copy.accuracy.contextExamples as ContextExample[]
  const historicalRows = copy.accuracy.historicalRows as HistoricalRow[]

  return (
    <>
      <header>
        <TopBar current="accuracy" go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-with-toc accuracy-page">
          <h1>{copy.accuracy.title}</h1>
          <p className="prose-lede">{copy.accuracy.lede}</p>

          <PageToc label={copy.accuracy.tocLabel} items={copy.accuracy.toc} />

          <section className="benchmark-section" id="aktuellt" aria-labelledby="aktuellt-heading">
            <div className="benchmark-current">
              <div className="benchmark-current-head">
                <h2 id="aktuellt-heading">{copy.accuracy.currentTitle}</h2>
                <p>{copy.accuracy.currentBody}</p>
              </div>
              <dl className="benchmark-tldr">
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
            id="jamforelse"
            aria-labelledby="jamforelse-heading"
          >
            <h2 id="jamforelse-heading">{copy.accuracy.comparisonTitle}</h2>
            <p className="prose-body">{copy.accuracy.comparisonBody}</p>

            <div className="comparison-grid">
              {barGroups.map((group) => (
                <section className="comparison-case" key={group.title}>
                  <h3>{group.title}</h3>
                  <div className="comparison-case-bars comparison-case-bars-clean">
                    <ComparisonBars items={group.items} />
                  </div>
                </section>
              ))}
            </div>

            <div className="comparison-case comparison-unified model-comparison">
              <table className="data-table">
                <caption className="sr-only">{copy.accuracy.comparisonTable.caption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{copy.accuracy.comparisonTable.system}</th>
                    <th scope="col">{copy.accuracy.comparisonTable.size}</th>
                    <th scope="col">{copy.accuracy.comparisonTable.normal}</th>
                    <th scope="col">{copy.accuracy.comparisonTable.lowercase}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr className={row.ours ? "comparison-own" : undefined} key={row.system}>
                      <th scope="row">
                        <span translate="no">{row.system}</span>
                        <span className="model-description">{row.description}</span>
                      </th>
                      <td data-label={copy.accuracy.comparisonTable.size}>{row.size}</td>
                      <td data-label={copy.accuracy.comparisonTable.normal}>{row.normal}</td>
                      <td data-label={copy.accuracy.comparisonTable.lowercase}>{row.lowercase}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="comparison-summary">{copy.accuracy.comparisonSummary}</p>
          </section>

          <section className="benchmark-section" id="kontext" aria-labelledby="kontext-heading">
            <h2 id="kontext-heading">{copy.accuracy.contextTitle}</h2>
            <p className="prose-body">{copy.accuracy.contextBody}</p>
            <div className="context-showcase">
              {contextExamples.map((ex) => (
                <div className="context-card" key={ex.input}>
                  <p className="context-input" lang="sv">
                    {ex.input}
                  </p>
                  <p className="context-result">{ex.result}</p>
                </div>
              ))}
            </div>
            <p className="context-action">
              <a
                href={viewPaths.demo}
                onClick={navClick(() => (onTryContext ? onTryContext() : go("demo")))}
              >
                {copy.accuracy.contextDemoCta}
              </a>
            </p>
          </section>

          <section
            className="benchmark-section"
            id="begransningar"
            aria-labelledby="begransningar-heading"
          >
            <h2 id="begransningar-heading">{copy.accuracy.limitsTitle}</h2>
            <ul>
              {copy.accuracy.limits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <details className="historical-details">
              <summary>{copy.accuracy.detailsToggle}</summary>
              <div className="historical-details-body">
                <h3>{copy.accuracy.historicalTitle}</h3>
                <p className="prose-body">{copy.accuracy.historicalBody}</p>
                <div className="comparison-case model-comparison">
                  <table className="data-table">
                    <caption className="sr-only">{copy.accuracy.historicalTitle}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{copy.accuracy.historicalTable.system}</th>
                        <th scope="col">{copy.accuracy.historicalTable.size}</th>
                        <th scope="col">{copy.accuracy.historicalTable.normal}</th>
                        <th scope="col">{copy.accuracy.historicalTable.lowercase}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historicalRows.map((row) => (
                        <tr className={row.ours ? "comparison-own" : undefined} key={row.system}>
                          <th scope="row">
                            <span translate="no">{row.system}</span>
                          </th>
                          <td data-label={copy.accuracy.historicalTable.size}>{row.size}</td>
                          <td data-label={copy.accuracy.historicalTable.normal}>{row.normal}</td>
                          <td data-label={copy.accuracy.historicalTable.lowercase}>
                            {row.lowercase}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="comparison-limit">{copy.accuracy.provenance}</p>
              </div>
            </details>
          </section>

          <nav className="prose-foot foot-links" aria-label={copy.accuracy.limitsTitle}>
            <ul>
              <li>
                <a href={viewPaths.demo} onClick={navClick(() => go("demo"))}>
                  {copy.accuracy.demoCta}
                </a>
              </li>
              <li>
                <a href={GITHUB + "/blob/main/docs/BENCHMARKS.md"} target="_blank" rel="noreferrer">
                  {copy.accuracy.benchmarksCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
            </ul>
          </nav>
        </article>
      </main>
    </>
  )
}
