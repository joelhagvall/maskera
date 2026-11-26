import { existsSync, readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import {
  HERO_SCENE,
  HERO_SCENE_WIDTH,
  heroScenePath,
  placeholderCount,
  restoreMap,
} from "../src/heroScenes"

/**
 * The browser scene is captured by maskera-extension `bun run capture:hero`.
 * A recapture can change the image's height (a prompt that wraps to another
 * line); the declared size then reserves the wrong space and the hero shifts
 * as it loads. These checks read the real files.
 */
const publicDir = resolve(__dirname, "..", "public")
const extensionScript = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "maskera-extension",
  "scripts",
  "e2e-browsers.ts",
)

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

describe("hero scene", () => {
  it("has its capture at the declared size and leaves no unused preview captures behind", () => {
    const file = resolve(publicDir, heroScenePath(HERO_SCENE.id).slice(1))
    expect(existsSync(file), file).toBe(true)
    expect(webpSize(readFileSync(file))).toEqual({
      width: HERO_SCENE_WIDTH,
      height: HERO_SCENE.height,
    })
    const previews = readdirSync(resolve(publicDir, "hero"))
      .filter((name) => name.startsWith("extension-preview-"))
      .sort()
    expect(previews).toEqual([`extension-preview-${HERO_SCENE.id}.webp`])
  })

  it.runIf(existsSync(extensionScript))(
    "shows the same prompt and masked text as the extension capture",
    () => {
      const script = readFileSync(extensionScript, "utf8")
      expect(script).toContain(JSON.stringify(HERO_SCENE.prompt))
      expect(script).toContain(JSON.stringify(HERO_SCENE.masked))
    },
  )

  it("derives the restore key from the prompt and its masked form", () => {
    expect(restoreMap(HERO_SCENE.prompt, HERO_SCENE.masked)).toEqual({
      "[NAMN_1]": "Bo Ek",
      "[PERSONNUMMER_1]": "781101-2397",
      "[PLATS_1]": "Boden",
      "[NAMN_2]": "Liv",
      "[BANKGIRO_1]": "991-2346",
    })
    expect(placeholderCount(HERO_SCENE.masked)).toBe(5)
  })

  it("replies only with placeholders the model was given", () => {
    const map = restoreMap(HERO_SCENE.prompt, HERO_SCENE.masked)
    const used = HERO_SCENE.reply.match(/\[[A-ZÅÄÖ_]+_\d+\]/g) ?? []
    expect(used.length).toBeGreaterThan(0)
    for (const token of used) expect(map).toHaveProperty([token])
  })

  it("refuses a masked text that does not match its prompt", () => {
    expect(() => restoreMap("Ring Bo.", "Mejla [NAMN_1].")).toThrow()
  })
})
