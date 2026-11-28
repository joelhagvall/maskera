import { DEMO_ANCHOR } from "../constants"
import copy from "../i18n"
import { navClick, type View, viewPaths } from "../routing"
import { PageToc } from "./PageToc"
import { TopBar } from "./TopBar"

/**
 * One section per industry: the kind of text, what is masked, and a link that
 * opens the home demo on the matching example (a scenario id from
 * copy.scenarios), so the claim can be tried at once.
 */
export function Industries({
  go,
  onTryScenario,
}: {
  go: (view: View) => void
  onTryScenario: (id: string) => void
}) {
  const industries = copy.industries
  return (
    <>
      <header>
        <TopBar current="industries" go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-with-toc industries-page">
          <h1>{industries.title}</h1>

          <PageToc
            items={industries.sections.map((section) => ({
              href: `#${section.id}`,
              label: section.title,
            }))}
          />

          {industries.sections.map((section) => (
            <section key={section.id} aria-labelledby={section.id}>
              <h2 id={section.id}>{section.title}</h2>
              <p className="prose-body">{section.body}</p>
              <p className="prose-note">
                <strong>{industries.maskedLabel}</strong> {section.masked}
              </p>
              <p className="prose-body">
                <a
                  href={`${viewPaths.demo}#${DEMO_ANCHOR}`}
                  onClick={navClick(() => onTryScenario(section.scenario))}
                >
                  {industries.tryCta}
                  <span className="sr-only">: {section.title}</span> →
                </a>
              </p>
            </section>
          ))}
        </article>
      </main>
    </>
  )
}
