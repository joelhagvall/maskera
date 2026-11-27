import copy from "../i18n"
import { navClick, type View, viewPaths } from "../routing"
import { Code } from "./CodeSnippet"
import { PageToc } from "./PageToc"
import { TopBar } from "./TopBar"

/**
 * Step-by-step setup per AI client. The copy owns the steps; the code blocks
 * reuse the developer page's snippet component, so copying strips the
 * comment lines the same way everywhere.
 */
export function Guides({
  go,
  goSection,
}: {
  go: (view: View) => void
  goSection?: (view: View, id: string) => void
}) {
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
              {section.note && section.noteLink === "desktop" ? (
                <p className="prose-note">
                  <a
                    href={`${viewPaths.docsClients}#claude-desktop`}
                    onClick={
                      goSection
                        ? navClick(() => goSection("docsClients", "claude-desktop"))
                        : navClick(() => go("docsClients"))
                    }
                  >
                    {section.note}
                  </a>
                </p>
              ) : null}
            </section>
          ))}

          <p className="prose-foot">
            {guides.moreLead}{" "}
            <a href={viewPaths.docsMcp} onClick={navClick(() => go("docsMcp"))}>
              {guides.moreCta}
            </a>
          </p>
        </article>
      </main>
    </>
  )
}
