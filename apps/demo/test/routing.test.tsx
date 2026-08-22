// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, renderHook } from "@testing-library/react"
import type { MouseEvent } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { viewMeta } from "../src/meta"
import { navClick, useRoute, viewFromPath } from "../src/routing"

/**
 * The title behaviour here guards a shipped SEO regression: index.html
 * carries the descriptive static title, and an unconditional
 * `document.title = "maskera"` on mount clobbered it for every JS-rendering
 * crawler. A fresh landing on the home view must therefore leave
 * document.title alone; the short brand title only takes over once the user
 * actually navigates.
 */

const STATIC_TITLE = "Skydda personuppgifter innan texten skickas till AI"
vi.spyOn(window, "scrollTo").mockImplementation(() => {})

beforeEach(() => {
  document.head.innerHTML = `
    <title>${STATIC_TITLE}</title>
    <link rel="canonical" href="https://maskera.dev/">
    <meta name="description" content="startsida">
    <meta property="og:url" content="https://maskera.dev/">
    <meta property="og:title" content="startsida">
    <meta property="og:description" content="startsida">
    <meta name="twitter:title" content="startsida">
    <meta name="twitter:description" content="startsida">
  `
})

function mountAt(path: string) {
  window.history.replaceState(null, "", path)
  document.title = STATIC_TITLE
  return renderHook(() => useRoute())
}

describe("useRoute: initial view from pathname", () => {
  const cases = [
    ["/", "demo"],
    ["/utvecklare", "dev"],
    ["/integritet", "transparency"],
    ["/testdata", "testdata"],
    ["/integritetspolicy", "privacy"],
    ["/tjanster", "services"],
    ["/traffsakerhet", "accuracy"],
    ["/sakerhet", "security"],
    ["/om", "about"],
    ["/utvecklare/", "dev"], // trailing slash
    ["/tjanster///", "services"], // repeated trailing slashes
    ["/okand-sida", "demo"], // unknown path falls back to home
  ] as const

  for (const [path, view] of cases) {
    it(`${path} -> ${view}`, () => {
      const { result, unmount } = mountAt(path)
      expect(result.current.view).toBe(view)
      unmount()
    })
  }
})

describe("viewFromPath: localized paths", () => {
  const cases = [
    ["/en", "demo"],
    ["/en/developers", "dev"],
    ["/en/privacy", "transparency"],
    ["/en/test-data", "testdata"],
    ["/en/privacy-policy", "privacy"],
    ["/en/services", "services"],
    ["/en/accuracy", "accuracy"],
    ["/en/security", "security"],
    ["/en/about", "about"],
    ["/en/security/", "security"],
  ] as const

  for (const [path, view] of cases) {
    it(`${path} -> ${view}`, () => {
      expect(viewFromPath(path)).toBe(view)
    })
  }
})

describe("useRoute: document.title", () => {
  it("fresh landing on / replaces the static title with the bare brand", () => {
    const { unmount } = mountAt("/")
    expect(document.title).toBe("maskera")
    unmount()
  })

  it("fresh landing on a sub-page sets its title immediately", () => {
    const { unmount } = mountAt("/utvecklare")
    expect(document.title).toBe("för utvecklare · maskera")
    unmount()
  })

  it("sets the public-documentation titles on direct landings", () => {
    const accuracy = mountAt("/traffsakerhet")
    expect(document.title).toBe("träffsäkerhet & testresultat · maskera")
    accuracy.unmount()

    const security = mountAt("/sakerhet")
    expect(document.title).toBe("säkerhet · maskera")
    security.unmount()
  })

  it("navigating away from home sets the sub-page title", () => {
    const { result, unmount } = mountAt("/")
    act(() => result.current.navigate("dev"))
    expect(document.title).toBe("för utvecklare · maskera")
    expect(window.location.pathname).toBe("/utvecklare")
    unmount()
  })

  it("navigating back home switches to the bare brand title", () => {
    const { result, unmount } = mountAt("/")
    act(() => result.current.navigate("services"))
    act(() => result.current.navigate("demo"))
    expect(document.title).toBe("maskera")
    expect(window.location.pathname).toBe("/")
    unmount()
  })

  it("popstate counts as navigation and sets the title", () => {
    const { result, unmount } = mountAt("/")
    act(() => {
      window.history.pushState(null, "", "/tjanster")
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    expect(result.current.view).toBe("services")
    expect(document.title).toBe("för företag · maskera")
    unmount()
  })
})

describe("useRoute: route metadata", () => {
  it("positions the home page as both browser-based and self-hosted", () => {
    const indexSource = readFileSync(resolve(process.cwd(), "index.html"), "utf8")

    expect(viewMeta.demo.description).toContain("webbläsaren")
    expect(viewMeta.demo.description).toContain("egna servrar")
    expect(viewMeta.demo.description).toContain("Endast maskerad text")
    expect(indexSource).toContain(viewMeta.demo.description)
    expect(indexSource).toContain("Skydda originaldata när ni använder AI")
  })

  it("sets canonical, description and social metadata on a direct sub-page landing", () => {
    const { unmount } = mountAt("/utvecklare")
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      "https://maskera.dev/utvecklare",
    )
    expect(document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content).toContain(
      "Installera maskera",
    )
    expect(document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content).toBe(
      "https://maskera.dev/utvecklare",
    )
    expect(document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.content).toBe(
      "för utvecklare · maskera",
    )
    unmount()
  })

  it("updates metadata during in-app navigation", () => {
    const { result, unmount } = mountAt("/")
    act(() => result.current.navigate("services"))
    expect(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href).toBe(
      "https://maskera.dev/tjanster",
    )
    expect(document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content).toBe(
      "för företag · maskera",
    )
    expect(
      document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.content,
    ).toContain("Maskera Gateway")
    unmount()
  })
})

describe("navClick", () => {
  const event = (overrides: Partial<MouseEvent<HTMLAnchorElement>> = {}) =>
    ({
      defaultPrevented: false,
      button: 0,
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault: vi.fn(),
      ...overrides,
    }) as unknown as MouseEvent<HTMLAnchorElement>

  it("plain left click routes in-app", () => {
    const go = vi.fn()
    const e = event()
    navClick(go)(e)
    expect(go).toHaveBeenCalledOnce()
    expect(e.preventDefault).toHaveBeenCalledOnce()
  })

  const passthrough = [
    ["cmd-click (new tab)", { metaKey: true }],
    ["ctrl-click", { ctrlKey: true }],
    ["shift-click", { shiftKey: true }],
    ["alt-click", { altKey: true }],
    ["middle click", { button: 1 }],
    ["already handled", { defaultPrevented: true }],
  ] as const

  for (const [name, overrides] of passthrough) {
    it(`${name} keeps native behaviour`, () => {
      const go = vi.fn()
      const e = event(overrides)
      navClick(go)(e)
      expect(go).not.toHaveBeenCalled()
      expect(e.preventDefault).not.toHaveBeenCalled()
    })
  }
})
