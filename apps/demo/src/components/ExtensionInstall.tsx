import type { ReactElement } from "react"
import {
  EXTENSION_BROWSERS,
  EXTENSION_DOWNLOAD_URL,
  featuredBrowser,
  useVisitorBrowser,
} from "../extensionBrowsers"
import copy from "../i18n"
import { AgentLogoStack, ArrowUpRightIcon, BROWSER_ICONS } from "../icons"
import { navClick, type View, viewPaths } from "../routing"
import { CopyButton } from "./CopyButton"

export const INSTALL_ANCHOR = "installera"

/** The home page's try-it-yourself demo, where phones are sent. */
export const DEMO_ANCHOR = "testa"

/** Where the hero's buttons land on the services page (section ids there). */
export const SERVICES_SECTIONS = {
  extension: "tillagg",
  agents: "agenter",
  code: "kod",
  compare: "jamfor",
} as const

/**
 * Hero call to action. One primary button that fits the visitor: the store
 * button for their browser once that listing is live, the install section on
 * the services page until then, and the in-page demo on phones, which cannot
 * run extensions. The second button gives AI agents the same weight.
 */
export function ExtensionHeroActions({
  goSection,
}: {
  goSection: (view: View, anchor: string) => void
}) {
  const text = copy.extensionInstall
  const visitor = useVisitorBrowser()
  const featured = featuredBrowser(visitor, EXTENSION_BROWSERS)

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
        <Icon size={16} />
        {text.heroAddTo.replace("{browser}", text.browsers[featured.id].name)}
      </a>
    )
  } else if (visitor === "mobile") {
    primary = (
      <a className="hero-cta hero-cta-primary" href={`#${DEMO_ANCHOR}`}>
        {text.heroTryDemo}
      </a>
    )
  } else {
    const Icon = BROWSER_ICONS[visitor]
    primary = (
      <a
        className="hero-cta hero-cta-primary"
        href={`${viewPaths.services}#${SERVICES_SECTIONS.extension}`}
        onClick={navClick(() => goSection("services", SERVICES_SECTIONS.extension))}
      >
        <Icon size={16} />
        {text.heroInstall}
      </a>
    )
  }

  return (
    <div className="hero-install">
      <div className="hero-cta-row">
        {primary}{" "}
        <CopyButton
          text={copy.agentSetup.promptText}
          className="hero-cta hero-cta-agent"
          iconSize={14}
          iconPosition="end"
          leading={<AgentLogoStack />}
          label={text.heroAgents}
          copiedLabel={copy.agentSetup.copiedPromptCta}
          ariaLabel={text.heroAgents}
          title={copy.agentSetup.promptTitle}
        />
      </div>
    </div>
  )
}

/**
 * The install block inside the browser-extension section on the services page:
 * one row per browser with its store, live rows link out and the rest show
 * "Snart". Until the first store listing is live, the ZIP download gets a
 * primary button so visitors clicking "Installera tillägget" get an immediate
 * working path; once a store is live, the ZIP drops back to a quiet note.
 */
export function ExtensionInstall() {
  const text = copy.extensionInstall
  const anyStoreLive = EXTENSION_BROWSERS.some((browser) => Boolean(browser.storeUrl))

  return (
    <div id={INSTALL_ANCHOR} className="ext-install">
      <div className="ext-install-copy">
        <p className="ext-install-body">{text.body}</p>
        {anyStoreLive ? (
          <p className="ext-install-zip">
            {text.zipLead}{" "}
            <a href={EXTENSION_DOWNLOAD_URL} download>
              {text.zipCta}
            </a>{" "}
            {text.zipTail}
          </p>
        ) : (
          <div className="ext-install-direct">
            <a className="ext-zip-cta" href={EXTENSION_DOWNLOAD_URL} download>
              {text.zipCta}
            </a>
            <p className="ext-install-zip">{text.zipSteps}</p>
          </div>
        )}
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
    </div>
  )
}
