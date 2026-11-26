import copy from "../i18n"
import type { View } from "../routing"
import { PageToc } from "./PageToc"
import { TopBar } from "./TopBar"

/**
 * Buyer and IT questions in one place, grouped by topic. Each answer is plain
 * text so the page, its Markdown sibling and the FAQPage JSON-LD in meta.ts
 * all read the same strings.
 */
export function Faq({ go }: { go: (view: View) => void }) {
  const faq = copy.faq
  return (
    <>
      <header>
        <TopBar current="faq" go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-with-toc faq-page">
          <h1>{faq.title}</h1>
          <p className="prose-lede">{faq.lede}</p>

          <PageToc
            items={faq.groups.map((group) => ({ href: `#${group.id}`, label: group.title }))}
          />

          {faq.groups.map((group) => (
            <section key={group.id} aria-labelledby={group.id}>
              <h2 id={group.id}>{group.title}</h2>
              <dl className="faq-list">
                {group.items.map((item) => (
                  <div key={item.id} id={item.id} className="faq-item">
                    <dt>{item.q}</dt>
                    <dd>{item.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          <p className="prose-foot">
            {faq.contactLead} <a href="mailto:hej@maskera.dev">{faq.contactCta}</a>
          </p>
        </article>
      </main>
    </>
  )
}
