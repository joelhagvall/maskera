import { GITHUB } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon, MaskeraMark } from "../icons"
import { navClick, type View, viewPaths } from "../routing"
import { loadView } from "../views"
import { LanguageToggle } from "./LanguageToggle"
import { ThemeToggle } from "./ThemeToggle"

/**
 * The shared top bar. Every page shows the same nav; the current page is
 * marked with aria-current instead of being dropped, so the bar never shifts
 * between pages. Sub-pages add a breadcrumb (home / page name) in place of a
 * separate back link.
 */
export function TopBar({ current, go }: { current: View; go: (view: View) => void }) {
  const home = current === "demo"
  // Read localized labels during render (never at module load) so SSR
  // prerendering for /en/* and in-page locale switches stay in sync.
  const pageNames: Record<Exclude<View, "demo">, string> = {
    services: copy.navigation.services,
    dev: copy.navigation.developers,
    accuracy: copy.navigation.accuracy,
    security: copy.navigation.security,
    transparency: copy.navigation.transparency,
    testdata: copy.navigation.testData,
    privacy: copy.navigation.privacyPolicy,
    about: copy.navigation.about,
    faq: copy.navigation.faq,
    guides: copy.navigation.guides,
    industries: copy.navigation.industries,
  }
  const nav: readonly { view: View; label: string }[] = [
    { view: "services", label: copy.topBar.services },
    { view: "dev", label: copy.topBar.developers },
    { view: "accuracy", label: copy.topBar.accuracy },
  ]
  return (
    <>
      <div className="head-row">
        <a
          className="wordmark"
          href={viewPaths.demo}
          onMouseEnter={() => {
            if (!home) void loadView("demo")
          }}
          onFocus={() => {
            if (!home) void loadView("demo")
          }}
          onClick={navClick(() => (home ? window.scrollTo(0, 0) : go("demo")))}
        >
          <MaskeraMark size={20} />
          {copy.meta.siteName}
        </a>
        {/* Display controls sit beside the wordmark on phones and right before
            the nav links on desktop, matching app.maskera.dev's theme toggle
            position when a visitor clicks between the two sites. */}
        <div className="head-controls">
          <ThemeToggle />
          <LanguageToggle current={current} />
        </div>
        <nav className="head-links">
          {nav.map((item) => (
            <a
              key={item.view}
              className="ghlink"
              href={viewPaths[item.view]}
              aria-current={item.view === current ? "page" : undefined}
              onMouseEnter={() => void loadView(item.view)}
              onFocus={() => void loadView(item.view)}
              onClick={navClick(() => go(item.view))}
            >
              {item.label}
            </a>
          ))}
          <a className="ghlink head-github" href={GITHUB} target="_blank" rel="noreferrer">
            {copy.navigation.github}
            <ArrowUpRightIcon size={13} />
          </a>
        </nav>
      </div>
      {!home && (
        <nav className="crumbs" aria-label={copy.topBar.breadcrumbLabel}>
          <a href={viewPaths.demo} onClick={navClick(() => go("demo"))}>
            {copy.meta.siteName}
          </a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{pageNames[current]}</span>
        </nav>
      )}
    </>
  )
}
