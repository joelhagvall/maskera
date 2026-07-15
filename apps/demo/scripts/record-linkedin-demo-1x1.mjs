#!/usr/bin/env node
/**
 * Record a silent, 1:1 (1080x1080) LinkedIn demo from the real Maskera app.
 *
 * Minimal framing: no marketing headline, just the app in a browser frame
 * with a thin caption line. The two app panels are stacked vertically so the
 * text stays readable at mobile feed sizes. Scene 1 shows live masking as
 * text is typed; scene 2 closes the round trip with the AI reply and the
 * locally restored answer; a text-only end card carries the site's own
 * headline and maskera.dev.
 *
 * Run:
 *   pnpm --filter @maskera/demo record:linkedin:1x1
 *   OUT=~/Desktop/maskera-demo-1x1.mp4 pnpm --filter @maskera/demo record:linkedin:1x1
 */
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PORT = Number(process.env.PORT ?? 5201)
const URL = `http://localhost:${PORT}/`
const OUT = resolve(process.env.OUT ?? join(ROOT, "maskera-demo-1x1.mp4"))
const TYPE =
  process.env.DEMO_TEXT ??
  "Kund Anna Karlsson, personnummer 19900101-2385, ringde om sin faktura. Hon nås på 070-174 06 58 och bor på Påhittsgatan 12 i Uppsala. Sammanfatta ärendet."
const CAPTION =
  process.env.DEMO_CAPTION ?? "Allt sker direkt i din webbläsare. Ingenting lämnar din enhet."
const END_TITLE = process.env.DEMO_END_TITLE ?? "Maskera personuppgifter\ninnan AI:n ser dem."
const END_SUBTITLE =
  process.env.DEMO_END_SUBTITLE ??
  "Öppen källkod. Allt sker direkt i din webbläsare, ingenting lämnar din enhet."

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

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function titleHtml(value) {
  return escapeHtml(value).replaceAll("\n", "<br />")
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

function hostPage() {
  return `<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body {
        background: #f7f8f6;
        color: #0a0a0a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .stage { position: relative; width: 1080px; height: 1080px; padding: 40px 44px; }
      .scene { transition: opacity 300ms ease; }
      .scene.out { opacity: 0; }
      .browser {
        position: absolute;
        top: 40px;
        left: 44px;
        width: 992px;
        height: 952px;
        background: #fff;
        border: 1px solid rgba(10,10,10,.1);
        border-radius: 16px;
        box-shadow: 0 1px 3px rgba(10,10,10,.04);
        overflow: hidden;
      }
      .browser-bar {
        height: 42px;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 16px;
        border-bottom: 1px solid #ececec;
        background: #fbfbfb;
      }
      .browser-dot { width: 9px; height: 9px; border-radius: 50%; background: #d8d8d8; }
      .address {
        margin-left: 12px;
        color: #777;
        font: 500 13px ui-monospace, "SFMono-Regular", Menlo, monospace;
      }
      iframe { display: block; width: 100%; height: 910px; border: 0; background: #fff; }
      .footer {
        position: absolute;
        left: 48px;
        right: 48px;
        bottom: 22px;
        display: flex;
        justify-content: space-between;
        color: #777;
        font-size: 16px;
      }
      .end-card {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        padding: 100px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 340ms ease;
      }
      .end-card.on { opacity: 1; }
      .end-brand { display: flex; align-items: center; gap: 11px; font-size: 24px; font-weight: 700; }
      .brand-dot { width: 12px; height: 12px; border-radius: 50%; background: #15803d; }
      .end-card h2 {
        margin: 36px 0 0;
        max-width: 840px;
        font-size: 58px;
        line-height: 1.06;
        letter-spacing: -.04em;
        font-weight: 700;
      }
      .end-card p { margin: 24px 0 0; max-width: 680px; color: #555; font-size: 22px; line-height: 1.45; }
      .end-url { margin-top: 40px; font-size: 22px; font-weight: 600; color: #15803d; }
    </style>
  </head>
  <body>
    <div class="stage">
      <div class="scene" id="scene">
        <div class="browser">
          <div class="browser-bar">
            <span class="browser-dot"></span><span class="browser-dot"></span><span class="browser-dot"></span>
            <span class="address">maskera.dev</span>
          </div>
          <iframe id="demo" src="${URL}"></iframe>
        </div>
        <div class="footer"><span>${escapeHtml(CAPTION)}</span><span>maskera.dev</span></div>
      </div>
      <div class="end-card" id="end-card">
        <div class="end-brand"><span class="brand-dot"></span>maskera</div>
        <h2>${titleHtml(END_TITLE)}</h2>
        <p>${escapeHtml(END_SUBTITLE)}</p>
        <div class="end-url">maskera.dev</div>
      </div>
    </div>
  </body>
</html>`
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

  const videoDir = mkdtempSync(join(tmpdir(), "maskera-linkedin-1x1-"))
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: 1080, height: 1080 } },
  })
  const page = await context.newPage()
  const recordingStartedAt = Date.now()

  await page.setContent(hostPage(), { waitUntil: "load" })
  const iframe = await page.locator("#demo").elementHandle()
  const demo = await iframe?.contentFrame()
  if (!demo) throw new Error("could not access demo iframe")

  await demo.waitForLoadState("networkidle")
  await demo.getByText("maskeras AI-modell aktiv").waitFor({ timeout: 120000 })
  await demo.getByRole("button", { name: "Egen text" }).click()

  // Stack the two panels vertically: on a square canvas each panel gets the
  // full width, which roughly doubles the text size on mobile feeds compared
  // to the side-by-side layout.
  await demo.addStyleTag({
    content: `
      html, body { overflow: hidden !important; }
      .app { max-width: none !important; padding: 18px 24px !important; }
      .head-row, .title, .lede, .controls, .footer { display: none !important; }
      main > .grid {
        margin: 0 !important;
        grid-template-columns: 1fr !important;
        gap: 14px !important;
      }
      .restore { display: none !important; }
      .card { padding: 14px 16px !important; }
      .editor { height: 290px !important; }
      .editor textarea { font-size: 17px !important; }
      .output { min-height: 290px !important; font-size: 17px !important; }
    `,
  })

  const trimStart = Math.max(0, (Date.now() - recordingStartedAt) / 1000 - 0.45)

  await sleep(850)
  const editor = demo.locator(".editor textarea").first()
  await editor.focus()
  for (const character of TYPE) {
    await editor.pressSequentially(character)
    await sleep(34 + (character.charCodeAt(0) % 5) * 9)
  }

  await sleep(1700)

  await demo.addStyleTag({
    content: `
      main > .grid { display: none !important; }
      .restore {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
      }
      .restore-grid {
        display: grid !important;
        grid-template-columns: 1fr !important;
        gap: 14px !important;
        margin-top: 16px !important;
      }
      .reply-editor, .output.restored { height: 265px !important; font-size: 17px !important; }
    `,
  })
  await demo.getByRole("button", { name: "Se hela flödet" }).click()
  await sleep(3800)

  await page.locator("#scene").evaluate((element) => element.classList.add("out"))
  await sleep(320)
  await page.locator("#end-card").evaluate((element) => element.classList.add("on"))
  await sleep(2500)

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
