#!/usr/bin/env node
/**
 * Drive the bench page (bench.html) in headless Chrome and print the results.
 * Measures the exact production configuration: the built demo bundle, the
 * self-hosted model, wasm backend, q4 weights.
 *
 * Setup (puppeteer-core is intentionally not a repo dependency):
 *   BENCH=1 pnpm --filter demo build
 *   npm --prefix <some tmp dir> install puppeteer-core
 *   NODE_PATH=<some tmp dir>/node_modules node apps/demo/scripts/bench-browser.mjs
 *
 * Env:
 *   CHROME       path to a Chrome/Chromium binary
 *                (default: /Applications/Google Chrome.app/Contents/MacOS/Google Chrome)
 *   DEVICE       wasm (default) or webgpu
 *   PORT         port for vite preview (default 4180)
 *
 * Two page loads per run: the first downloads the model into the browser's
 * Cache Storage (first visit), the second reads it back (returning visitor).
 */

import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const puppeteer = require("puppeteer-core")

const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
const DEVICE = process.env.DEVICE ?? "wasm"
const PORT = Number(process.env.PORT ?? 4180)
const demoDir = fileURLToPath(new URL("..", import.meta.url))

// 1. Serve the built bundle.
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
  cwd: demoDir,
  stdio: "ignore",
})
await new Promise((r) => setTimeout(r, 2000))

const profile = mkdtempSync(join(tmpdir(), "maskera-bench-"))

async function loadOnce(browser, label) {
  const page = await browser.newPage()
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("bench timed out")), 300_000)
    page.on("console", (msg) => {
      const text = msg.text()
      if (text.startsWith("BENCH_RESULT ")) {
        clearTimeout(timer)
        resolve(JSON.parse(text.slice("BENCH_RESULT ".length)))
      } else if (text.startsWith("BENCH_ERROR ")) {
        clearTimeout(timer)
        reject(new Error(text))
      }
    })
    page.goto(`http://localhost:${PORT}/bench.html?device=${DEVICE}`)
  })
  console.log(`\n=== ${label} (device=${DEVICE}) ===`)
  console.log(JSON.stringify(result, null, 2))
  await page.close()
  return result
}

try {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: profile,
    args: DEVICE === "webgpu" ? ["--enable-unsafe-webgpu", "--enable-features=Vulkan"] : [],
  })
  await loadOnce(browser, "first visit (model downloaded into Cache Storage)")
  await loadOnce(browser, "returning visitor (model from Cache Storage)")
  await browser.close()
} finally {
  server.kill()
  rmSync(profile, { recursive: true, force: true })
}
