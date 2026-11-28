import { useSyncExternalStore } from "react"
import copy from "../i18n"
import { MoonIcon, SunIcon } from "../icons"

/**
 * Light/dark toggle, the same pattern as app.maskera.dev: flips data-theme
 * and color-scheme on <html> (the CSS keys on the attribute, including the
 * light-dark() PII hues), persists the choice in localStorage where the head
 * bootstrap script picks it up before first paint, and keeps the theme-color
 * meta in sync for the browser chrome. Both icons are rendered; CSS shows
 * the one matching the current theme.
 */
/** html[data-theme] as React state. theme-init.js sets it before first paint. */
const themeListeners = new Set<() => void>()
function subscribeTheme(listener: () => void) {
  themeListeners.add(listener)
  return () => themeListeners.delete(listener)
}
const isDark = () => document.documentElement.dataset.theme === "dark"
// The prerendered HTML cannot know the visitor's theme; React reads the real
// value right after hydration, so the pressed state never mismatches.
const isDarkOnServer = () => undefined

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeTheme, isDark, isDarkOnServer)
  return (
    <button
      type="button"
      className="ghlink theme-toggle"
      aria-label={copy.theme.toggle}
      aria-pressed={dark}
      onClick={() => {
        const root = document.documentElement
        const next = root.dataset.theme === "dark" ? "light" : "dark"
        root.dataset.theme = next
        root.style.colorScheme = next
        localStorage.setItem("theme", next)
        for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
          meta.setAttribute("content", next === "dark" ? "#0a0a0a" : "#ffffff")
        }
        for (const listener of themeListeners) listener()
      }}
    >
      <MoonIcon size={14} className="theme-moon" />
      <SunIcon size={14} className="theme-sun" />
    </button>
  )
}
