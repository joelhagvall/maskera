import copy, { activeLocale, type Locale, setActiveLocale } from "../i18n"
import { type View, viewPath } from "../meta"
import { navClick } from "../routing"

export function LanguageToggle({ current }: { current: View }) {
  const nextLocale: Locale = activeLocale === "sv" ? "en" : "sv"
  const hash = typeof window === "undefined" ? "" : window.location.hash
  const href = `${viewPath(current, nextLocale)}${hash}`

  const switchLanguage = () => {
    window.history.pushState(null, "", href)
    setActiveLocale(nextLocale)
  }

  return (
    <a
      className="ghlink language-toggle"
      href={href}
      hrefLang={nextLocale}
      lang={nextLocale}
      aria-label={copy.language.switchLabel}
      title={copy.language.switchLabel}
      onClick={navClick(switchLanguage)}
    >
      {copy.language.switchCode}
    </a>
  )
}
