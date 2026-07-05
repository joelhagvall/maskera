#!/usr/bin/env node
/**
 * Record the marketing demo clip (apps/demo homepage) to an mp4.
 *
 * Spins up the Vite dev server, drives the free-text example with Playwright,
 * captures a video, and transcodes webm -> mp4 with ffmpeg. The clip shows the
 * green "maskeras AI-modell aktiv" status and the live masking as the text is
 * typed in.
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
  "Kund Anna Karlsson, personnummer 19900101-0017, ringde om sin faktura. Hon når er på 070-123 45 67 och bor på Storgatan 12 i Uppsala. Sammanfatta ärendet."

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
  await page.goto(URL, { waitUntil: "networkidle" })

  // Wait for the model to finish loading -> green "aktiv" dot.
  await page.getByText("maskeras AI-modell aktiv").waitFor({ timeout: 120000 })

  // Frame on the tool: put the controls row near the top of the viewport.
  await page.locator(".controls").evaluate((el) => {
    const y = el.getBoundingClientRect().top + window.scrollY - 40
    window.scrollTo(0, y)
  })
  await sleep(1000)

  // Switch to the free-text tab and type into the empty editor.
  await page.getByRole("button", { name: "Egen text" }).click()
  await sleep(600)
  const editor = page.locator(".editor textarea")
  await editor.click()
  for (const ch of TYPE) {
    await editor.pressSequentially(ch)
    // Slight per-key jitter so the typing reads as human, not a paste.
    await sleep(38 + (ch.charCodeAt(0) % 5) * 10)
  }

  // Let the final analysis settle and the counter/chips fill in.
  await sleep(2600)

  await context.close()
  await browser.close()

  // 3. Transcode webm -> mp4 (1600x900, 25fps, h264) to match the shipped clip.
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
      "-vf",
      "scale=1600:900:flags=lanczos,fps=25",
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
    console.log(`wrote ${OUT}`)
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
