import { GITHUB } from "../constants"
import copy from "../i18n"
import { ArrowLeftIcon, ArrowUpRightIcon, MaskeraMark } from "../icons"
import { navClick, type View, viewPaths } from "../routing"
import { LanguageToggle } from "./LanguageToggle"
import { ThemeToggle } from "./ThemeToggle"

/**
 * The shared top bar: wordmark linking home, the nav links minus the current
 * page's own, and GitHub. Sub-pages also get the "back to start" link; the
 * home view instead scrolls to top on the wordmark and keeps the tighter
 * head-row spacing.
 */
export function TopBar({ current, go }: { current: View; go: (view: View) => void }) {
  const home = current === "demo"
  const nav: { view: View; label: string }[] = [
    { view: "dev", label: copy.topBar.developers },
    { view: "services", label: copy.topBar.services },
  ]
  return (
    <>
      <div className={home ? "head-row" : "topbar"}>
        <a
          className="wordmark"
          href={viewPaths.demo}
          onClick={navClick(() => (home ? window.scrollTo(0, 0) : go("demo")))}
        >
          <MaskeraMark size={20} />
          {copy.meta.siteName}
        </a>
        <nav className="head-links">
          {/* Display controls come first, matching app.maskera.dev's theme
              toggle position when a visitor clicks between the two sites. */}
          <ThemeToggle />
          <LanguageToggle current={current} />
          {nav
            .filter((item) => item.view !== current)
            .map((item) => (
              <a
                key={item.view}
                className="ghlink"
                href={viewPaths[item.view]}
                onClick={navClick(() => go(item.view))}
              >
                {item.label}
              </a>
            ))}
          <a className="ghlink" href={GITHUB} target="_blank" rel="noreferrer">
            {copy.navigation.github}
            <ArrowUpRightIcon size={13} />
          </a>
        </nav>
      </div>
      {!home && (
        <a className="back" href={viewPaths.demo} onClick={navClick(() => go("demo"))}>
          <ArrowLeftIcon className="back-arrow" size={16} />
          <span>{copy.topBar.backHome}</span>
        </a>
      )}
    </>
  )
}
