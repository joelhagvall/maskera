// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setActiveLocale } from "../src/i18n"
import { useRoute } from "../src/routing"

const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {})

function setScrollY(value: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value })
}

beforeEach(() => {
  window.history.replaceState(null, "", "/")
  setActiveLocale("sv")
  setScrollY(0)
  scrollTo.mockClear()
})

describe("useRoute scroll restoration", () => {
  it("restores the previous home-page position when returning", () => {
    const { result } = renderHook(() => useRoute())

    setScrollY(640)
    act(() => result.current.navigate("services"))
    act(() => result.current.navigate("demo"))

    expect(scrollTo).toHaveBeenLastCalledWith(0, 640)
  })

  it("does not override a pending section jump", () => {
    const { result } = renderHook(() => useRoute())
    scrollTo.mockClear()

    setScrollY(320)
    act(() => result.current.navigate("transparency", { skipScrollRestoration: true }))

    expect(scrollTo).not.toHaveBeenCalled()
  })
})
