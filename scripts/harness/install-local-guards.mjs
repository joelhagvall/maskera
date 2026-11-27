#!/usr/bin/env node
/**
 * Installs the versioned Git hooks under `.githooks/`.
 * Runs automatically from `prepare` on `pnpm install` (`--if-possible`),
 * skipping CI, Vercel, and non-git directories.
 */
import { execFileSync, spawnSync } from "node:child_process"
import { chmodSync } from "node:fs"

const ifPossible = process.argv.includes("--if-possible")

function skip(reason) {
  if (ifPossible) {
    console.log(`Git hooks not installed: ${reason}.`)
    process.exit(0)
  }
  throw new Error(reason)
}

if (ifPossible && (process.env.CI || process.env.VERCEL)) {
  skip("CI or deployment build")
}
const inside = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" })
if (inside.status !== 0 || inside.stdout.trim() !== "true") skip("not inside a Git work tree")

const current = spawnSync("git", ["config", "--get", "core.hooksPath"], { encoding: "utf8" })
if (current.status !== 0 && current.status !== 1) skip("could not inspect Git hook configuration")
const hookPath = current.stdout.trim()
if (hookPath && hookPath !== ".githooks") {
  skip(`existing hooksPath ${hookPath}; integrate guards without replacing other hooks`)
}

for (const hook of ["pre-commit", "pre-push"]) chmodSync(`.githooks/${hook}`, 0o755)
execFileSync("git", ["config", "--local", "core.hooksPath", ".githooks"])
console.log("maskera Git hooks installed (.githooks).")
