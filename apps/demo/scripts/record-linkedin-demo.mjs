#!/usr/bin/env node
/**
 * Record a silent, 4:5 LinkedIn demo from the real Maskera app.
 *
 * The browser is framed inside a branded 1080x1350 stage. The first scene
 * shows live masking as text is typed; the second closes the round trip by
 * showing the AI reply and the locally restored answer.
 *
 * Run:
 *   pnpm --filter @maskera/demo record:linkedin
 *   OUT=~/Desktop/maskera-demo-5.6.mp4 pnpm --filter @maskera/demo record:linkedin
 */
import { spawn } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const PORT = Number(process.env.PORT ?? 5200)
const URL = `http://localhost:${PORT}/`
const OUT = resolve(process.env.OUT ?? join(ROOT, "maskera-demo-5.6.mp4"))
const VERSION = process.env.DEMO_VERSION ?? "demo 5.6"
const TYPE =
  process.env.DEMO_TEXT ??
  "Kund Anna Karlsson, personnummer 19900101-2385, ringde om sin faktura. Hon nås på 070-174 06 58 och bor på Påhittsgatan 12 i Uppsala. Sammanfatta ärendet."
const INTRO_TITLE = process.env.DEMO_INTRO_TITLE ?? "Personuppgifter in.\nPlatshållare ut."
const INTRO_SUBTITLE =
  process.env.DEMO_INTRO_SUBTITLE ?? "Maskera känslig data lokalt innan texten når AI:n."
const RESTORE_TITLE = process.env.DEMO_RESTORE_TITLE ?? "AI:n svarar.\nMaskera återställer."
const RESTORE_SUBTITLE =
  process.env.DEMO_RESTORE_SUBTITLE ??
  "Platshållarna byts tillbaka lokalt – rätt data till rätt person."
const END_TITLE = process.env.DEMO_END_TITLE ?? "Skydda datan\ninnan den når AI:n."
const END_SUBTITLE =
  process.env.DEMO_END_SUBTITLE ??
  "Svensk PII-maskering lokalt i webbläsaren. Maskera, skicka och återställ."

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
        background:
          radial-gradient(circle at 88% 8%, rgba(21,128,61,.09), transparent 28%),
          #f7f8f6;
        color: #0a0a0a;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .stage { position: relative; width: 1080px; height: 1350px; padding: 64px 56px; }
      .topline { display: flex; align-items: center; justify-content: space-between; }
      .brand { display: flex; align-items: center; gap: 12px; font-size: 28px; font-weight: 700; }
      .brand-dot { width: 14px; height: 14px; border-radius: 50%; background: #15803d; }
      .version {
        border: 1px solid rgba(10,10,10,.12);
        border-radius: 999px;
        padding: 8px 14px;
        color: #555;
        font: 600 16px ui-monospace, "SFMono-Regular", Menlo, monospace;
        letter-spacing: .02em;
      }
      .scene { transition: opacity 280ms ease, transform 280ms ease; }
      .scene.out { opacity: 0; transform: translateY(-8px); }
      .copy { margin-top: 72px; }
      h1 {
        margin: 0;
        max-width: 850px;
        font-size: 66px;
        line-height: .98;
        letter-spacing: -.052em;
        font-weight: 720;
      }
      .subtitle {
        margin: 24px 0 0;
        max-width: 770px;
        color: #555;
        font-size: 25px;
        line-height: 1.35;
      }
      .browser {
        position: absolute;
        top: 438px;
        left: 20px;
        width: 1040px;
        height: 570px;
        background: #fff;
        border: 1px solid rgba(10,10,10,.11);
        border-radius: 20px;
        box-shadow: 0 28px 80px rgba(20,30,20,.11), 0 2px 10px rgba(20,30,20,.05);
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
      iframe { display: block; width: 100%; height: 528px; border: 0; background: #fff; }
      .proof {
        position: absolute;
        left: 56px;
        right: 56px;
        top: 1066px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
      }
      .proof-item {
        min-height: 82px;
        padding: 18px 20px;
        border: 1px solid rgba(10,10,10,.09);
        border-radius: 14px;
        background: rgba(255,255,255,.68);
      }
      .proof-kicker { color: #15803d; font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; }
      .proof-value { margin-top: 7px; font-size: 18px; font-weight: 650; }
      .footer {
        position: absolute;
        left: 56px;
        right: 56px;
        bottom: 54px;
        display: flex;
        justify-content: space-between;
        color: #666;
        font-size: 17px;
      }
      .end-card {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        padding: 110px;
        opacity: 0;
        transform: translateY(10px);
        pointer-events: none;
        transition: opacity 320ms ease, transform 320ms ease;
      }
      .end-card.on { opacity: 1; transform: translateY(0); }
      .end-eyebrow { display: flex; align-items: center; gap: 12px; color: #15803d; font-size: 20px; font-weight: 700; }
      .end-card h2 {
        margin: 34px 0 0;
        max-width: 820px;
        font-size: 78px;
        line-height: .98;
        letter-spacing: -.055em;
      }
      .end-card p { margin: 30px 0 0; max-width: 720px; color: #555; font-size: 27px; line-height: 1.4; }
      .cta {
        margin-top: 52px;
        display: inline-flex;
        align-items: center;
        gap: 14px;
        padding: 18px 24px;
        border-radius: 14px;
        background: #0a0a0a;
        color: #fff;
        font-size: 24px;
        font-weight: 650;
      }
    </style>
  </head>
  <body>
    <div class="stage">
      <div class="scene" id="scene">
        <div class="topline">
          <div class="brand"><span class="brand-dot"></span>maskera</div>
          <div class="version">${VERSION}</div>
        </div>
        <div class="copy" id="copy">
          <h1 id="title">${titleHtml(INTRO_TITLE)}</h1>
          <p class="subtitle" id="subtitle">${escapeHtml(INTRO_SUBTITLE)}</p>
        </div>
        <div class="browser">
          <div class="browser-bar">
            <span class="browser-dot"></span><span class="browser-dot"></span><span class="browser-dot"></span>
            <span class="address">maskera.dev</span>
          </div>
          <iframe id="demo" src="${URL}"></iframe>
        </div>
        <div class="proof">
          <div class="proof-item"><div class="proof-kicker">Lokalt</div><div class="proof-value">Körs i webbläsaren</div></div>
          <div class="proof-item"><div class="proof-kicker">Privat</div><div class="proof-value">Originalet lämnar aldrig enheten</div></div>
          <div class="proof-item"><div class="proof-kicker">Öppet</div><div class="proof-value">Open source för svenska flöden</div></div>
        </div>
        <div class="footer"><span>AI-redigering för verkliga arbetsflöden</span><span>maskera.dev</span></div>
      </div>
      <div class="end-card" id="end-card">
        <div class="end-eyebrow"><span class="brand-dot"></span>maskera</div>
        <h2>${titleHtml(END_TITLE)}</h2>
        <p>${escapeHtml(END_SUBTITLE)}</p>
        <div class="cta">Testa själv på maskera.dev <span>→</span></div>
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

  const videoDir = mkdtempSync(join(tmpdir(), "maskera-linkedin-"))
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoDir, size: { width: 1080, height: 1350 } },
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

  await demo.addStyleTag({
    content: `
      html, body { overflow: hidden !important; }
      .app { max-width: none !important; padding: 20px 22px !important; }
      .head-row, .title, .lede, .controls, .footer { display: none !important; }
      main > .grid { margin: 0 !important; }
      .restore { display: none !important; }
      .card { padding: 15px !important; }
      .editor { height: 300px !important; }
      .output { min-height: 174px !important; }
    `,
  })

  const trimStart = Math.max(0, (Date.now() - recordingStartedAt) / 1000 - 0.45)

  await sleep(850)
  const editor = demo.locator('textarea[name="source-text"]').first()
  await editor.focus()
  for (const character of TYPE) {
    await editor.pressSequentially(character)
    await sleep(34 + (character.charCodeAt(0) % 5) * 9)
  }

  await sleep(1700)

  await page.locator("#copy").evaluate((element) => {
    element.style.opacity = "0"
    element.style.transform = "translateY(-8px)"
    element.style.transition = "opacity 260ms ease, transform 260ms ease"
  })
  await sleep(280)
  await page.evaluate(
    ({ restoreTitle, restoreSubtitle }) => {
      document.querySelector("#title").innerHTML = restoreTitle
      document.querySelector("#subtitle").textContent = restoreSubtitle
      const copy = document.querySelector("#copy")
      copy.style.opacity = "1"
      copy.style.transform = "translateY(0)"
    },
    { restoreTitle: titleHtml(RESTORE_TITLE), restoreSubtitle: RESTORE_SUBTITLE },
  )

  await demo.addStyleTag({
    content: `
      main > .grid { display: none !important; }
      .restore {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
      }
      .restore-grid { display: grid !important; margin-top: 14px !important; }
      .reply-editor, .output.restored { height: 218px !important; }
    `,
  })
  await demo.getByRole("button", { name: "Se hela flödet" }).click()
  await sleep(3800)

  await page.locator("#scene").evaluate((element) => element.classList.add("out"))
  await sleep(300)
  await page.locator("#end-card").evaluate((element) => element.classList.add("on"))
  await sleep(2500)

  await context.close()
  await browser.close()

  const webm = readdirSync(videoDir).find((file) => file.endsWith(".webm"))
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
    console.log(`wrote ${OUT} (1080x1350)`)
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
