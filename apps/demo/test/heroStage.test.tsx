// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HeroStage } from "../src/components/HeroStage"
import copy from "../src/i18n/sv.json"
import { AUTO_ADVANCE_MS } from "../src/useAutoAdvance"

const stage = copy.header.stage

function mockMedia(matching: string[]) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: matching.includes(query) }))
}

function activeTab() {
  return screen.getAllByRole("button", { pressed: true }).find((b) => b.classList.contains("tab"))
    ?.textContent
}

function tick(ms = AUTO_ADVANCE_MS) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("HeroStage rotation", () => {
  it("shows the next scene on its own and wraps around", () => {
    mockMedia([])
    render(<HeroStage />)
    expect(activeTab()).toBe(stage.tabs.browser)
    tick()
    expect(activeTab()).toBe(stage.tabs.agent)
    tick()
    tick()
    expect(activeTab()).toBe(stage.tabs.browser)
  })

  it("stops for good when the visitor picks a scene", () => {
    mockMedia([])
    render(<HeroStage />)
    fireEvent.click(screen.getByRole("button", { name: stage.tabs.code }))
    tick(AUTO_ADVANCE_MS * 3)
    expect(activeTab()).toBe(stage.tabs.code)
    expect(screen.getByRole("button", { name: stage.play })).toBeTruthy()
  })

  it("holds while hovered and pauses and plays from its button", () => {
    mockMedia([])
    const { container } = render(<HeroStage />)
    const scenes = container.querySelector(".hero-product") as HTMLElement
    fireEvent.mouseEnter(scenes)
    tick(AUTO_ADVANCE_MS * 2)
    expect(activeTab()).toBe(stage.tabs.browser)
    fireEvent.mouseLeave(scenes)
    fireEvent.click(screen.getByRole("button", { name: stage.pause }))
    tick(AUTO_ADVANCE_MS * 2)
    expect(activeTab()).toBe(stage.tabs.browser)
    fireEvent.click(screen.getByRole("button", { name: stage.play }))
    tick()
    expect(activeTab()).toBe(stage.tabs.agent)
  })

  it("never moves for reduced motion or on phones", () => {
    for (const query of ["(prefers-reduced-motion: reduce)", "(max-width: 720px)"]) {
      mockMedia([query])
      render(<HeroStage />)
      tick(AUTO_ADVANCE_MS * 2)
      expect(activeTab(), query).toBe(stage.tabs.browser)
      cleanup()
    }
  })
})
