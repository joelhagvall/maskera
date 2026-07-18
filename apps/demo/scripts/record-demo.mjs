#!/usr/bin/env node
/**
 * Record the marketing demo clip (apps/demo homepage) to an mp4.
 *
 * Spins up the Vite dev server, drives the free-text example with Playwright,
 * captures a video, and transcodes webm -> mp4 with ffmpeg. The clip shows the
 * green "maskeras AI-modell aktiv" status, the live masking as the text is
 * typed in, and then the round trip: opening "Se hela flödet" to reveal the AI
 * reply (placeholders) and the restored answer (real values back in place).
 *
 * Prereqs (one-off):
 *   pnpm --filter @maskera/demo exec playwright install chromium
 *   brew install ffmpeg
 *
 * Run:
 *   pnpm --filter @maskera/demo record:demo
 *   # optional: OUT=~/Desktop/maskera-demo.mp4 pnpm --filter @maskera/demo record:demo
 */
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PORT = Number(process.env.PORT ?? 5199)
const URL = `http://localhost:${PORT}/`
const OUT = resolve(process.env.OUT ?? join(ROOT, "maskera-demo.mp4"))

// The free-text example that gets typed in. Chosen to trigger every category:
// name, personnummer, phone, address, location.
const TYPE =
  "Kund Anna Karlsson, personnummer 19900101-2385, ringde om sin faktura. Hon når er på 070-174 06 58 och bor på Påhittsgatan 12 i Uppsala. Sammanfatta ärendet."

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { stdio: "inherit", ...opts })
    p.on("error", rej)
    p.on("exit", (code) => (code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))))
  })
}

async function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url)
      if (r.ok) return
    } catch {}
    await sleep(200)
  }
  throw new Error(`dev server never came up at ${url}`)
}

// 1. Start the dev server.
const vite = spawn("pnpm", ["exec", "vite", "--port", String(PORT)], {
  cwd: ROOT,
  stdio: "ignore",
})
const stopVite = () => {
  try {
    vite.kill("SIGTERM")
  } catch {}
}
process.on("exit", stopVite)

try {
  await waitForServer(URL)

  // 2. Record.
  const videoDir = mkdtempSync(join(tmpdir(), "maskera-rec-"))
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: { dir: videoDir, size: { width: 1600, height: 900 } },
  })
  const page = await context.newPage()
  const recStart = Date.now() // video t0 ~ here; used to trim the intro below

  // Scroll so the two cards (.grid) sit near the top of the viewport. The video
  // is later cropped to exactly this region, so we only ever show the input and
  // output boxes — never the header, tabs or the restore section.
  const frameGrid = () =>
    page
      .locator(".grid")
      .first()
      .evaluate((el) => {
        window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 24)
      })

  await page.goto(URL, { waitUntil: "networkidle" })

  // Hide the restore section for the whole recording so its top edge can never
  // bleed into the bottom of the crop while the grid is shorter than its final
  // height. (The clip is only the input/output cards.)
  await page.addStyleTag({ content: ".restore{display:none!important}" })

  // Select the free-text example up front, before framing, so no tab
  // interaction is ever in shot — the clip is only the cards and typing.
  await page.getByRole("button", { name: "Egen text" }).click()
  await frameGrid()

  // Wait for the model to finish loading -> green "aktiv" dot, then re-frame.
  await page.getByText("maskeras AI-modell aktiv").waitFor({ timeout: 120000 })
  await frameGrid()
  await sleep(700)

  // Everything before this point (page load, model download, scrolling) is
  // trimmed out of the final clip so it opens straight on the framed empty
  // cards, a beat before the first keystroke.
  const trimStart = Math.max(0, (Date.now() - recStart) / 1000 - 0.5)

  // Type the free text into the empty editor. focus() (not click) so there is
  // no pointer interaction at all, only keystrokes.
  const editor = page.locator('textarea[name="source-text"]')
  await editor.focus()
  for (const ch of TYPE) {
    await editor.pressSequentially(ch)
    // Slight per-key jitter so the typing reads as human, not a paste.
    await sleep(38 + (ch.charCodeAt(0) % 5) * 10)
  }

  // Let the final analysis settle and the counter/chips fill in.
  await sleep(2600)

  // Measure the cards region now (its tallest, once the output has filled in),
  // padded a touch, clamped to the frame, and rounded to even pixels for h264.
  const box = await page.locator(".grid").first().boundingBox()
  // Roomy on the sides, tight top/bottom so neither the tab row above nor the
  // restore section below bleeds into frame.
  const padX = 24
  const padY = 10
  const clampEven = (n) => Math.max(0, Math.floor(n / 2) * 2)
  const cx = clampEven(box.x - padX)
  const cy = clampEven(box.y - padY)
  const cw = clampEven(Math.min(1600 - cx, box.width + padX * 2))
  const ch2 = clampEven(Math.min(900 - cy, box.height + padY * 2))

  await context.close()
  await browser.close()

  // 3. Transcode webm -> mp4, cropped to just the two cards (25fps, h264).
  const webm = readdirSync(videoDir).find((f) => f.endsWith(".webm"))
  if (!webm) throw new Error("no video was captured")
  const webmPath = join(videoDir, webm)

  if (!hasFfmpeg()) {
    console.log(`ffmpeg not found — leaving raw recording at ${webmPath}`)
  } else {
    await run("ffmpeg", [
      "-v",
      "error",
      "-y",
      "-i",
      webmPath,
      "-ss",
      trimStart.toFixed(3),
      "-vf",
      `crop=${cw}:${ch2}:${cx}:${cy},fps=25`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-crf",
      "22",
      "-movflags",
      "+faststart",
      OUT,
    ])
    console.log(`wrote ${OUT} (${cw}x${ch2})`)
  }
} finally {
  stopVite()
}

function hasFfmpeg() {
  for (const dir of (process.env.PATH ?? "").split(":")) {
    if (dir && existsSync(join(dir, "ffmpeg"))) return true
  }
  return false
}
