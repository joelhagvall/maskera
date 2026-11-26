// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { App } from "../src/App"
import { Services } from "../src/components/Services"
import copy from "../src/i18n/sv.json"
import { registerViews } from "../src/views"

vi.spyOn(window, "scrollTo").mockImplementation(() => {})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, "", "/")
})

describe("jumping to a section on another page", () => {
  it("waits for the target page's chunk instead of firing on the page being left", async () => {
    // Services is loaded; the transparency page is not, so it loads
    // asynchronously, like a first click on the live site.
    registerViews({ services: Services })
    window.history.replaceState(null, "", "/tjanster")
    const jumps: string[] = []
    Element.prototype.scrollIntoView = function (this: Element) {
      jumps.push(this.id)
    }

    render(<App />)
    fireEvent.click(screen.getByRole("link", { name: copy.coverage.linkCta }))

    await waitFor(() => expect(jumps).toEqual(["vad-maskeras"]))
    expect(window.location.pathname).toBe("/integritet")
  })
})
