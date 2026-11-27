import { describe, expect, it } from "vitest"
import { onlyPaths } from "../scripts/capture-pages.mjs"

describe("capture-pages --only", () => {
  const paths = ["/", "/utvecklare", "/tjanster"]

  it("keeps every page when --only is empty", () => {
    expect(onlyPaths(paths, "")).toEqual(paths)
  })

  it("keeps just the listed pages, in sitemap order", () => {
    expect(onlyPaths(paths, "/tjanster, /utvecklare")).toEqual(["/utvecklare", "/tjanster"])
  })

  it("refuses a path the sitemap does not have instead of shooting nothing", () => {
    expect(() => onlyPaths(paths, "/developers")).toThrow("/developers")
    expect(() => onlyPaths(paths, "/en/security")).toThrow("English pages need --lang=en")
  })
})
