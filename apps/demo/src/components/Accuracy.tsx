import { GITHUB } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import {
  COVERAGE_CELLS,
  formatCount,
  formatMb,
  formatPct,
  SYSTEMS,
  sizeMb,
  summary,
} from "../independentBench"
import { navClick, type View, viewPaths } from "../routing"
import { PageToc } from "./PageToc"
import { TopBar } from "./TopBar"

interface ContextExample {
  input: string
  result: string
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")
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

/**
 * The accuracy page. Every number comes from the independent benchmark result
 * (docs/benchmark-independent-v20.json via independentBench.ts); the copy
 * only names and explains them.
 */
export function Accuracy({
  go,
  onTryContext,
}: {
  go: (view: View) => void
  onTryContext?: () => void
}) {
  const a = copy.accuracy
  const own = summary.maskera
  const contextExamples = a.contextExamples as ContextExample[]
  const bars = SYSTEMS.flatMap((system) => {
    const cell = summary[system]?.names
    return cell
      ? [
          {
            label: a.systems[system].name,
            valueText: formatPct(cell.maskedPct),
            pct: cell.maskedPct,
            ours: system === "maskera",
          },
        ]
      : []
  })

  return (
    <>
      <header>
        <TopBar current="accuracy" go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-with-toc accuracy-page">
          <h1>{a.title}</h1>
          <p className="prose-lede">{a.lede}</p>

          <PageToc items={a.toc} />

          <section className="benchmark-section" id="aktuellt" aria-labelledby="aktuellt-heading">
            <div className="benchmark-current">
              <div className="benchmark-current-head">
                <h2 id="aktuellt-heading">{a.currentTitle}</h2>
                <p>{a.currentBody}</p>
              </div>
              <dl className="benchmark-tldr">
                {COVERAGE_CELLS.map((cell) => {
                  const value = own[cell]
                  if (!value) return null
                  return (
                    <div key={cell}>
                      <dt>
                        {a.cells[cell]} ·{" "}
                        {fill(a.ofTotal, {
                          masked: formatCount(value.masked),
                          total: formatCount(value.total),
                        })}
                      </dt>
                      <dd>{formatPct(value.maskedPct)}</dd>
                    </div>
                  )
                })}
                {own.overMasking ? (
                  <div>
                    <dt>
                      {a.cells.overMasking} ·{" "}
                      {fill(a.ofTotal, {
                        masked: formatCount(own.overMasking.withDetection),
                        total: formatCount(own.overMasking.sentences),
                      })}
                    </dt>
                    <dd>{formatPct(own.overMasking.pct)}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </section>

          <section
            className="benchmark-section comparison-section"
            id="jamforelse"
            aria-labelledby="jamforelse-heading"
          >
            <h2 id="jamforelse-heading">{a.comparisonTitle}</h2>
            <p className="prose-body">{a.comparisonBody}</p>

            <div className="comparison-case">
              <h3>{a.barTitle}</h3>
              <div className="comparison-case-bars comparison-case-bars-clean">
                <ComparisonBars items={bars} />
              </div>
            </div>

            <div className="comparison-case comparison-unified model-comparison">
              <table className="data-table">
                <caption className="sr-only">{a.table.caption}</caption>
                <thead>
                  <tr>
                    <th scope="col">{a.table.system}</th>
                    <th scope="col">{a.table.size}</th>
                    {COVERAGE_CELLS.map((cell) => (
                      <th scope="col" key={cell}>
                        {a.table[cell]}
                      </th>
                    ))}
                    <th scope="col">{a.table.overMasking}</th>
                  </tr>
                </thead>
                <tbody>
                  {SYSTEMS.map((system) => {
                    const row = summary[system]
                    return (
                      <tr
                        className={system === "maskera" ? "comparison-own" : undefined}
                        key={system}
                      >
                        <th scope="row">
                          <span translate="no">{a.systems[system].name}</span>
                          <span className="model-description">{a.systems[system].description}</span>
                        </th>
                        <td data-label={a.table.size}>{formatMb(sizeMb(system))}</td>
                        {COVERAGE_CELLS.map((cell) => (
                          <td data-label={a.table[cell]} key={cell}>
                            {row?.[cell] ? formatPct(row[cell].maskedPct) : a.table.notMeasured}
                          </td>
                        ))}
                        <td data-label={a.table.overMasking}>
                          {row?.overMasking ? formatPct(row.overMasking.pct) : a.table.notMeasured}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="comparison-summary">{a.comparisonSummary}</p>
          </section>

          <section className="benchmark-section" id="testerna" aria-labelledby="testerna-heading">
            <h2 id="testerna-heading">{a.testsTitle}</h2>
            <dl className="faq-list">
              {a.tests.map((test) => (
                <div className="faq-item" key={test.name}>
                  <dt>{test.name}</dt>
                  <dd>{test.body}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="benchmark-section" id="kontext" aria-labelledby="kontext-heading">
            <h2 id="kontext-heading">{a.contextTitle}</h2>
            <p className="prose-body">{a.contextBody}</p>
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
                {a.contextDemoCta}
              </a>
            </p>
          </section>

          <section
            className="benchmark-section"
            id="begransningar"
            aria-labelledby="begransningar-heading"
          >
            <h2 id="begransningar-heading">{a.limitsTitle}</h2>
            <ul>
              {a.limits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="comparison-limit">{a.provenance}</p>
          </section>

          <nav className="prose-foot foot-links" aria-label={a.limitsTitle}>
            <ul>
              <li>
                <a href={viewPaths.demo} onClick={navClick(() => go("demo"))}>
                  {a.demoCta}
                </a>
              </li>
              <li>
                <a href={`${GITHUB}/blob/main/docs/BENCHMARKS.md`} target="_blank" rel="noreferrer">
                  {a.benchmarksCta}
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
