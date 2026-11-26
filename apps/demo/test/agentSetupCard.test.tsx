// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { AgentSetupCard } from "../src/components/AgentSetupCard"
import { MCP_DESKTOP_GUIDE } from "../src/constants"
import copy from "../src/i18n/sv.json"

afterEach(cleanup)

/** GitHub's heading anchor: lower case, punctuation dropped, spaces to dashes. */
function githubSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N} -]/gu, "")
    .replace(/ /g, "-")
}

describe("AgentSetupCard", () => {
  it("links the proxy tab to the Claude Desktop guide, and only that tab", () => {
    render(<AgentSetupCard />)

    const guide = screen.getByRole("link", { name: new RegExp(copy.agentSetup.desktopGuideCta) })
    expect(guide.getAttribute("href")).toBe(MCP_DESKTOP_GUIDE)

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

  it("points at a heading that exists in the @maskera/mcp README", () => {
    const readme = readFileSync(resolve(__dirname, "../../../packages/mcp/README.md"), "utf8")
    const anchors = [...readme.matchAll(/^#{1,6} (.+)$/gm)].map((m) => githubSlug(m[1]))
    expect(anchors).toContain(MCP_DESKTOP_GUIDE.split("#")[1])
  })
})
