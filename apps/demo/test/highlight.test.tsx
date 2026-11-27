// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { highlight } from "../src/highlight"

function comments(line: string): string[] {
  const { container } = render(<code>{highlight(line)}</code>)
  return [...container.querySelectorAll(".tok-c")].map((el) => el.textContent ?? "")
}

describe("highlight", () => {
  it("keeps URLs in commands as plain text, not comments", () => {
    expect(comments("ANTHROPIC_BASE_URL=http://127.0.0.1:8787 claude")).toEqual([])
    expect(comments("claude mcp add --transport http maskera 'http://127.0.0.1:8787/mcp'")).toEqual(
      [],
    )
    expect(comments("open http://127.0.0.1:8787/_maskera#top")).toEqual([])
  })

  it("still marks whole-line and trailing comments", () => {
    expect(comments("# 1. Enkel start")).toEqual(["# 1. Enkel start"])
    expect(comments("  // q8 är snabbast")).toEqual(["// q8 är snabbast"])
    expect(comments("npx -y @maskera/mcp guard # blockerar")).toEqual(["# blockerar"])
  })

  it("keeps a URL inside a comment line one comment token", () => {
    expect(comments("# http://127.0.0.1:8787/mcp?no_raw_restore=1")).toEqual([
      "# http://127.0.0.1:8787/mcp?no_raw_restore=1",
    ])
  })
})
