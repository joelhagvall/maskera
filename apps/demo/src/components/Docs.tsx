import type { ReactNode } from "react"
import { GITHUB, HF_MODEL, NPM_MCP, NPM_NER } from "../constants"
import { DOCTOR_COMMAND, doctorSample } from "../doctorSample"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { navClick, type View, viewPaths } from "../routing"
import { loadView } from "../views"
import { ArchitectureFigure } from "./ArchitectureFigure"
import { Code } from "./CodeSnippet"
import { PageToc } from "./PageToc"
import { TopBar } from "./TopBar"

export type DocsView = "docs" | "docsMcp" | "docsClients" | "docsSdk" | "docsTroubleshooting"

interface DocsTable {
  headers: readonly string[]
  rows: readonly (readonly string[])[]
}

interface DocsSection {
  id: string
  title: string
  body?: string
  bullets?: readonly string[]
  codeLabel?: string
  code?: string
  table?: DocsTable
}

interface DocsPageData {
  title: string
  lede: string
  verifyTitle: string
  verifyBody: string
  sections: readonly DocsSection[]
}

const DOCS_NAV_VIEWS: readonly { view: DocsView; key: keyof typeof copy.docs.nav }[] = [
  { view: "docs", key: "overview" },
  { view: "docsMcp", key: "mcp" },
  { view: "docsClients", key: "clients" },
  { view: "docsSdk", key: "sdk" },
  { view: "docsTroubleshooting", key: "troubleshooting" },
]

// CLI flags and URL query parameters (--no-raw-restore, ?read_only=1) must not
// break at their inner hyphen or after the "?", or a reader copies half a flag.
const FLAG = /(?:--|\?)[\w-]+(?:=\w+)?/g

/** Docs prose with every flag and query parameter kept on one line. */
export function keepFlagsWhole(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(FLAG)) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    nodes.push(
      <span key={m.index} className="no-break">
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/**
 * On a phone the subnav is one sideways-scrolling row; scroll it so the
 * current page's tab is in view instead of cut off at the right edge.
 */
function scrollCurrentIntoNav(link: HTMLAnchorElement | null) {
  const nav = link?.parentElement
  if (!link || !nav || nav.scrollWidth <= nav.clientWidth) return
  const overflow = link.getBoundingClientRect().right - nav.getBoundingClientRect().right
  if (overflow > 0) nav.scrollLeft += overflow
}

function DocsSubNav({ current, go }: { current: DocsView; go: (view: View) => void }) {
  return (
    <nav className="docs-subnav" aria-label={copy.docs.navLabel}>
      {DOCS_NAV_VIEWS.map((item) => (
        <a
          key={item.view}
          href={viewPaths[item.view]}
          ref={item.view === current ? scrollCurrentIntoNav : undefined}
          aria-current={item.view === current ? "page" : undefined}
          className={item.view === current ? "on" : undefined}
          onMouseEnter={() => void loadView(item.view)}
          onFocus={() => void loadView(item.view)}
          onClick={navClick(() => go(item.view))}
        >
          {copy.docs.nav[item.key]}
        </a>
      ))}
    </nav>
  )
}

/**
 * The other docs pages as cards at the end of each page: title and lede, so
 * a reader who finished one page sees where to go next without the subnav.
 */
function DocsNext({ current, go }: { current: DocsView; go: (view: View) => void }) {
  const next = DOCS_NAV_VIEWS.filter((item) => item.view !== current)
  return (
    <nav className="docs-next" aria-labelledby="docs-next-title">
      <h2 id="docs-next-title">{copy.docs.nextLabel}</h2>
      <ul>
        {next.map((item) => (
          <li key={item.view}>
            <a
              href={viewPaths[item.view]}
              onMouseEnter={() => void loadView(item.view)}
              onFocus={() => void loadView(item.view)}
              onClick={navClick(() => go(item.view))}
            >
              <span className="docs-next-title">{copy.docs.nav[item.key]} →</span>
              <span className="docs-next-lede">{copy.docs[item.key].lede}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function DocsPage({
  current,
  data,
  go,
  verifyExtra,
  afterSection,
}: {
  current: DocsView
  data: DocsPageData
  go: (view: View) => void
  /** Shown inside the "you know it works when" box, under its text. */
  verifyExtra?: ReactNode
  /** A figure or block placed at the end of the section with that id. */
  afterSection?: Partial<Record<string, ReactNode>>
}) {
  const tocItems = data.sections.map((section) => ({
    href: `#${section.id}`,
    label: section.title,
  }))

  return (
    <>
      <header>
        <TopBar current={current} go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-with-toc docs-page">
          <h1>{data.title}</h1>
          <p className="prose-lede">{keepFlagsWhole(data.lede)}</p>

          <DocsSubNav current={current} go={go} />

          <PageToc items={tocItems} />

          <aside className="docs-verify" aria-labelledby="docs-verify-title">
            <p id="docs-verify-title" className="docs-verify-title">
              {data.verifyTitle}
            </p>
            <p>{keepFlagsWhole(data.verifyBody)}</p>
            {verifyExtra}
          </aside>

          {data.sections.map((section) => (
            <section key={section.id} aria-labelledby={section.id}>
              <h2 id={section.id}>{section.title}</h2>
              {section.body ? <p className="prose-body">{keepFlagsWhole(section.body)}</p> : null}
              {section.bullets && section.bullets.length > 0 ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{keepFlagsWhole(bullet)}</li>
                  ))}
                </ul>
              ) : null}
              {section.table ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        {section.table.headers.map((header) => (
                          <th key={header} scope="col">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row) => (
                        <tr key={row[0]}>
                          {row.map((cell, idx) => (
                            <td key={`${row[0]}-${idx}`} data-label={section.table?.headers[idx]}>
                              {keepFlagsWhole(cell)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {section.code ? (
                <Code languageLabel={section.codeLabel ?? "Terminal"}>{section.code}</Code>
              ) : null}
              {afterSection?.[section.id]}
            </section>
          ))}

          <DocsNext current={current} go={go} />

          <nav className="prose-foot foot-links" aria-label={copy.docs.resourcesLabel}>
            <ul>
              <li>
                <a href="/setup-prompt.md" target="_blank" rel="noreferrer">
                  {copy.docs.setupPromptCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
              <li>
                <a href="/llms.txt" target="_blank" rel="noreferrer">
                  {copy.docs.llmsCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
              <li>
                <a href={NPM_MCP} target="_blank" rel="noreferrer">
                  {copy.developerApi.mcpNpmCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
              <li>
                <a href={NPM_NER} target="_blank" rel="noreferrer">
                  {copy.developerApi.npmCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
              <li>
                <a href={GITHUB} target="_blank" rel="noreferrer">
                  {copy.developerApi.githubCta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
              <li>
                <a href={HF_MODEL} target="_blank" rel="noreferrer">
                  {copy.developerApi.modelCta}
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

export function DocsOverview({
  go,
  onCoverage,
}: {
  go: (view: View) => void
  onCoverage: () => void
}) {
  const overview = copy.docs.overview
  return (
    <DocsPage
      current="docs"
      data={overview}
      go={go}
      verifyExtra={
        <Code languageLabel="Terminal" output={doctorSample(overview.doctorRoot)}>
          {DOCTOR_COMMAND}
        </Code>
      }
      afterSection={{ "valj-lage": <ArchitectureFigure onCoverage={onCoverage} /> }}
    />
  )
}

export function DocsMcp({ go }: { go: (view: View) => void }) {
  return <DocsPage current="docsMcp" data={copy.docs.mcp} go={go} />
}

export function DocsClients({ go }: { go: (view: View) => void }) {
  return <DocsPage current="docsClients" data={copy.docs.clients} go={go} />
}

export function DocsSdk({ go }: { go: (view: View) => void }) {
  return <DocsPage current="docsSdk" data={copy.docs.sdk} go={go} />
}

export function DocsTroubleshooting({ go }: { go: (view: View) => void }) {
  return <DocsPage current="docsTroubleshooting" data={copy.docs.troubleshooting} go={go} />
}
