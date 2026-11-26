import type { ReactElement } from "react"
import {
  EXTENSION_BROWSERS,
  EXTENSION_DOWNLOAD_URL,
  featuredBrowser,
  useVisitorBrowser,
} from "../extensionBrowsers"
import copy from "../i18n"
import { ArrowUpRightIcon, BROWSER_ICONS } from "../icons"
import { portalUrl } from "../portal"
import { navClick, type View, viewPaths } from "../routing"

export const INSTALL_ANCHOR = "installera"

/**
 * Hero call to action. One primary button that fits the visitor: the store
 * button for their browser once that listing is live, the install section
 * until then, and the in-page demo on phones, which cannot run extensions.
 */
export function ExtensionHeroActions({ go }: { go: (view: View) => void }) {
  const text = copy.extensionInstall
  const visitor = useVisitorBrowser()
  const featured = featuredBrowser(visitor, EXTENSION_BROWSERS)
  const others = EXTENSION_BROWSERS.filter((browser) => browser.id !== featured?.id)

  let primary: ReactElement
  if (featured?.storeUrl) {
    const Icon = BROWSER_ICONS[featured.id]
    primary = (
      <a
        className="hero-cta hero-cta-primary"
        href={featured.storeUrl}
        target="_blank"
        rel="noreferrer"
      >
        <Icon size={17} />
        {text.heroAddTo.replace("{browser}", text.browsers[featured.id].name)}
      </a>
    )
  } else if (visitor === "mobile") {
    primary = (
      <a className="hero-cta hero-cta-primary" href="#main-content">
        {text.heroTryDemo}
      </a>
    )
  } else {
    primary = (
      <a className="hero-cta hero-cta-primary" href={`#${INSTALL_ANCHOR}`}>
        {text.heroInstall}
      </a>
    )
  }

  return (
    <div className="hero-install">
      <div className="hero-cta-row">
        {primary}{" "}
        <a
          className="hero-cta hero-cta-secondary"
          href={viewPaths.services}
          onClick={navClick(() => go("services"))}
        >
          {text.heroLearnMore}
        </a>
      </div>
      <p className="hero-browsers">
        <span>{featured ? text.alsoFor : text.builtFor}</span>
        {others.map((browser) => {
          const Icon = BROWSER_ICONS[browser.id]
          return (
            <span
              key={browser.id}
              className="hero-browser"
              role="img"
              aria-label={text.browsers[browser.id].name}
              title={text.browsers[browser.id].name}
            >
              <Icon size={14} />
            </span>
          )
        })}
        <span className="hero-browsers-note">{text.freeNote}</span>
      </p>
    </div>
  )
}

/**
 * The install section: one row per browser with its store, live rows link
 * out and the rest show "Snart". The ZIP stays as a manual fallback until
 * the stores are live. `trialContent` adds the Pro trial link with that
 * attribution tag; pages that already offer the trial leave it out.
 */
export function ExtensionInstall({ trialContent }: { trialContent?: string }) {
  const text = copy.extensionInstall

  return (
    <section id={INSTALL_ANCHOR} aria-labelledby="installera-heading" className="ext-install">
      <div className="ext-install-copy">
        <h2 id="installera-heading" className="ext-install-title">
          {text.title}
        </h2>
        <p className="ext-install-body">{text.body}</p>
        {trialContent ? (
          <a
            className="ext-install-trial"
            href={portalUrl("/login?buy=extension-pro&signup=true", trialContent)}
            target="_blank"
            rel="noreferrer"
          >
            {text.trialCta}
            <ArrowUpRightIcon size={13} />
          </a>
        ) : null}
        <p className="ext-install-zip">
          {text.zipLead}{" "}
          <a href={EXTENSION_DOWNLOAD_URL} download>
            {text.zipCta}
          </a>{" "}
          {text.zipTail}
        </p>
      </div>
      <ul className="ext-browsers" aria-label={text.listLabel}>
        {EXTENSION_BROWSERS.map((browser) => {
          const Icon = BROWSER_ICONS[browser.id]
          const label = text.browsers[browser.id]
          const body = (
            <>
              <Icon size={20} className="ext-browser-icon" />
              <span className="ext-browser-text">
                <span className="ext-browser-name">{label.name}</span>{" "}
                <span className="ext-browser-store">{label.store}</span>
              </span>
            </>
          )
          return (
            <li key={browser.id}>
              {browser.storeUrl ? (
                <a className="ext-browser" href={browser.storeUrl} target="_blank" rel="noreferrer">
                  {body}
                  <ArrowUpRightIcon size={14} className="ext-browser-end" />
                </a>
              ) : (
                <div className="ext-browser ext-browser-soon">
                  {body} <span className="ext-browser-end ext-soon">{text.soon}</span>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
