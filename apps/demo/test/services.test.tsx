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
  it("renders three product tracks (extension, AI agents, SDK) cleanly without Gateway references", () => {
    const go = vi.fn()
    const { container } = render(<Services go={go} onCoverage={vi.fn()} />)

    expect(screen.getByRole("banner")).toBeTruthy()
    expect(screen.getByText(copy.services.lede)).toBeTruthy()
    expect(screen.getByText(copy.services.sublede)).toBeTruthy()
    expect(container.textContent?.toLowerCase()).not.toContain("gateway")

    const tabs = screen.getAllByRole("tab")
    expect(tabs.map((tab) => tab.textContent)).toEqual(
      copy.services.tracks.map((t) => `${t.title}${t.badge}${t.summary}`),
    )

    // Default track: Browser extension
    expect(screen.getByRole("heading", { name: copy.extensionInstall.title })).toBeTruthy()
    expect(screen.getByRole("list", { name: copy.extensionInstall.listLabel })).toBeTruthy()
    expect(screen.getByRole("table", { name: copy.services.compare.title })).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.services.compare.startTrialCta) })
        .getAttribute("href"),
    ).toContain("app.maskera.dev/login?buy=extension-pro&signup=true")
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

    // Switch to AI agents track
    fireEvent.click(screen.getByRole("tab", { name: /AI-agenter/ }))
    expect(screen.getByRole("heading", { name: copy.services.agents.title })).toBeTruthy()
    expect(screen.getByRole("button", { name: copy.agentSetup.copyPromptCta })).toBeTruthy()
    expect(
      screen
        .getByRole("link", { name: new RegExp(copy.agentSetup.llmsLinkCta) })
        .getAttribute("href"),
    ).toBe("/llms.txt")
    expect(screen.getByText(/npx -y @maskera\/mcp proxy/)).toBeTruthy()

    // Switch agent mode tab to MCP server inside the agents panel
    const agentsPanel = document.getElementById("track-panel-agents")
    expect(agentsPanel).toBeTruthy()
    fireEvent.click(within(agentsPanel as HTMLElement).getByRole("tab", { name: /MCP-server/ }))
    expect(within(agentsPanel as HTMLElement).getByText(/"mcpServers":/)).toBeTruthy()

    // Switch to SDK track and click developer docs link
    fireEvent.click(screen.getByRole("tab", { name: /Egen kod/ }))
    expect(screen.getByRole("heading", { name: copy.services.sdk.title })).toBeTruthy()
    fireEvent.click(screen.getByRole("link", { name: copy.services.sdk.cta }))
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
