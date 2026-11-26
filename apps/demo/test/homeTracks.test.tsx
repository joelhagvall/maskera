// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HomeProof, HomeTracks } from "../src/components/HomeTracks"
import copy from "../src/i18n/sv.json"

afterEach(cleanup)

describe("HomeTracks and HomeProof", () => {
  it("links each track to its services section", () => {
    const goSection = vi.fn()
    render(<HomeTracks goSection={goSection} />)

    fireEvent.click(screen.getByRole("link", { name: `${copy.services.tracks[1].cta} →` }))
    expect(goSection).toHaveBeenCalledWith("services", "agenter")
  })

  it("reuses the synced benchmark stats in the proof strip and links to accuracy and security", () => {
    const go = vi.fn()
    render(<HomeProof go={go} />)

    expect(screen.getByText(copy.accuracy.currentStats[2].value)).toBeTruthy()
    expect(screen.getByText(copy.accuracy.currentStats[3].value)).toBeTruthy()

    fireEvent.click(screen.getByRole("link", { name: `${copy.homeProof.accuracyCta} →` }))
    expect(go).toHaveBeenCalledWith("accuracy")

    fireEvent.click(screen.getByRole("link", { name: `${copy.homeProof.securityCta} →` }))
    expect(go).toHaveBeenCalledWith("security")
  })
})
