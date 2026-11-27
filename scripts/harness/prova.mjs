#!/usr/bin/env node
/**
 * Lightweight runtime UI verification (`pnpm run prova`) for maskera.dev.
 *
 * Builds `@maskera/demo` (unless `--no-build` or `--base=...`), serves `dist/`
 * on a free local port with Vercel-style clean-URL resolution (`/tjanster` ->
 * `dist/tjanster/index.html`, avoiding `vite preview`'s SPA fallback #418),
 * runs `capture-pages.mjs` across light + dark themes and desktop (1440px) +
 * mobile (390px) asserting 0 px overflow and 0 console/page errors, then writes
 * `.tmp/prova-receipt.json`.
 */
import { execFileSync, spawn } from "node:child_process"
import { createReadStream, existsSync, statSync } from "node:fs"
import { createServer } from "node:http"
import { extname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { writeReceipt } from "./prova-receipt.mjs"

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)))
const DEMO = join(ROOT, "apps", "demo")
const DIST = join(DEMO, "dist")

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webmanifest": "application/manifest+json",
}

function arg(name, fallback = "") {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}

function startDistServer() {
  return new Promise((res, rej) => {
    const server = createServer((req, reply) => {
      const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0])
      const clean = urlPath.replace(/^\/+/, "").replace(/\/+$/, "")
      const candidates = clean
        ? [join(DIST, clean), join(DIST, clean, "index.html"), join(DIST, "index.html")]
        : [join(DIST, "index.html")]
      const target = candidates.find(
        (p) => p.startsWith(DIST) && existsSync(p) && statSync(p).isFile(),
      )
      if (!target) {
        reply.writeHead(404)
        reply.end("Not found")
        return
      }
      reply.writeHead(200, {
        "Content-Type": MIME[extname(target)] ?? "application/octet-stream",
      })
      createReadStream(target).pipe(reply)
    })
    server.on("error", rej)
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      res({ server, base: `http://127.0.0.1:${port}` })
    })
  })
}

function runAsync(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts })
    child.on("error", rej)
    child.on("exit", (code) => {
      if (code === 0) res()
      else rej(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`))
    })
  })
}

async function main() {
  const lang = arg("lang", "sv")
  const only = arg("only", "/,/tjanster,/docs")
  const explicitBase = arg("base", "")
  const noBuild = process.argv.includes("--no-build")

  let base = explicitBase
  let distServer = null

  try {
    if (!base) {
      if (!noBuild) {
        execFileSync("pnpm", ["--filter", "@maskera/demo", "build"], {
          cwd: ROOT,
          stdio: "inherit",
        })
      }
      const started = await startDistServer()
      distServer = started.server
      base = started.base
    }

    const themes = ["light", "dark"]
    for (const theme of themes) {
      const args = [
        join(DEMO, "scripts", "capture-pages.mjs"),
        `--base=${base}`,
        `--lang=${lang}`,
        `--theme=${theme}`,
      ]
      if (only) args.push(`--only=${only}`)
      await runAsync(process.execPath, args, { cwd: DEMO })
    }

    const receipt = writeReceipt({
      command: "pnpm run prova",
      lang,
      only,
      themes,
      viewports: ["desktop:1440", "mobile:390"],
    })
    console.log(
      `prova: verified (${themes.join("+")}, desktop+mobile) and recorded ${Object.keys(receipt.files).length} UI file hash(es) in .tmp/prova-receipt.json`,
    )
  } finally {
    if (distServer) distServer.close()
  }
}

await main()
