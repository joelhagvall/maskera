// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Header } from "../src/components/Header"
import { HERO_SCENE } from "../src/heroScenes"
import copy from "../src/i18n/sv.json"

const stage = copy.header.stage

function renderHeader() {
  const goSection = vi.fn()
  const view = render(<Header go={vi.fn()} goSection={goSection} />)
  return { ...view, goSection }
}

describe("Header", () => {
  it("gives the extension and AI agents a call to action each", async () => {
    const { container } = renderHeader()

    expect(screen.getByRole("heading", { name: copy.header.title })).toBeTruthy()
    expect(screen.getByText(copy.header.browserEmphasis).tagName).toBe("STRONG")
    expect(container.querySelector(".lede-marker")?.textContent).toBe("[NAMN_1]")
    expect(container.querySelector(".lede")?.textContent).not.toContain("{marker}")
    const agents = screen.getByRole("link", { name: copy.extensionInstall.heroAgents })
    expect(agents.querySelectorAll(".agent-logo-badge")).toHaveLength(4)
    expect(agents.getAttribute("href")).toBe("/docs")
  })

  it("renders the hero heading text exactly once", () => {
    const { container } = renderHeader()
    // Crawlers read the h1's text content; responsive variants of the same
    // sentence used to triple it.
    expect(container.querySelector("h1")?.textContent).toBe(copy.header.title)
    expect(copy.header.titleMobile.split("\n").join(" ")).toBe(copy.header.title)
  })

  it("shows real extension captures that ship with the site", () => {
    const { container } = renderHeader()
    for (const alt of [stage.browserAlt, copy.header.productPopupAlt]) {
      const image = within(container).getByAltText(alt)
      const src = image.getAttribute("src") ?? ""
      const publicDir = join(dirname(fileURLToPath(import.meta.url)), "../public")
      expect(existsSync(join(publicDir, src)), src).toBe(true)
      expect(image.getAttribute("width")).toBeTruthy()
      expect(image.getAttribute("height")).toBeTruthy()
    }
  })

  it("shows the same masked sentence in the agent and code scenes", () => {
    const { container } = renderHeader()
    for (const id of ["agent", "code"]) {
      const scene = container.querySelector(`[data-stage="${id}"]`)
      expect(scene?.textContent).toContain(HERO_SCENE.masked)
    }
    // The agent scene names no single agent in its window, only in the note.
    const agentScene = container.querySelector('[data-stage="agent"]')
    expect(agentScene?.textContent).toContain(stage.agent.worksWith)
    expect(agentScene?.textContent).toContain(stage.agent.maskedCount.replace("{count}", "5"))
  })

  it("shows the agent run as calls to real @maskera/mcp tools", () => {
    const { container } = renderHeader()
    const agentScene = container.querySelector('[data-stage="agent"]')
    const calls = [...(agentScene?.querySelectorAll(".agent-call-name") ?? [])].map(
      (call) => call.textContent,
    )
    expect(calls).toEqual(["maskera_read_file", "maskera_write_file"])
    // A renamed or removed tool must fail here, not leave the hero showing a
    // call no agent can make.
    const server = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../../packages/mcp/src/server.ts"),
      "utf8",
    )
    for (const name of calls) expect(server).toContain(`name: "${name}"`)
  })

  it("switches between the three places on tab click", () => {
    const { container } = renderHeader()
    const active = () =>
      container.querySelector(".hero-stage-scene.is-active")?.getAttribute("data-stage")
    expect(active()).toBe("browser")

    const group = within(container).getByRole("group", { name: stage.label })
    fireEvent.click(within(group).getByRole("button", { name: stage.tabs.agent }))
    expect(active()).toBe("agent")
    // Only the shown scene is exposed to assistive tech and the tab order.
    const exposed = [...container.querySelectorAll(".hero-stage-scene:not([aria-hidden])")]
    expect(exposed.map((scene) => scene.getAttribute("data-stage"))).toEqual(["agent"])
    expect(container.querySelector('[data-stage="browser"]')?.hasAttribute("inert")).toBe(true)
  })
})
