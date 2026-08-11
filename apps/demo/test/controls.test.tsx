// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { Controls } from "../src/components/Controls"

describe("Controls accessibility", () => {
  it("exposes the selected scenario", () => {
    render(
      <Controls
        activeId="hr"
        onPick={vi.fn()}
        status="idle"
        progress={0}
        analyzing={false}
        onRetryModel={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: /HR/ }).getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: /Kundsupport/ }).getAttribute("aria-pressed")).toBe(
      "false",
    )
    expect(screen.getByRole("status").textContent).toContain("Startar AI-modellen")
    expect(screen.getByText(/43 MB/)).toBeTruthy()
  })

  it("announces model progress with progressbar semantics", () => {
    render(
      <Controls
        activeId="hr"
        onPick={vi.fn()}
        status="loading"
        progress={42}
        analyzing={false}
        onRetryModel={vi.fn()}
      />,
    )

    const progress = screen.getByRole("progressbar", { name: /Laddar maskeras AI-modell/ })
    expect(progress.getAttribute("aria-valuenow")).toBe("42")
    expect(progress.closest('[role="status"]')).not.toBeNull()
    expect(progress.closest(".model-status-group")?.textContent).toContain("sparas lokalt")
  })
})
