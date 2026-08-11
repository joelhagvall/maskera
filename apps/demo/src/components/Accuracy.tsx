import { GITHUB } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { navClick, type View } from "../routing"
import { PageToc } from "./PageToc"
import { TopBar } from "./TopBar"

interface ComparisonRow {
  system: string
  masked: string
  typedF1: string
  ours?: boolean
}

interface ComparisonCase {
  title: string
  rows: ComparisonRow[]
}

export function Accuracy({ go }: { go: (view: View) => void }) {
  const comparisonCases = copy.accuracy.comparisonCases as ComparisonCase[]

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
                          <th scope="row" translate="no">
                            {row.system}
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
