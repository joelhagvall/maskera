// vercel.json's script-src carries a sha256 for each inline script that
// scripts/prerender.mjs puts into every page: public/theme-init.js (theme
// before first paint) and public/main-loader.js (starts the app bundle after
// the first frame). If either file changes without updating its hash, the
// CSP silently blocks the script: dark-mode users get a light flash, or the
// app never hydrates. So the build verifies they match.

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const INLINE_SCRIPTS = ["theme-init.js", "main-loader.js"]

const vercel = JSON.parse(readFileSync(`${root}/vercel.json`, "utf8"))
const csp = vercel.headers
  .flatMap((group) => group.headers)
  .find((header) => header.key === "Content-Security-Policy")?.value

let ok = true
for (const name of INLINE_SCRIPTS) {
  const source = readFileSync(`${root}/public/${name}`, "utf8")
  const expected = `sha256-${createHash("sha256").update(source).digest("base64")}`
  if (!csp?.includes(`'${expected}'`)) {
    console.error(`vercel.json script-src is missing '${expected}'`)
    console.error(`public/${name} changed: update the hash in the CSP to match.`)
    ok = false
  }
}
if (!ok) process.exit(1)

console.log("inline script CSP hashes match")
