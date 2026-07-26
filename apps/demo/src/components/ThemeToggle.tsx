import { MoonIcon, SunIcon } from "../icons"

/**
 * Light/dark toggle, the same pattern as app.maskera.dev: flips data-theme
 * and color-scheme on <html> (the CSS keys on the attribute, including the
 * light-dark() PII hues), persists the choice in localStorage where the head
 * bootstrap script picks it up before first paint, and keeps the theme-color
 * meta in sync for the browser chrome. Both icons are rendered; CSS shows
 * the one matching the current theme.
 */
export function ThemeToggle() {
  return (
    <button
      type="button"
      className="ghlink theme-toggle"
      aria-label="Växla mellan ljust och mörkt läge"
      onClick={() => {
        const root = document.documentElement
        const next = root.dataset.theme === "dark" ? "light" : "dark"
        root.dataset.theme = next
        root.style.colorScheme = next
        localStorage.setItem("theme", next)
        for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
          meta.setAttribute("content", next === "dark" ? "#0a0a0a" : "#ffffff")
        }
      }}
    >
      <MoonIcon size={14} className="theme-moon" />
      <SunIcon size={14} className="theme-sun" />
    </button>
  )
}
