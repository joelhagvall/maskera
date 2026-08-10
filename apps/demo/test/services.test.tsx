// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Services } from "../src/components/Services"
import copy from "../src/i18n/sv.json"

describe("Services", () => {
  it("keeps the featured Gateway first without promising future self-service", () => {
    const { container } = render(<Services go={vi.fn()} onCoverage={vi.fn()} />)

    expect(screen.getByRole("banner")).toBeTruthy()
    expect(screen.getByText(copy.services.lede).textContent?.startsWith("Välj Gateway")).toBe(true)
    expect(screen.getByText(copy.services.sublede)).toBeTruthy()
    expect(container.textContent?.toLowerCase()).not.toContain("självbetjäning")
    const productHeadings = screen
      .getAllByRole("heading", { level: 2 })
      .filter((heading) => ["Maskera Gateway", "Öppen källkod"].includes(heading.textContent ?? ""))

    expect(productHeadings.map((heading) => heading.textContent)).toEqual([
      "Maskera Gateway",
      "Öppen källkod",
    ])
    expect(screen.getByRole("link", { name: /Boka teknisk genomgång/ }).getAttribute("href")).toBe(
      `mailto:hej@maskera.dev?subject=${encodeURIComponent(copy.services.gatewayEmailSubject)}`,
    )
    expect(screen.getByRole("link", { name: /Läs om Gateway/ }).getAttribute("href")).toContain(
      "app.maskera.dev/gateway",
    )
    expect(container.querySelector(".implementation-help")).toBeNull()
  })
})
