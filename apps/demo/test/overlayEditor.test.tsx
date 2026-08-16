// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { OverlayEditor } from "../src/components/OverlayEditor"
import { MAX_INPUT_CHARS } from "../src/constants"
import copy from "../src/i18n/sv.json"

function Harness() {
  const [text, setText] = useState("")
  return (
    <OverlayEditor
      value={text}
      onChange={setText}
      name="source-text"
      ariaLabel={copy.inputCard.title}
      highlight={null}
    />
  )
}

describe("OverlayEditor input cap", () => {
  it("truncates over-long input and says so instead of clipping silently", () => {
    render(<Harness />)
    const textarea = screen.getByRole("textbox")

    fireEvent.change(textarea, { target: { value: "a".repeat(MAX_INPUT_CHARS + 500) } })
    expect((textarea as HTMLTextAreaElement).value.length).toBe(MAX_INPUT_CHARS)
    expect(screen.getByRole("status").textContent).toBe(copy.inputCard.limitNote)

    // The note clears on the next in-bounds edit.
    fireEvent.change(textarea, { target: { value: "kort text" } })
    expect(screen.queryByRole("status")).toBeNull()
    cleanup()
  })

  it("accepts input exactly at the cap without a note", () => {
    render(<Harness />)
    const textarea = screen.getByRole("textbox")

    fireEvent.change(textarea, { target: { value: "b".repeat(MAX_INPUT_CHARS) } })
    expect((textarea as HTMLTextAreaElement).value.length).toBe(MAX_INPUT_CHARS)
    expect(screen.queryByRole("status")).toBeNull()
  })
})
