import { GITHUB, MCP_DESKTOP_GUIDE } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import type { View } from "../routing"
import { Code } from "./CodeSnippet"
import { PageToc } from "./PageToc"
import { TopBar } from "./TopBar"

/** Per-section links named in the copy, so the JSON stays free of URLs. */
const NOTE_LINKS: Record<string, string> = {
  desktop: MCP_DESKTOP_GUIDE,
}

/**
 * Step-by-step setup per AI client. The copy owns the steps; the code blocks
 * reuse the developer page's snippet component, so copying strips the
 * comment lines the same way everywhere.
 */
export function Guides({ go }: { go: (view: View) => void }) {
  const guides = copy.guides
  return (
    <>
      <header>
        <TopBar current="guides" go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-with-toc guides-page">
          <h1>{guides.title}</h1>
          <p className="prose-lede">{guides.lede}</p>

          <PageToc
            items={guides.sections.map((section) => ({
              href: `#${section.id}`,
              label: section.title,
            }))}
          />

          {guides.sections.map((section) => (
            <section key={section.id} aria-labelledby={section.id}>
              <h2 id={section.id}>{section.title}</h2>
              <p className="prose-body">{section.body}</p>
              <Code languageLabel={section.codeLabel}>{section.code}</Code>
              {section.note && NOTE_LINKS[section.noteLink] ? (
                <p className="prose-note">
                  <a href={NOTE_LINKS[section.noteLink]} target="_blank" rel="noreferrer">
                    {section.note}
                    <ArrowUpRightIcon size={13} />
                  </a>
                </p>
              ) : null}
            </section>
          ))}

          <p className="prose-foot">
            {guides.moreLead}{" "}
            <a href={`${GITHUB}/tree/main/packages/mcp#readme`} target="_blank" rel="noreferrer">
              {guides.moreCta}
              <ArrowUpRightIcon size={13} />
            </a>
          </p>
        </article>
      </main>
    </>
  )
}
