import copy from "../i18n"
import { linkify } from "../linkify"
import { navClick, type View, viewPaths } from "../routing"
import { PageToc } from "./PageToc"
import { TopBar } from "./TopBar"

/**
 * The trust-anchor page: what Maskera is, who operates it and how to reach
 * them. Agents and auditors probe /about and /contact for exactly this, so
 * the locale-less aliases in vercel.json redirect here (see src/paths.ts).
 */
export function About({ go }: { go: (view: View) => void }) {
  return (
    <>
      <header>
        <TopBar current="about" go={go} />
      </header>

      <main id="main-content">
        <article className="prose prose-with-toc about-page">
          <h1>{copy.about.title}</h1>
          <p className="prose-lede">{copy.about.lede}</p>

          <PageToc label={copy.about.tocLabel} items={copy.about.toc} />

          <h2 id="vad">{copy.about.whatTitle}</h2>
          {copy.about.what.map((paragraph) => (
            <p className="prose-body" key={paragraph}>
              {paragraph}
            </p>
          ))}

          <h2 id="anvanda">{copy.about.useTitle}</h2>
          {copy.about.use.map((paragraph) => (
            <p className="prose-body" key={paragraph}>
              {linkify(paragraph)}
            </p>
          ))}
          <p className="prose-body">
            <a href={viewPaths.dev} onClick={navClick(() => go("dev"))}>
              {copy.about.developersCta}
            </a>
          </p>

          <h2 id="bakom">{copy.about.whoTitle}</h2>
          <p className="prose-body">{linkify(copy.about.who)}</p>
          <p className="prose-body">
            <a href={viewPaths.privacy} onClick={navClick(() => go("privacy"))}>
              {copy.about.privacyCta}
            </a>
          </p>

          <h2 id="kontakt">{copy.about.contactTitle}</h2>
          <ul>
            {copy.about.contact.map((item) => (
              <li key={item.title}>
                <strong>{item.title}:</strong> {linkify(item.body)}
              </li>
            ))}
          </ul>
          <p className="prose-body">
            <a href={viewPaths.security} onClick={navClick(() => go("security"))}>
              {copy.about.securityCta}
            </a>
          </p>
        </article>
      </main>
    </>
  )
}
