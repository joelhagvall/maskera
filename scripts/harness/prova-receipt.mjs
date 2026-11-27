#!/usr/bin/env node
/**
 * Runtime verification receipt guard for `apps/demo/src/`.
 *
 * Pre-commit calls `--check --staged`. When no UI files under `apps/demo/src/`
 * are staged, it exits 0 immediately. When UI files are staged, it checks that
 * `.tmp/prova-receipt.json` matches the exact SHA-256 of every staged UI blob.
 */
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)))
const RECEIPT_PATH = join(ROOT, ".tmp", "prova-receipt.json")
const UI_FILE = /^apps\/demo\/src\/(?!.*\.test\.)/

export function isUiFile(path) {
  return UI_FILE.test(path)
}

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex")
}

export function verifyReceipt(receipt, stagedHashes) {
  const uiFiles = Object.keys(stagedHashes).filter(isUiFile)
  if (uiFiles.length === 0) return { ok: true, missing: [], stale: [] }
  if (receipt?.ok !== true || typeof receipt.files !== "object") {
    return { ok: false, missing: uiFiles, stale: [] }
  }
  const missing = []
  const stale = []
  for (const file of uiFiles) {
    const recorded = receipt.files[file]
    if (!recorded) missing.push(file)
    else if (recorded !== stagedHashes[file]) stale.push(file)
  }
  return { ok: missing.length === 0 && stale.length === 0, missing, stale }
}

function git(args, opts = {}) {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", ...opts })
}

export function writeReceipt(meta = {}) {
  const changed = git(["status", "--porcelain"])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim().split(" -> ").pop())
    .filter((f) => isUiFile(f) && existsSync(join(ROOT, f)))
  const files = {}
  for (const f of changed) {
    files[f] = sha256(readFileSync(join(ROOT, f)))
  }
  const payload = {
    ok: true,
    generatedAt: new Date().toISOString(),
    ...meta,
    files,
  }
  mkdirSync(dirname(RECEIPT_PATH), { recursive: true })
  writeFileSync(RECEIPT_PATH, `${JSON.stringify(payload, null, 2)}\n`)
  return payload
}

function checkStaged() {
  const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
    .split("\n")
    .map((s) => s.trim())
    .filter(isUiFile)
  if (staged.length === 0) return
  const stagedHashes = {}
  for (const file of staged) {
    const blob = execFileSync("git", ["show", `:${file}`], { cwd: ROOT })
    stagedHashes[file] = sha256(blob)
  }
  const receipt = existsSync(RECEIPT_PATH) ? JSON.parse(readFileSync(RECEIPT_PATH, "utf8")) : null
  const result = verifyReceipt(receipt, stagedHashes)
  if (!result.ok) {
    console.error(
      "prova-receipt: staged UI files under apps/demo/src/ have no matching browser receipt.",
    )
    if (result.missing.length > 0) console.error(`  missing: ${result.missing.join(", ")}`)
    if (result.stale.length > 0) console.error(`  stale:   ${result.stale.join(", ")}`)
    console.error(
      "Run `pnpm run prova` (or `pnpm run prova -- --only=/tjanster,/en/services`) before committing.",
    )
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    checkStaged()
  } else if (process.argv.includes("--write")) {
    const receipt = writeReceipt({ command: "manual" })
    console.log(`prova-receipt: wrote ${Object.keys(receipt.files).length} UI file hash(es)`)
  } else {
    console.error("Usage: node scripts/harness/prova-receipt.mjs --check --staged | --write")
    process.exit(1)
  }
}
