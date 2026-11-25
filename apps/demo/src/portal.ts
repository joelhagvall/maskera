import { activeLocale } from "./i18n"
import type { Locale } from "./paths"

export const PORTAL_ORIGIN = "https://app.maskera.dev"

/**
 * Builds a locale-aware link into the customer portal (app.maskera.dev) with
 * attribution parameters. Paths starting with "/" receive the "/en" prefix
 * when the visitor is on the English site, keeping language continuity across
 * the two origins.
 */
export function portalUrl(path: string, content: string, locale: Locale = activeLocale): string {
  const normalized = path.startsWith("/") ? path : `/${path}`
  const localized =
    locale === "en" && !normalized.startsWith("/en") ? `/en${normalized}` : normalized
  const url = new URL(localized, PORTAL_ORIGIN)
  url.searchParams.set("utm_source", "maskera_dev")
  url.searchParams.set("utm_medium", "referral")
  url.searchParams.set("utm_content", content)
  return url.href
}
