// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Faq } from "../src/components/Faq"
import { Guides } from "../src/components/Guides"
import { Industries } from "../src/components/Industries"
import copy from "../src/i18n/sv.json"
import { renderRouteHtml } from "../src/meta"

afterEach(cleanup)

function structuredData(html: string): { "@type": string; mainEntity?: unknown[] } {
  const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
  if (!json) throw new Error("no JSON-LD in the page shell")
  return JSON.parse(json)
}

describe("FAQ page", () => {
  it("shows every question and lists each one in the FAQPage JSON-LD", () => {
    const { container } = render(<Faq go={vi.fn()} />)
    const questions = copy.faq.groups.flatMap((group) => group.items)
    for (const item of questions) {
      expect(screen.getByText(item.q)).toBeTruthy()
      expect(container.querySelector(`#${item.id}`)).toBeTruthy()
    }
    const ld = structuredData(renderRouteHtml("faq", "sv"))
    expect(ld["@type"]).toBe("FAQPage")
    expect(ld.mainEntity).toHaveLength(questions.length)
  })
})

describe("Guides page", () => {
  it("links every section, points Claude Desktop at /docs/klienter and never says Gateway", () => {
    const { container } = render(<Guides go={vi.fn()} />)
    for (const section of copy.guides.sections) {
      expect(container.querySelector(`#${section.id}`)).toBeTruthy()
    }
    const desktop = screen.getByRole("link", { name: new RegExp(copy.guides.sections[0].note) })
    expect(desktop.getAttribute("href")).toBe("/docs/klienter#claude-desktop")
    // "Gateway" is Maskera's dormant self-hosted product name, kept off the public site.
    expect(container.textContent?.toLowerCase()).not.toContain("gateway")
  })
})

describe("Industries page", () => {
  it("opens the demo on an example that exists for every industry", () => {
    const onTryScenario = vi.fn()
    render(<Industries go={vi.fn()} onTryScenario={onTryScenario} />)
    const scenarioIds = copy.scenarios.map((scenario) => scenario.id)
    for (const section of copy.industries.sections) {
      expect(scenarioIds).toContain(section.scenario)
      fireEvent.click(
        screen.getByRole("link", { name: `${copy.industries.tryCta}: ${section.title} →` }),
      )
      expect(onTryScenario).toHaveBeenLastCalledWith(section.scenario)
    }
  })
})
