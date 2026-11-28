// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Services } from "../src/components/Services"
import { EXTENSION_DOWNLOAD_URL } from "../src/extensionBrowsers"
import copy from "../src/i18n/sv.json"
import { portalUrl } from "../src/portal"

afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
})

describe("Services", () => {
  it("shows every track on one page, without Gateway references", () => {
    const go = vi.fn()
    const { container } = render(<Services go={go} onCoverage={vi.fn()} />)

    expect(screen.getByRole("banner")).toBeTruthy()
    expect(screen.getByText(copy.services.lede)).toBeTruthy()
    expect(container.textContent?.toLowerCase()).not.toContain("gateway")
    // The agent setup tabs live on the developer page, not here.
    expect(screen.queryAllByRole("tab")).toEqual([])

    // The table of contents lists every section, and every section exists.
    const toc = screen.getByRole("navigation", { name: copy.pageToc.label })
    const hrefs = within(toc)
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"))
    expect(hrefs).toEqual(copy.services.toc.map((item) => item.href))
    for (const href of hrefs) expect(container.querySelector(href ?? "")).toBeTruthy()

    // Overview: one column per track, each linking to its section.
    const overview = screen.getByRole("table", { name: copy.services.overview.title })
    expect(
      within(overview)
        .getAllByRole("columnheader")
        .map((th) => th.textContent),
    ).toEqual(copy.services.tracks.map((track) => track.title))
    expect(
      within(overview)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(["#tillagg", "#agenter", "#kod"])

    // Extension and its Free vs Pro comparison sit together before AI agents and SDK.
    const sectionIds = [...container.querySelectorAll("section.services-section")].map((s) => s.id)
    expect(sectionIds).toEqual(["oversikt", "tillagg", "jamfor", "agenter", "kod"])
    expect(screen.getByRole("list", { name: copy.extensionInstall.listLabel })).toBeTruthy()
    expect(screen.getByRole("table", { name: copy.services.compare.title })).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.services.compare.startTrialCta) })
        .getAttribute("href"),
    ).toContain("app.maskera.dev/login?buy=extension-pro&signup=true")
    expect(
      screen.getByRole("link", { name: copy.services.compare.teamCta }).getAttribute("href"),
    ).toContain("app.maskera.dev/login?buy=extension-team&signup=true")
    expect(
      screen.getByRole("link", { name: copy.services.compare.teamInvoiceCta }).getAttribute("href"),
    ).toBe("mailto:hej@maskera.dev?subject=Maskera%20Team")
    expect(screen.getByRole("link", { name: /Ladda ner ZIP-filen/ }).getAttribute("href")).toBe(
      EXTENSION_DOWNLOAD_URL,
    )
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.services.compare.termsCta) })
        .getAttribute("href"),
    ).toContain("app.maskera.dev/extension/terms")
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.services.compare.privacyCta) })
        .getAttribute("href"),
    ).toContain("app.maskera.dev/extension/privacy")

    // AI agents
    const agents = within(container.querySelector("#agenter") as HTMLElement)
    expect(agents.getByRole("heading", { level: 2 }).textContent).toBe(
      copy.services.tracks[1].title,
    )
    for (const point of copy.services.agents.points) {
      expect(agents.getByText(point)).toBeTruthy()
    }
    // Setup lives in the docs only: no second copy of the agent card here.
    expect(agents.queryByRole("button", { name: copy.agentSetup.copyPromptCta })).toBeNull()
    fireEvent.click(agents.getByRole("link", { name: copy.services.agents.setupCta }))
    expect(go).toHaveBeenCalledWith("docs")

    // Own code
    const code = within(container.querySelector("#kod") as HTMLElement)
    expect(code.getByRole("heading", { level: 2 }).textContent).toBe(copy.services.tracks[2].title)
    fireEvent.click(code.getByRole("link", { name: copy.services.sdk.cta }))
    expect(go).toHaveBeenCalledWith("docsSdk")
  })
})

describe("portal helpers", () => {
  it("localizes portal paths and preserves query parameters", () => {
    expect(portalUrl("/login?buy=extension-pro&signup=true", "demo_test", "sv")).toBe(
      "https://app.maskera.dev/login?buy=extension-pro&signup=true&utm_source=maskera_dev&utm_medium=referral&utm_content=demo_test",
    )
    expect(portalUrl("/login?buy=extension-pro&signup=true", "demo_test", "en")).toBe(
      "https://app.maskera.dev/en/login?buy=extension-pro&signup=true&utm_source=maskera_dev&utm_medium=referral&utm_content=demo_test",
    )
    expect(portalUrl("/extension/terms", "demo_terms", "en")).toBe(
      "https://app.maskera.dev/en/extension/terms?utm_source=maskera_dev&utm_medium=referral&utm_content=demo_terms",
    )
  })
})

describe("Services product scenes", () => {
  it("shows each product in its own section with the same scene as the hero, loaded lazily", () => {
    const { container } = render(<Services go={vi.fn()} onCoverage={vi.fn()} />)
    const scenes = [...container.querySelectorAll<HTMLElement>("figure.product-scene")]
    expect(scenes.map((scene) => [scene.closest("section")?.id, scene.dataset.stage])).toEqual([
      ["tillagg", "browser"],
      ["agenter", "agent"],
      ["kod", "code"],
    ])
    for (const img of scenes[0].querySelectorAll("img")) {
      expect(img.getAttribute("loading")).toBe("lazy")
      expect(img.getAttribute("fetchpriority")).toBeNull()
    }
  })

  it("shows included and not included as a check and a dash with their words for screen readers", () => {
    const compare = copy.services.compare
    const { container } = render(<Services go={vi.fn()} onCoverage={vi.fn()} />)
    const cells = [...container.querySelectorAll(".ext-compare tbody td")]
    const values = compare.rows.flatMap((row) => [row.free, row.pro, row.team])
    expect(cells.map((cell) => (cell.querySelector(".sr-only") ?? cell).textContent)).toEqual(
      values,
    )
    cells.forEach((cell, i) => {
      if (values[i] === compare.included) expect(cell.querySelector("svg")).toBeTruthy()
      if (values[i] === compare.notIncluded) expect(cell.className).toBe("plan-no")
    })
    expect(values.filter((value) => value === compare.included).length).toBeGreaterThan(0)
    expect(values.filter((value) => value === compare.notIncluded).length).toBeGreaterThan(0)
  })
})
