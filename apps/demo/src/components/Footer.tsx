import type { ReactNode } from "react"
import { GITHUB, HF_MODEL } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { portalUrl } from "../portal"
import { navClick, type View, viewPaths } from "../routing"
import { loadView } from "../views"

type FooterLink = { view: View; label: string } | { href: string; label: string }

/**
 * The site footer: three columns of links. Internal pages navigate in-app
 * through `go` and warm their code chunk on hover or focus; external links
 * open in a new tab. The columns are data, so a new page is one entry here.
 */
export function Footer({ go }: { go: (view: View) => void }) {
  // Read localized labels during render, never at module load, so SSR for
  // /en/* and in-page locale switches stay in sync.
  const columns: { heading: string; links: FooterLink[] }[] = [
    {
      heading: copy.footer.columns.product,
      links: [
        { view: "services", label: copy.navigation.services },
        { view: "docs", label: copy.navigation.docs },
        { view: "industries", label: copy.navigation.industries },
        { view: "accuracy", label: copy.navigation.accuracy },
        { href: portalUrl("/login", "footer_portal"), label: copy.footer.portal },
      ],
    },
    {
      heading: copy.footer.columns.trust,
      links: [
        { view: "security", label: copy.navigation.security },
        { view: "transparency", label: copy.navigation.transparency },
        { view: "faq", label: copy.navigation.faq },
        { view: "privacy", label: copy.navigation.privacyPolicy },
        { view: "testdata", label: copy.navigation.testData },
      ],
    },
    {
      heading: copy.footer.columns.project,
      links: [
        { href: GITHUB, label: copy.footer.openSource },
        { href: HF_MODEL, label: copy.footer.modelLink },
        { href: "/whitepaper.pdf", label: copy.footer.whitepaper },
        { view: "about", label: copy.navigation.about },
      ],
    },
  ]

  const renderLink = (link: FooterLink): ReactNode => {
    if ("href" in link) {
      return (
        <a href={link.href} target="_blank" rel="noreferrer">
          {link.label}
          <ArrowUpRightIcon size={12} />
        </a>
      )
    }
    const warm = () => {
      void loadView(link.view)
    }
    return (
      <a
        className="footer-link"
        href={viewPaths[link.view]}
        onMouseEnter={warm}
        onFocus={warm}
        onClick={navClick(() => go(link.view))}
      >
        {link.label}
      </a>
    )
  }

  return (
    <footer className="footer">
      <nav className="footer-grid" aria-label={copy.footer.navLabel}>
        {columns.map((column) => (
          <div key={column.heading} className="footer-col">
            <p className="footer-heading">{column.heading}</p>
            <ul>
              {column.links.map((link) => (
                <li key={link.label}>{renderLink(link)}</li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <p className="footer-row footer-credit">
        {copy.footer.creditPrefix}{" "}
        <a href="https://hagvall-labs.com" target="_blank" rel="noreferrer">
          {copy.footer.author}
        </a>
        .
      </p>
    </footer>
  )
}
