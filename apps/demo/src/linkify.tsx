import { Fragment, type ReactNode } from "react"
import { markdownPathFor, PAGE_PATHS, pathsByLocale, type View, WELL_KNOWN_FILES } from "./paths"
import { navClick, viewPaths } from "./routing"

// Matches full URLs, e-mail addresses, bare domains (hagvall-labs.com,
// maskera.dev/tjanster) and leading-slash site paths (/docs.md, /llms.txt,
// /traffsakerhet) inside copy strings so every real address renders as a link.
const ADDRESS =
  /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b(?:[\w-]+\.)+(?:com|dev|se|org|net|io)\b(?:\/[^\s<>"']*[^\s<>"'.,;:!?)])?|(?<![\w.:/-])\/[a-z0-9._/-]+[a-z0-9])/gi

const EXAMPLE_HOST = /(?:^|\.)example\.(?:com|org|net)$/i

const SITE_PAGE_VIEWS = new Map<string, View>()
for (const locale of ["sv", "en"] as const) {
  for (const [view, path] of Object.entries(pathsByLocale[locale]) as [View, string][]) {
    SITE_PAGE_VIEWS.set(path, view)
  }
}

const SITE_STATIC_PATHS = new Set<string>([...PAGE_PATHS.map(markdownPathFor), ...WELL_KNOWN_FILES])

interface ResolvedLink {
  href: string
  external: boolean
  view?: View
}

function resolveAddress(address: string): ResolvedLink | null {
  if (/^https?:\/\//i.test(address)) {
    try {
      const url = new URL(address)
      if (EXAMPLE_HOST.test(url.hostname)) return null
    } catch {
      return null
    }
    return { href: address, external: true }
  }

  if (address.includes("@")) {
    const host = address.slice(address.lastIndexOf("@") + 1)
    if (EXAMPLE_HOST.test(host)) return null
    return { href: `mailto:${address}`, external: false }
  }

  if (address.startsWith("/")) {
    const view = SITE_PAGE_VIEWS.get(address)
    if (view) return { href: address, external: false, view }
    if (SITE_STATIC_PATHS.has(address)) return { href: address, external: true }
    return null
  }

  const slash = address.indexOf("/")
  const host = (slash === -1 ? address : address.slice(0, slash)).toLowerCase()
  if (EXAMPLE_HOST.test(host)) return null

  if (host === "maskera.dev") {
    const path = slash === -1 ? "" : address.slice(slash)
    if (!path || path === "/") {
      return { href: viewPaths.demo, external: false, view: "demo" }
    }
    const view = SITE_PAGE_VIEWS.get(path)
    if (view) return { href: path, external: false, view }
    if (SITE_STATIC_PATHS.has(path)) return { href: path, external: true }
  }

  return { href: `https://${address}`, external: true }
}

export interface LinkifyOptions {
  /** In-app route handler for internal maskera.dev pages. */
  go?: (view: View) => void
  /** Optional formatter applied to non-link plain-text segments. */
  formatText?: (segment: string) => ReactNode
}

export function linkify(text: string, options: LinkifyOptions = {}): ReactNode[] {
  const { go, formatText } = options
  const out: ReactNode[] = []
  let last = 0

  const pushPlain = (segment: string, key: string) => {
    if (!segment) return
    out.push(formatText ? <Fragment key={key}>{formatText(segment)}</Fragment> : segment)
  }

  for (const match of text.matchAll(ADDRESS)) {
    const start = match.index ?? 0
    const address = match[0]
    const resolved = resolveAddress(address)
    if (!resolved) continue
    if (start > last) pushPlain(text.slice(last, start), `t-${last}`)
    out.push(
      <a
        key={`${start}-${address}`}
        href={resolved.href}
        onClick={resolved.view && go ? navClick(() => go(resolved.view as View)) : undefined}
        {...(resolved.external ? { target: "_blank", rel: "noreferrer" } : {})}
      >
        {address}
      </a>,
    )
    last = start + address.length
  }
  if (last < text.length) pushPlain(text.slice(last), `t-${last}`)
  return out
}
