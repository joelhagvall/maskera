// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { About } from "../src/components/About"
import {
  DocsClients,
  DocsMcp,
  DocsOverview,
  DocsSdk,
  DocsTroubleshooting,
  keepFlagsWhole,
} from "../src/components/Docs"
import { Faq } from "../src/components/Faq"
import { Guides } from "../src/components/Guides"
import { PrivacyPolicy } from "../src/components/PrivacyPolicy"
import { Security } from "../src/components/Security"
import { TestData } from "../src/components/TestData"
import { Transparency } from "../src/components/Transparency"
import { linkify } from "../src/linkify"
import { markdownPathFor, PAGE_PATHS, WELL_KNOWN_FILES } from "../src/paths"

afterEach(cleanup)

const KNOWN_SITE_PATHS = new Set<string>([
  ...PAGE_PATHS,
  ...PAGE_PATHS.map(markdownPathFor),
  ...WELL_KNOWN_FILES,
])

const UNLINKED_ADDRESS =
  /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b(?:[\w-]+\.)+(?:com|dev|se|org|net|io)\b(?:\/[^\s<>"']*[^\s<>"'.,;:!?)])?|(?<![\w.:/-])\/[a-z0-9._/-]+[a-z0-9])/gi

const EXAMPLE_HOST = /(?:^|\.)example\.(?:com|org|net)$/i

function unlinkedAddressesIn(root: HTMLElement): string[] {
  const found: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement
    if (!parent || parent.closest("a, pre, code, script, style")) continue
    const text = node.textContent ?? ""
    for (const match of text.matchAll(UNLINKED_ADDRESS)) {
      const value = match[0]
      if (value.startsWith("/")) {
        if (KNOWN_SITE_PATHS.has(value)) found.push(value)
        continue
      }
      if (value.includes("@")) {
        const host = value.slice(value.lastIndexOf("@") + 1)
        if (!EXAMPLE_HOST.test(host)) found.push(value)
        continue
      }
      if (/^https?:\/\//i.test(value)) {
        const host = new URL(value).hostname
        if (!EXAMPLE_HOST.test(host)) found.push(value)
        continue
      }
      const host = value.split("/")[0] ?? ""
      if (!EXAMPLE_HOST.test(host)) found.push(value)
    }
  }
  return found
}

describe("linkify", () => {
  it("links external URLs, real emails, domains and known site paths while skipping example.com and non-routes", () => {
    const go = vi.fn()
    render(
      <p>
        {linkify(
          "Läs /docs.md, /traffsakerhet, maskera.dev/tjanster, http://127.0.0.1:8787/_maskera och hej@maskera.dev men inte prov@example.com, example.com eller /v1 med --no-raw-restore.",
          { go, formatText: keepFlagsWhole },
        )}
      </p>,
    )

    expect(screen.getByRole("link", { name: "/docs.md" }).getAttribute("href")).toBe("/docs.md")
    expect(screen.getByRole("link", { name: "/docs.md" }).getAttribute("target")).toBe("_blank")

    const accuracy = screen.getByRole("link", { name: "/traffsakerhet" })
    expect(accuracy.getAttribute("href")).toBe("/traffsakerhet")
    expect(accuracy.getAttribute("target")).toBeNull()
    fireEvent.click(accuracy)
    expect(go).toHaveBeenCalledWith("accuracy")

    const services = screen.getByRole("link", { name: "maskera.dev/tjanster" })
    expect(services.getAttribute("href")).toBe("/tjanster")
    fireEvent.click(services)
    expect(go).toHaveBeenCalledWith("services")

    expect(
      screen.getByRole("link", { name: "http://127.0.0.1:8787/_maskera" }).getAttribute("href"),
    ).toBe("http://127.0.0.1:8787/_maskera")
    expect(screen.getByRole("link", { name: "hej@maskera.dev" }).getAttribute("href")).toBe(
      "mailto:hej@maskera.dev",
    )

    expect(screen.queryByRole("link", { name: /example\.com/ })).toBeNull()
    expect(screen.queryByRole("link", { name: "/v1" })).toBeNull()
    expect(document.querySelector(".no-break")?.textContent).toBe("--no-raw-restore")
  })

  it("leaves zero unlinked URLs, emails or known site paths on any public prose page", () => {
    const noop = vi.fn()
    const pages: Array<[string, () => ReturnType<typeof render>]> = [
      ["docs", () => render(<DocsOverview go={noop} onCoverage={noop} />)],
      ["docsMcp", () => render(<DocsMcp go={noop} />)],
      ["docsClients", () => render(<DocsClients go={noop} />)],
      ["docsSdk", () => render(<DocsSdk go={noop} />)],
      ["docsTroubleshooting", () => render(<DocsTroubleshooting go={noop} />)],
      ["faq", () => render(<Faq go={noop} />)],
      ["guides", () => render(<Guides go={noop} />)],
      ["about", () => render(<About go={noop} />)],
      ["privacy", () => render(<PrivacyPolicy go={noop} />)],
      ["security", () => render(<Security go={noop} />)],
      ["transparency", () => render(<Transparency go={noop} />)],
      ["testdata", () => render(<TestData go={noop} />)],
    ]

    for (const [name, mount] of pages) {
      const { container } = mount()
      const article = container.querySelector("article")
      expect(article, name).toBeTruthy()
      expect(unlinkedAddressesIn(article as HTMLElement), name).toEqual([])
      cleanup()
    }
  })
})
