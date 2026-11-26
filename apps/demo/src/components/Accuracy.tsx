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

interface ToolComparisonRow {
  system: string
  description: string
  size: string
  domain: string
  lowercaseNames: string
  speedRam: string
  ours: boolean
}

interface ContextExample {
  input: string
  result: string
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
  const tools = copy.accuracy.toolsComparison
  const toolRows = tools.rows as ToolComparisonRow[]
  const contextExamples = copy.accuracy.contextExamples as ContextExample[]

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
            id="verktyg"
            aria-labelledby="verktyg-heading"
          >
            <h2 id="verktyg-heading">{tools.title}</h2>
            <p className="prose-body">{tools.body}</p>

            <div className="comparison-case">
              <h3>{tools.barTitle}</h3>
              <div className="comparison-case-bars comparison-case-bars-clean">
                <ComparisonBars items={tools.bars} />
              </div>
            </div>

            <div className="comparison-case comparison-unified model-comparison">
              <table className="data-table">
                <caption className="sr-only">{tools.table.caption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{tools.table.system}</th>
                    <th scope="col">{tools.table.size}</th>
                    <th scope="col">{tools.table.domain}</th>
                    <th scope="col">{tools.table.lowercaseNames}</th>
                    <th scope="col">{tools.table.speedRam}</th>
                  </tr>
                </thead>
                <tbody>
                  {toolRows.map((row) => (
                    <tr className={row.ours ? "comparison-own" : undefined} key={row.system}>
                      <th scope="row">
                        <span translate="no">{row.system}</span>
                        <span className="model-description">{row.description}</span>
                      </th>
                      <td data-label={tools.table.size}>{row.size}</td>
                      <td data-label={tools.table.domain}>{row.domain}</td>
                      <td data-label={tools.table.lowercaseNames}>{row.lowercaseNames}</td>
                      <td data-label={tools.table.speedRam}>{row.speedRam}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="comparison-summary">{tools.summary}</p>
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
            <p className="comparison-limit">{copy.accuracy.provenance}</p>
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
