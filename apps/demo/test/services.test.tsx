// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Services } from "../src/components/Services"
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
    expect(screen.getByText(copy.services.sublede)).toBeTruthy()
    expect(container.textContent?.toLowerCase()).not.toContain("gateway")
    expect(screen.queryAllByRole("tab").map((tab) => tab.textContent)).toEqual(
      copy.agentSetup.modes.map((mode) => mode.label),
    )

    // The table of contents lists every section, and every section exists.
    const toc = screen.getByRole("navigation", { name: copy.services.tocLabel })
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
      "https://app.maskera.dev/downloads/maskera-extension-0.2.0.zip",
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
    expect(agents.getByRole("button", { name: copy.agentSetup.copyPromptCta })).toBeTruthy()
    expect(
      agents
        .getByRole("link", { name: new RegExp(copy.agentSetup.llmsLinkCta) })
        .getAttribute("href"),
    ).toBe("/llms.txt")
    expect(agents.getByText(/npx -y @maskera\/mcp proxy/)).toBeTruthy()
    fireEvent.click(agents.getByRole("tab", { name: /MCP-server/ }))
    expect(agents.getByText(/"mcpServers":/)).toBeTruthy()

    // Own code
    const code = within(container.querySelector("#kod") as HTMLElement)
    expect(code.getByRole("heading", { level: 2 }).textContent).toBe(copy.services.tracks[2].title)
    fireEvent.click(code.getByRole("link", { name: copy.services.sdk.cta }))
    expect(go).toHaveBeenCalledWith("dev")
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
