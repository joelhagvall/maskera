// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import type { MouseEvent } from "react"
import { describe, expect, it, vi } from "vitest"
import { navClick, useRoute } from "../src/routing"

/**
 * The title behaviour here guards a shipped SEO regression: index.html
 * carries the descriptive static title, and an unconditional
 * `document.title = "maskera"` on mount clobbered it for every JS-rendering
 * crawler. A fresh landing on the home view must therefore leave
 * document.title alone; the short brand title only takes over once the user
 * actually navigates.
 */

const STATIC_TITLE = "maskera personuppgifter innan AI:n ser dem"

function mountAt(path: string) {
  window.history.replaceState(null, "", path)
  document.title = STATIC_TITLE
  return renderHook(() => useRoute())
}

describe("useRoute: initial view from pathname", () => {
  const cases = [
    ["/", "demo"],
    ["/developers", "dev"],
    ["/integritet", "transparency"],
    ["/tjanster", "services"],
    ["/developers/", "dev"], // trailing slash
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

describe("useRoute: document.title", () => {
  it("fresh landing on / keeps the static title untouched", () => {
    const { unmount } = mountAt("/")
    expect(document.title).toBe(STATIC_TITLE)
    unmount()
  })

  it("fresh landing on a sub-page sets its title immediately", () => {
    const { unmount } = mountAt("/developers")
    expect(document.title).toBe("för utvecklare · maskera")
    unmount()
  })

  it("navigating away from home sets the sub-page title", () => {
    const { result, unmount } = mountAt("/")
    act(() => result.current.navigate("dev"))
    expect(document.title).toBe("för utvecklare · maskera")
    expect(window.location.pathname).toBe("/developers")
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
    expect(document.title).toBe("tjänster · maskera")
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
