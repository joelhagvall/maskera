#!/usr/bin/env node
// Refuses to run the gates on a `main` checkout that is behind origin/main.
//
// On 2026-11-26 agents kept editing the sibling maskera-cloud checkout while
// it sat 26 commits behind origin: every test passed, and committing that tree
// would have reverted passkeys, OTP and three migrations production already
// ran. Both repos run this check so it cannot happen on either side.
// The gates now stop before any work is checked against an old base.
//
// It fetches origin/main at most every FETCH_MAX_AGE_MS, skips CI and
// detached checkouts (release worktrees), and only warns when offline.
import { execFileSync } from "node:child_process"
import { statSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const FETCH_MAX_AGE_MS = 10 * 60 * 1000

/** Pure decision, exported for the test. */
export function decide({ ci, branch, behind, fetchFailed }) {
  if (ci) return { ok: true, reason: "ci" }
  if (branch !== "main") return { ok: true, reason: "not-main" }
  if (behind === null) {
    return {
      ok: true,
      reason: "unknown",
      warning: fetchFailed
        ? "check-fresh-main: could not fetch origin/main; freshness not verified."
        : "check-fresh-main: origin/main not found; freshness not verified.",
    }
  }
  if (behind > 0) {
    return {
      ok: false,
      reason: "behind",
      error:
        `check-fresh-main: main is ${behind} commit(s) behind origin/main.\n` +
        "Work on this checkout would be built on an old base. Update it first:\n" +
        "  git pull --rebase --autostash origin main",
    }
  }
  return { ok: true, reason: "fresh" }
}

/** Whether FETCH_HEAD is missing or older than maxAgeMs. */
export function fetchIsStale(fetchHeadMtimeMs, nowMs, maxAgeMs = FETCH_MAX_AGE_MS) {
  return fetchHeadMtimeMs === null || nowMs - fetchHeadMtimeMs > maxAgeMs
}

function git(args, opts = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    ...opts,
  }).trim()
}

function inspect() {
  const ci = Boolean(process.env.CI || process.env.VERCEL)
  let branch
  try {
    git(["rev-parse", "--git-dir"])
    branch = git(["symbolic-ref", "--quiet", "--short", "HEAD"])
  } catch {
    return { ci, branch: null, behind: null, fetchFailed: false }
  }
  if (ci || branch !== "main") return { ci, branch, behind: null, fetchFailed: false }

  let fetchFailed = false
  let mtime = null
  try {
    mtime = statSync(git(["rev-parse", "--git-path", "FETCH_HEAD"])).mtimeMs
  } catch {}
  if (fetchIsStale(mtime, Date.now())) {
    try {
      git(["fetch", "--quiet", "origin", "main"], { timeout: 15_000 })
    } catch {
      fetchFailed = true
    }
  }
  let behind = null
  try {
    behind = Number(git(["rev-list", "--count", "HEAD..origin/main"]))
  } catch {}
  return { ci, branch, behind, fetchFailed }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = decide(inspect())
  if (result.warning) console.warn(result.warning)
  if (!result.ok) {
    console.error(result.error)
    process.exit(1)
  }
}
