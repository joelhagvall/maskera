import { describe, expect, it } from "vitest"
import { LABEL_META } from "../src/labels"

type Rgb = [number, number, number]

function rgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function composite(foreground: Rgb, background: Rgb, alpha: number): Rgb {
  return foreground.map((channel, index) =>
    Math.round(channel * alpha + background[index] * (1 - alpha)),
  ) as Rgb
}

function luminance(color: Rgb) {
  const channels = color.map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrast(first: Rgb, second: Rgb) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

describe("PII label contrast", () => {
  it("keeps every pill label above WCAG AA on every demo surface", () => {
    const surfaces = {
      light: [rgb("#ffffff"), rgb("#fafafa")],
      dark: [rgb("#0a0a0a"), rgb("#111111")],
    }
    const tintAlpha = 0x1a / 255

    for (const [label, meta] of Object.entries(LABEL_META)) {
      for (const [mode, backgrounds] of Object.entries(surfaces)) {
        const text = rgb(mode === "light" ? meta.color : meta.dark)
        for (const surface of backgrounds) {
          const tintedBackground = composite(text, surface, tintAlpha)
          expect(
            contrast(text, tintedBackground),
            `${label} ${mode} pill contrast`,
          ).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
})
