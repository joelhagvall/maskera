import type { ReactElement } from "react"
import { EXTENSION_BROWSERS, EXTENSION_DOWNLOAD_URL, heroTargets } from "../extensionBrowsers"
import copy, { activeLocale } from "../i18n"
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
 * without its own listing yet (Firefox, Safari) still gets the extension,
 * named for the browsers it installs in today ("Se tillägget för Chrome och
 * Edge"), never an install button that ends at "Snart". Phones cannot run
 * desktop extensions, so they get the install section labelled as the
 * desktop extension, with no browser icon. The second button takes AI agents
 * to the docs, where the setup prompt is explained.
 */
export function ExtensionHeroActions({
  go,
  goSection,
}: {
  go: (view: View) => void
  goSection: (view: View, anchor: string) => void
}) {
  const text = copy.extensionInstall
  const targets = heroTargets(EXTENSION_BROWSERS)
  const installable = targets
    .filter(({ visitor, storeUrl }) => visitor !== "mobile" && storeUrl)
    .map(({ visitor }) => text.browsers[visitor as keyof typeof text.browsers].name)
  const otherBrowserLabel =
    installable.length > 0
      ? text.heroOtherBrowser.replace(
          "{browsers}",
          new Intl.ListFormat(activeLocale, { type: "conjunction" }).format(installable),
        )
      : text.heroDesktopExtension

  const primary: ReactElement[] = targets.map(({ visitor, storeUrl, via }) => {
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
        href={`${viewPaths.services}#${SERVICES_SECTIONS.extension}`}
        onClick={navClick(() => goSection("services", SERVICES_SECTIONS.extension))}
      >
        {otherBrowserLabel}
      </a>
    )
  })

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
          // Edge installs from the Chrome Web Store until its own listing is
          // live: the same target the hero button uses.
          const target = heroTargets(EXTENSION_BROWSERS).find((t) => t.visitor === browser.id)
          const storeUrl = browser.storeUrl ?? target?.storeUrl ?? null
          const store = target?.via ? text.browsers[target.via].store : label.store
          const body = (
            <>
              <Icon size={20} className="ext-browser-icon" />
              <span className="ext-browser-text">
                <span className="ext-browser-name">{label.name}</span>{" "}
                <span className="ext-browser-store">{store}</span>
              </span>
            </>
          )
          return (
            <li key={browser.id}>
              {storeUrl ? (
                <a className="ext-browser" href={storeUrl} target="_blank" rel="noreferrer">
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
