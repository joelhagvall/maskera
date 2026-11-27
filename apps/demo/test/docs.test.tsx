// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DocsClients,
  DocsMcp,
  DocsOverview,
  DocsSdk,
  DocsTroubleshooting,
} from "../src/components/Docs"
import copy from "../src/i18n/sv.json"

afterEach(cleanup)

describe("Docs pages", () => {
  const pages = [
    ["overview", DocsOverview, copy.docs.overview],
    ["mcp", DocsMcp, copy.docs.mcp],
    ["clients", DocsClients, copy.docs.clients],
    ["sdk", DocsSdk, copy.docs.sdk],
    ["troubleshooting", DocsTroubleshooting, copy.docs.troubleshooting],
  ] as const

  for (const [name, Component, data] of pages) {
    it(`renders ${name} with TOC anchors, verification box, subnav, and zero Gateway mentions`, () => {
      const go = vi.fn()
      const { container } = render(<Component go={go} />)

      expect(screen.getByRole("heading", { level: 1, name: data.title })).toBeTruthy()
      expect(container.querySelector(".docs-verify")?.textContent).toContain(data.verifyTitle)

      for (const section of data.sections) {
        expect(container.querySelector(`#${section.id}`), section.id).toBeTruthy()
      }

      // Links to /setup-prompt.md and /llms.txt exist in the footer nav
      expect(container.querySelector('a[href="/setup-prompt.md"]')).toBeTruthy()
      expect(container.querySelector('a[href="/llms.txt"]')).toBeTruthy()
      expect(container.textContent?.toLowerCase()).not.toContain("gateway")
    })
  }

  it("navigates between docs pages via the subnav", () => {
    const go = vi.fn()
    render(<DocsOverview go={go} />)

    const mcpLink = screen.getByRole("link", { name: copy.docs.nav.mcp })
    expect(mcpLink.getAttribute("href")).toBe("/docs/mcp")
    fireEvent.click(mcpLink)
    expect(go).toHaveBeenCalledWith("docsMcp")
  })
})
