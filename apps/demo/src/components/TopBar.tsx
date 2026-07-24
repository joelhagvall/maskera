import { GITHUB } from "../constants"
import { ArrowUpRightIcon, MaskeraMark } from "../icons"
import { navClick, type View, viewPaths } from "../routing"

const NAV: { view: View; label: string }[] = [
  { view: "dev", label: "För utvecklare" },
  { view: "services", label: "För företag" },
]

/**
 * The shared top bar: wordmark linking home, the nav links minus the current
 * page's own, and GitHub. Sub-pages also get the "back to start" link; the
 * home view instead scrolls to top on the wordmark and keeps the tighter
 * head-row spacing.
 */
export function TopBar({ current, go }: { current: View; go: (view: View) => void }) {
  const home = current === "demo"
  return (
    <>
      <div className={home ? "head-row" : "topbar"}>
        <a
          className="wordmark"
          href={viewPaths.demo}
          onClick={navClick(() => (home ? window.scrollTo(0, 0) : go("demo")))}
        >
          <MaskeraMark size={20} />
          maskera
        </a>
        <nav className="head-links">
          {NAV.filter((item) => item.view !== current).map((item) => (
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
            GitHub
            <ArrowUpRightIcon size={13} />
          </a>
        </nav>
      </div>
      {!home && (
        <a className="back" href={viewPaths.demo} onClick={navClick(() => go("demo"))}>
          ← Tillbaka till startsidan
        </a>
      )}
    </>
  )
}
