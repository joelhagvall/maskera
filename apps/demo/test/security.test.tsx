// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Security } from "../src/components/Security"
import copy from "../src/i18n/sv.json"

describe("Security", () => {
  it("publishes the security boundary and private reporting path", () => {
    render(<Security go={vi.fn()} />)

    expect(screen.getByRole("heading", { name: copy.security.title })).toBeTruthy()
    expect(screen.getByRole("banner")).toBeTruthy()
    expect(screen.getByRole("heading", { name: copy.security.restoreTitle })).toBeTruthy()
    expect(screen.getByRole("heading", { name: copy.security.scopeTitle })).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.security.advisoryCta) })
        .getAttribute("href"),
    ).toBe("https://github.com/joelhagvall/maskera/security/advisories/new")

    for (const item of copy.security.toc) {
      const href = screen.getByRole("link", { name: item.label }).getAttribute("href")
      expect(href).toBe(item.href)
      expect(document.querySelector(item.href)).toBeTruthy()
    }
  })
})
