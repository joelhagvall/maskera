import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { HERO_SCENE_WIDTH, HERO_SCENES, heroScenePath } from "../src/heroScenes"
import en from "../src/i18n/en.json"
import sv from "../src/i18n/sv.json"

/**
 * The hero scenes are captured by maskera-extension `bun run capture:hero`.
 * A recapture can change an image's height (a prompt that wraps to another
 * line); the declared size then reserves the wrong space and the hero shifts
 * as it loads. These checks read the real files.
 */
const publicDir = resolve(__dirname, "..", "public")

/** Pixel size of a WebP (lossy VP8, lossless VP8L or extended VP8X). */
function webpSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.toString("ascii", 0, 4)).toBe("RIFF")
  expect(bytes.toString("ascii", 8, 12)).toBe("WEBP")
  const chunk = bytes.toString("ascii", 12, 16)
  if (chunk === "VP8 ") {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff }
  }
  if (chunk === "VP8L") {
    const bits = bytes.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  if (chunk === "VP8X") {
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 }
  }
  throw new Error(`unknown WebP chunk ${chunk}`)
}

describe("hero scenes", () => {
  it.each(HERO_SCENES.map((scene) => [scene.id, scene.height] as const))(
    "%s has its capture at the declared size",
    (id, height) => {
      const file = resolve(publicDir, heroScenePath(id).slice(1))
      expect(existsSync(file), file).toBe(true)
      expect(webpSize(readFileSync(file))).toEqual({ width: HERO_SCENE_WIDTH, height })
    },
  )

  it("has copy for every scene, in the same order, in both languages", () => {
    const ids = HERO_SCENES.map((scene) => scene.id)
    expect(sv.header.heroScenes.map((scene) => scene.id)).toEqual(ids)
    expect(en.header.heroScenes.map((scene) => scene.id)).toEqual(ids)
  })
})
