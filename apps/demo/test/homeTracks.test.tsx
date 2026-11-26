// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HomeProof, HomeTracks } from "../src/components/HomeTracks"
import copy from "../src/i18n/sv.json"
import { formatPct, summary } from "../src/independentBench"

afterEach(cleanup)

describe("HomeTracks and HomeProof", () => {
  it("links each track to its services section", () => {
    const goSection = vi.fn()
    render(<HomeTracks goSection={goSection} />)

    fireEvent.click(screen.getByRole("link", { name: `${copy.services.tracks[1].cta} →` }))
    expect(goSection).toHaveBeenCalledWith("services", "agenter")
  })

  it("shows the independent names result and model size, linking to accuracy and security", () => {
    const go = vi.fn()
    render(<HomeProof go={go} />)

    const names = summary.maskera.names
    if (!names) throw new Error("no independent names result")
    const accuracy = screen.getByRole("link", { name: new RegExp(copy.homeProof.accuracyDesc) })
    expect(accuracy.textContent).toContain(formatPct(names.maskedPct))
    fireEvent.click(accuracy)
    expect(go).toHaveBeenCalledWith("accuracy")

    const local = screen.getByRole("link", { name: new RegExp(copy.homeProof.localDesc) })
    expect(local.textContent).toContain("43 MB")
    fireEvent.click(local)
    expect(go).toHaveBeenCalledWith("security")
  })
})
