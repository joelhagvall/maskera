#!/usr/bin/env node
// Compiles docs/whitepaper/whitepaper.tex to apps/demo/public/whitepaper.pdf
// with tectonic (brew install tectonic). Re-run after editing the source.
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = resolve(import.meta.dirname, "..")
const src = resolve(root, "docs/whitepaper/whitepaper.tex")
const out = resolve(root, "apps/demo/public/whitepaper.pdf")
const contract = JSON.parse(readFileSync(resolve(root, "docs/benchmark-release.json"), "utf8"))
const publishedEpoch = Date.parse(`${contract.publishedAt}T00:00:00Z`) / 1000
if (!Number.isInteger(publishedEpoch)) {
  throw new Error(`invalid benchmark publishedAt date: ${contract.publishedAt}`)
}

const tectonics = ["/opt/homebrew/bin/tectonic", "/usr/local/bin/tectonic", "/usr/bin/tectonic"]
const tectonic = tectonics.find((p) => existsSync(p))
if (!tectonic) {
  console.error("tectonic not found; install with: brew install tectonic")
  process.exit(1)
}

const workdir = mkdtempSync(join(tmpdir(), "maskera-whitepaper-"))
try {
  execFileSync(tectonic, [src, "--outdir", workdir], {
    stdio: "inherit",
    env: {
      ...process.env,
      SOURCE_DATE_EPOCH: process.env.SOURCE_DATE_EPOCH ?? String(publishedEpoch),
    },
  })
  copyFileSync(join(workdir, "whitepaper.pdf"), out)
  console.log(`wrote ${out}`)
} finally {
  rmSync(workdir, { recursive: true, force: true })
}
