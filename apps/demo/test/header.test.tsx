// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Header } from "../src/components/Header"
import copy from "../src/i18n/sv.json"

describe("Header", () => {
  it("distinguishes the browser demo from local production use", () => {
    const go = vi.fn()
    const { container } = render(<Header go={go} />)

    expect(screen.getByRole("heading", { name: copy.header.title })).toBeTruthy()
    expect(container.querySelector(".hero-local-production")?.textContent).toContain(
      copy.header.localProduction,
    )

    const servicesLink = screen.getByRole("link", { name: new RegExp(copy.header.servicesCta) })
    expect(servicesLink.getAttribute("href")).toBe("/tjanster")
    fireEvent.click(servicesLink)
    expect(go).toHaveBeenCalledWith("services")
  })
})
