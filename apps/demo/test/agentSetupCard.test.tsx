// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AgentSetupCard } from "../src/components/AgentSetupCard"
import copy from "../src/i18n/sv.json"

afterEach(cleanup)

describe("AgentSetupCard", () => {
  it("links the proxy tab to the on-site Claude Desktop guide, and only that tab", () => {
    render(<AgentSetupCard />)

    const guide = screen.getByRole("link", { name: new RegExp(copy.agentSetup.desktopGuideCta) })
    expect(guide.getAttribute("href")).toBe("/docs/klienter#claude-desktop")

    fireEvent.click(screen.getByRole("tab", { name: copy.agentSetup.modes[1].label }))
    expect(
      screen.queryByRole("link", { name: new RegExp(copy.agentSetup.desktopGuideCta) }),
    ).toBeNull()
  })

  it("labels the mode tabs as the manual alternative to the agent prompt", () => {
    const { container } = render(<AgentSetupCard />)

    const label = container.querySelector(".agent-modes-label")
    expect(label?.textContent).toBe(copy.agentSetup.manualLabel)
    expect(label?.nextElementSibling?.querySelector('[role="tablist"]')).toBeTruthy()
    expect(container.querySelector(".agent-prompt-card + .agent-modes")).toBeTruthy()
  })

  it("points at a section that exists on the client guides docs page", () => {
    expect(copy.docs.clients.sections.some((s) => s.id === "claude-desktop")).toBe(true)
  })
})
