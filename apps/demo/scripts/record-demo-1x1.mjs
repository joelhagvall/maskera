#!/usr/bin/env node
/**
 * Record the bare masking clip (like record-demo.mjs) but square, 1080x1080.
 *
 * No branding stage, no scenes, no end card: just the two cards, stacked
 * vertically so each gets the full width and the text stays readable at
 * mobile feed sizes. The clip shows the live masking as the text is typed,
 * then holds while the counter and chips settle.
 *
 * Run:
 *   pnpm --filter @maskera/demo record:demo:1x1
 *   OUT=~/Desktop/maskera-demo-1x1.mp4 pnpm --filter @maskera/demo record:demo:1x1
 */
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PORT = Number(process.env.PORT ?? 5202)
const URL = `http://localhost:${PORT}/`
const OUT = resolve(process.env.OUT ?? join(ROOT, "maskera-demo-mask-1x1.mp4"))

// The free-text example that gets typed in. Chosen to trigger every category:
// name, personnummer, phone, address, location.
const TYPE =
  process.env.DEMO_TEXT ??
  "Kund Anna Karlsson, personnummer 19900101-2385, ringde om sin faktura. Hon nås på 070-174 06 58 och bor på Påhittsgatan 12 i Uppsala. Sammanfatta ärendet."

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

function run(cmd, args, opts = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const process = spawn(cmd, args, { stdio: "inherit", ...opts })
    process.on("error", rejectPromise)
    process.on("exit", (code) =>
      code === 0 ? resolvePromise() : rejectPromise(new Error(`${cmd} exited with code ${code}`)),
    )
  })
}

async function waitForServer(url, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {}
    await sleep(200)
  }
  throw new Error(`dev server never came up at ${url}`)
}

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

  const videoDir = mkdtempSync(join(tmpdir(), "maskera-mask-1x1-"))
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: 1080, height: 1080 } },
  })
  const page = await context.newPage()
  const recordingStartedAt = Date.now()

  await page.goto(URL, { waitUntil: "networkidle" })
  await page.getByText("maskeras AI-modell aktiv").waitFor({ timeout: 120000 })
  await page.getByRole("button", { name: "Egen text" }).click()

  // Only the two cards, stacked so each gets the full width of the square
  // canvas. Everything else on the page is hidden.
  await page.addStyleTag({
    content: `
      html, body { overflow: hidden !important; background: #fff !important; }
      .app { max-width: none !important; padding: 26px 30px !important; }
      .head-row, .title, .lede, .controls, .footer { display: none !important; }
      main > .grid {
        margin: 0 !important;
        grid-template-columns: 1fr !important;
        gap: 18px !important;
      }
      .restore { display: none !important; }
      .card { padding: 16px 18px !important; }
      .editor { height: 385px !important; }
      textarea[name="source-text"] { font-size: 17px !important; }
      .output { min-height: 385px !important; font-size: 17px !important; }
    `,
  })

  const trimStart = Math.max(0, (Date.now() - recordingStartedAt) / 1000 - 0.5)

  await sleep(850)
  const editor = page.locator('textarea[name="source-text"]').first()
  await editor.focus()
  for (const character of TYPE) {
    await editor.pressSequentially(character)
    await sleep(38 + (character.charCodeAt(0) % 5) * 10)
  }

  // Let the final analysis settle and the counter/chips fill in.
  await sleep(2600)

  await context.close()
  await browser.close()

  const webm = readdirSync(videoDir).find((file) => file.endsWith(".webm"))
  if (!webm) throw new Error("no video was captured")
  const webmPath = join(videoDir, webm)

  if (!hasFfmpeg()) {
    console.log(`ffmpeg not found, leaving raw recording at ${webmPath}`)
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
      "fps=25",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "high",
      "-crf",
      "20",
      "-movflags",
      "+faststart",
      OUT,
    ])
    console.log(`wrote ${OUT} (1080x1080)`)
  }
} finally {
  stopVite()
}

function hasFfmpeg() {
  for (const directory of (process.env.PATH ?? "").split(":")) {
    if (directory && existsSync(join(directory, "ffmpeg"))) return true
  }
  return false
}
