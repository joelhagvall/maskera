#!/usr/bin/env node
/**
 * End-to-end smoke test for the browser model runtime.
 *
 * Unlike the hook unit tests, this loads the built worker, the self-hosted
 * ONNX Runtime module, its matching WASM binary and the real model weights.
 * It therefore catches missing runtime variants and bundling/runtime
 * incompatibilities before they reach a visitor.
 */
import { existsSync, readdirSync, statSync } from "node:fs"
import { dirname, extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, webkit } from "playwright"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const URL = process.env.MODEL_SMOKE_URL ?? "http://127.0.0.1:4173/"
const TIMEOUT_MS = Number(process.env.MODEL_SMOKE_TIMEOUT_MS ?? 120_000)
const browserTypes = { chromium, webkit }
const requestedBrowsers = (process.env.MODEL_SMOKE_BROWSERS ?? "chromium,webkit")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean)

function assertRuntimePairs() {
  // A remote canary cannot inspect its deployment filesystem; the real
  // browser load below is the assertion in that mode.
  if (!URL.startsWith("http://127.0.0.1") && !URL.startsWith("http://localhost")) return

  const ortDir = join(ROOT, "dist", "ort")
  if (!existsSync(ortDir)) throw new Error(`missing built runtime directory: ${ortDir}`)

  const files = readdirSync(ortDir).filter((file) => file.startsWith("ort-wasm-simd-threaded"))
  const modules = files.filter((file) => extname(file) === ".mjs")
  if (modules.length === 0) throw new Error("built demo contains no ONNX Runtime modules")

  for (const moduleFile of modules) {
    const wasmFile = moduleFile.replace(/\.mjs$/, ".wasm")
    const wasmPath = join(ortDir, wasmFile)
    if (!existsSync(wasmPath) || statSync(wasmPath).size === 0) {
      throw new Error(`ONNX Runtime module ${moduleFile} has no matching ${wasmFile}`)
    }
  }
}

function relevant(url) {
  return /\/assets\/ner\.worker-|\/ort\/|\/models\/maskera-sv-ner-/.test(url)
}

async function smoke(name) {
  const browserType = browserTypes[name]
  if (!browserType) throw new Error(`unsupported smoke browser: ${name}`)

  const browser = await browserType.launch({ headless: true })
  const failures = []
  try {
    const context = await browser.newContext({ serviceWorkers: "block" })
    const page = await context.newPage()

    page.on("pageerror", (error) => failures.push(`page error: ${error.message}`))
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(`console error: ${message.text()}`)
    })
    page.on("requestfailed", (request) => {
      if (relevant(request.url())) {
        const errorText = request.failure()?.errorText ?? "unknown"
        // Our Transformers.js patch deliberately cancels local-file metadata
        // probes once the real model request owns the body. Chromium reports
        // those canceled probe GETs as ERR_ABORTED (Chromium) or "cancelled"
        // (WebKit) even though loading succeeds.
        if (
          request.url().includes("/models/") &&
          (errorText === "net::ERR_ABORTED" || errorText === "cancelled")
        ) {
          return
        }
        failures.push(`request failed: ${request.url()} (${errorText})`)
      }
    })
    page.on("response", (response) => {
      if (relevant(response.url()) && response.status() >= 400) {
        failures.push(`response ${response.status()}: ${response.url()}`)
      }
    })

    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 30_000 })

    const ready = page.getByText("maskeras AI-modell aktiv", { exact: true })
    const failed = page.getByText("AI-modellen kunde inte laddas.", { exact: false })
    const outcome = await Promise.race([
      ready.waitFor({ timeout: TIMEOUT_MS }).then(() => "ready"),
      failed.waitFor({ timeout: TIMEOUT_MS }).then(() => "failed"),
    ])

    if (outcome === "failed") failures.push("the UI reported that the AI model could not load")
    if (failures.length > 0) throw new Error(failures.join("\n"))

    console.log(`model smoke passed in ${name}: ${URL}`)
    await context.close()
  } finally {
    await browser.close()
  }
}

assertRuntimePairs()
for (const name of requestedBrowsers) await smoke(name)
