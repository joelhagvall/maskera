import type { ReactElement } from "react"
import { DEMO_ANCHOR } from "../constants"
import { EXTENSION_BROWSERS, EXTENSION_DOWNLOAD_URL, heroTargets } from "../extensionBrowsers"
import copy from "../i18n"
import { AgentLogoStack, ArrowUpRightIcon, BROWSER_ICONS } from "../icons"
import { navClick, type View, viewPaths } from "../routing"

export const INSTALL_ANCHOR = "installera"

/** Where the hero's buttons land on the services page (section ids there). */
export const SERVICES_SECTIONS = {
  extension: "tillagg",
  agents: "agenter",
  code: "kod",
  compare: "jamfor",
} as const

/**
 * Hero call to action. One primary button that fits the visitor: the store
 * button for their browser once that listing is live. A desktop browser
 * without a listing yet gets the demo on this page instead of a dead-end
 * install link. Phones cannot run desktop extensions, so they get the install
 * section labelled as the desktop extension, with no browser icon. The second
 * button takes AI agents to the docs, where the setup prompt is explained.
 */
export function ExtensionHeroActions({
  go,
  goSection,
}: {
  go: (view: View) => void
  goSection: (view: View, anchor: string) => void
}) {
  const text = copy.extensionInstall

  const primary: ReactElement[] = heroTargets(EXTENSION_BROWSERS).map(
    ({ visitor, storeUrl, via }) => {
      if (visitor === "mobile") {
        return (
          <a
            key={visitor}
            data-for={visitor}
            className="hero-cta hero-cta-primary"
            href={`${viewPaths.services}#${SERVICES_SECTIONS.extension}`}
            onClick={navClick(() => goSection("services", SERVICES_SECTIONS.extension))}
          >
            {text.heroDesktopExtension}
          </a>
        )
      }
      const Icon = BROWSER_ICONS[visitor]
      if (storeUrl) {
        const name = text.browsers[visitor].name
        return (
          <a
            key={visitor}
            data-for={visitor}
            className="hero-cta hero-cta-primary"
            href={storeUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Icon size={16} />
            {via
              ? text.heroAddToVia
                  .replace("{browser}", name)
                  .replace("{store}", text.browsers[via].store)
              : text.heroAddTo.replace("{browser}", name)}
          </a>
        )
      }
      return (
        <a
          key={visitor}
          data-for={visitor}
          className="hero-cta hero-cta-primary"
          href={`${viewPaths.demo}#${DEMO_ANCHOR}`}
          onClick={navClick(() => goSection("demo", DEMO_ANCHOR))}
        >
          {text.heroTryHere}
        </a>
      )
    },
  )

  return (
    <div className="hero-install">
      <div className="hero-cta-row">
        {primary}{" "}
        <a
          className="hero-cta hero-cta-agent"
          href={viewPaths.docs}
          onClick={navClick(() => go("docs"))}
        >
          <AgentLogoStack />
          {text.heroAgents}
        </a>
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
