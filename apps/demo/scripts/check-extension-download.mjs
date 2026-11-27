#!/usr/bin/env node
// Fails when the extension ZIP that maskera.dev links is not served by
// app.maskera.dev. Runs before every production build (--if-production), so
// bumping EXTENSION_ZIP_VERSION ahead of `bun run release --upload` in
// maskera-extension cannot ship a 404 link. Run it without flags to check now.
import { readFileSync } from "node:fs"

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8")

/** The ZIP URL extensionBrowsers.ts builds, read from source without a TS loader. */
export function linkedZipUrl(
  browsersSource = read("../src/extensionBrowsers.ts"),
  portalSource = read("../src/portal.ts"),
) {
  const version = browsersSource.match(/export const EXTENSION_ZIP_VERSION = "([^"]+)"/)?.[1]
  const origin = portalSource.match(/export const PORTAL_ORIGIN = "([^"]+)"/)?.[1]
  if (!version || !origin) throw new Error("EXTENSION_ZIP_VERSION or PORTAL_ORIGIN not found")
  return `${origin}/downloads/maskera-extension-${version}.zip`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--if-production") && process.env.VERCEL_ENV !== "production") {
    console.log("extension download check: skipped outside a production deployment")
    process.exit(0)
  }
  const url = linkedZipUrl()
  const res = await fetch(url, { method: "HEAD", cache: "no-store" })
  const bytes = Number(res.headers.get("content-length") ?? 0)
  if (res.status !== 200 || bytes < 1_000_000) {
    console.error(
      `extension download check FAILED: ${url} answered ${res.status} with ${bytes} bytes`,
    )
    process.exit(1)
  }
  console.log(`extension download check: ${url} serves ${bytes} bytes`)
}
