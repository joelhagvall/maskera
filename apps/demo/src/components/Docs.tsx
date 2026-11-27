import { GITHUB, HF_MODEL, NPM_MCP, NPM_NER } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { navClick, type View, viewPaths } from "../routing"
import { loadView } from "../views"
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
  body: string
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

function DocsSubNav({ current, go }: { current: DocsView; go: (view: View) => void }) {
  return (
    <nav className="docs-subnav" aria-label={copy.docs.navLabel}>
      {DOCS_NAV_VIEWS.map((item) => (
        <a
          key={item.view}
          href={viewPaths[item.view]}
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

function DocsPage({
  current,
  data,
  go,
}: {
  current: DocsView
  data: DocsPageData
  go: (view: View) => void
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
          <p className="prose-lede">{data.lede}</p>

          <DocsSubNav current={current} go={go} />

          <PageToc items={tocItems} />

          <aside className="docs-verify" aria-labelledby="docs-verify-title">
            <p id="docs-verify-title" className="docs-verify-title">
              {data.verifyTitle}
            </p>
            <p>{data.verifyBody}</p>
          </aside>

          {data.sections.map((section) => (
            <section key={section.id} aria-labelledby={section.id}>
              <h2 id={section.id}>{section.title}</h2>
              <p className="prose-body">{section.body}</p>
              {section.bullets && section.bullets.length > 0 ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
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
                            <td key={`${row[0]}-${idx}`}>{cell}</td>
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
            </section>
          ))}

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

export function DocsOverview({ go }: { go: (view: View) => void }) {
  return <DocsPage current="docs" data={copy.docs.overview} go={go} />
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
