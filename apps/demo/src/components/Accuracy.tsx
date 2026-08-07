import { GITHUB } from "../constants"
import copy from "../i18n/sv.json"
import { ArrowUpRightIcon } from "../icons"
import { navClick, type View } from "../routing"
import { TopBar } from "./TopBar"

interface BenchmarkRow {
  system: string
  precision: string
  recall: string
  leaks: string
  ours?: boolean
}

const independentRows = copy.accuracy.independentRows as BenchmarkRow[]
const addressRows = copy.accuracy.addressRows as BenchmarkRow[]

export function Accuracy({ go }: { go: (view: View) => void }) {
  return (
    <>
      <header>
        <TopBar current="accuracy" go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-wide accuracy-page">
          <h1>{copy.accuracy.title}</h1>
          <p className="prose-lede">{copy.accuracy.lede}</p>

          <nav className="toc" aria-label={copy.accuracy.tocLabel}>
            <p>{copy.accuracy.tocLabel}</p>
            <ul>
              {copy.accuracy.toc.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <h2 id="matt">{copy.accuracy.metricsTitle}</h2>
          <p className="prose-body">{copy.accuracy.metricsBody}</p>

          <BenchmarkTable
            id="oberoende"
            title={copy.accuracy.independentTitle}
            caption={copy.accuracy.independentCaption}
            rows={independentRows}
          />

          <BenchmarkTable
            id="adresser"
            title={copy.accuracy.addressesTitle}
            caption={copy.accuracy.addressesCaption}
            rows={addressRows}
          />

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
                <a href={GITHUB + "/tree/main/bench"} target="_blank" rel="noreferrer">
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

function BenchmarkTable({
  id,
  title,
  caption,
  rows,
}: {
  id: string
  title: string
  caption: string
  rows: BenchmarkRow[]
}) {
  return (
    <section className="benchmark-section" id={id} aria-labelledby={id + "-heading"}>
      <h2 id={id + "-heading"}>{title}</h2>
      <p className="benchmark-caption">{caption}</p>
      <p className="benchmark-swipe-hint" id={id + "-swipe-hint"}>
        {copy.accuracy.table.swipeHint}
      </p>
      <div
        className="benchmark-scroll"
        role="group"
        aria-label={title}
        aria-describedby={id + "-swipe-hint"}
        tabIndex={0}
      >
        <table className="benchmark-table">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.accuracy.table.system}</th>
              <th scope="col">{copy.accuracy.table.precision}</th>
              <th scope="col">{copy.accuracy.table.recall}</th>
              <th scope="col">{copy.accuracy.table.leaks}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className={row.ours ? "benchmark-own" : undefined} key={row.system}>
                <th scope="row" translate="no">
                  {row.system}
                </th>
                <td>{row.precision}</td>
                <td>{row.recall}</td>
                <td>{row.leaks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
