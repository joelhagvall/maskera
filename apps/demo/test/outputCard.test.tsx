// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { OutputCard } from "../src/components/OutputCard"
import copy from "../src/i18n"

const empty = { text: "", redactions: [], map: {} }

afterEach(cleanup)

describe("OutputCard coverage link", () => {
  it("links to the coverage section and navigates client-side", () => {
    const onCoverage = vi.fn()
    const { getByText } = render(
      <OutputCard
        result={empty}
        analyzing={false}
        invalidPnrs={[]}
        showMap={false}
        onToggleMap={vi.fn()}
        onCoverage={onCoverage}
      />,
    )
    const link = getByText(copy.outputCard.coverageLink) as HTMLAnchorElement
    expect(link.getAttribute("href")).toBe("/integritet#vad-maskeras")
    fireEvent.click(link)
    expect(onCoverage).toHaveBeenCalledTimes(1)
  })
})
