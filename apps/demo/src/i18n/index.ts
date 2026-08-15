import { useSyncExternalStore } from "react"
import en from "./en.json"
import sv from "./sv.json"

export type Locale = "sv" | "en"
export type Copy = typeof sv

export const copies: Record<Locale, Copy> = { sv, en }

export function localeFromPath(pathname: string): Locale {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "sv"
}

export let activeLocale: Locale =
  typeof window === "undefined" ? "sv" : localeFromPath(window.location.pathname)

const listeners = new Set<() => void>()

export function setActiveLocale(locale: Locale) {
  if (locale === activeLocale) return
  activeLocale = locale
  // The build-time prerender runs this in Node, where there is no document.
  if (typeof document !== "undefined") document.documentElement.lang = locale
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLocale(): Locale {
  return useSyncExternalStore(
    subscribe,
    () => activeLocale,
    // Server snapshot: the build-time prerender sets activeLocale per route
    // before rendering, and the browser derives it from the URL at module
    // load, so both sides hydrate against the same locale.
    () => activeLocale,
  )
}

// Components read copy during render. The proxy keeps those reads localized
// after an in-page language switch without forcing every leaf component to
// subscribe separately; useRoute's locale subscription rerenders the App tree.
const copy = new Proxy(sv, {
  get(_target, property: keyof Copy) {
    return copies[activeLocale][property]
  },
}) as Copy

export default copy
