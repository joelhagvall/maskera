import { describe, expect, it } from "vitest"
import modelMeta from "../src/model-meta.json"
import vercel from "../vercel.json"

describe("model deployment metadata", () => {
  it("keeps the immutable Vercel cache route on the current model directory", () => {
    const modelHeader = vercel.headers.find((entry) => entry.source.startsWith("/models/"))
    expect(modelHeader?.source).toBe(`/models/${modelMeta.directory}/(.*)`)
    expect(modelHeader?.headers).toContainEqual({
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable",
    })
  })
})
