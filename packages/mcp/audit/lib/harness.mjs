/**
 * Shared helpers for `@maskera/mcp` audit suites.
 */
import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
export const pkgRoot = resolve(here, "../..")
export const repoRoot = resolve(pkgRoot, "../..")
export const distIndexPath = resolve(pkgRoot, "dist/index.js")
export const distCliPath = resolve(pkgRoot, "dist/cli.js")
export const localModelsDir = resolve(repoRoot, "apps/demo/public/models")
export const localModelId = "maskera-sv-ner-v20"
export const hasLocalNerModel = existsSync(join(localModelsDir, localModelId))

export function getLocalNerEnv() {
  if (!hasLocalNerModel) return {}
  return {
    MASKERA_MODEL_PATH: localModelsDir,
    MASKERA_MODEL_ID: localModelId,
    MASKERA_ALLOW_REMOTE_MODELS: "0",
  }
}

export function getLocalNerOptions() {
  if (!hasLocalNerModel) return undefined
  return {
    localModelPath: localModelsDir,
    model: localModelId,
    allowRemoteModels: false,
  }
}

export function runProcess(
  bin,
  args,
  { cwd = pkgRoot, env = {}, input = "", timeoutMs = 60_000 } = {},
) {
  return new Promise((resolveRun, rejectRun) => {
    const t0 = performance.now()
    const child = spawn(bin, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, timeoutMs)

    child.stdout.on("data", (c) => {
      stdout += c.toString("utf8")
    })
    child.stderr.on("data", (c) => {
      stderr += c.toString("utf8")
    })
    child.on("error", (err) => {
      clearTimeout(timer)
      rejectRun(err)
    })
    child.on("close", (code, signal) => {
      clearTimeout(timer)
      resolveRun({
        code,
        signal,
        timedOut,
        ms: Math.round(performance.now() - t0),
        stdout,
        stderr,
      })
    })
    child.stdin.end(input)
  })
}

export function createSuiteCollector(suiteName) {
  const checks = []
  const tStart = performance.now()

  return {
    async check(id, description, fn) {
      const t0 = performance.now()
      try {
        const detail = await fn()
        checks.push({
          id,
          description,
          status: "PASS",
          ms: Math.round(performance.now() - t0),
          detail: typeof detail === "string" ? detail : "ok",
        })
      } catch (err) {
        checks.push({
          id,
          description,
          status: "FAIL",
          ms: Math.round(performance.now() - t0),
          detail: err instanceof Error ? err.message : String(err),
        })
      }
    },
    record(id, description, status, detail) {
      checks.push({ id, description, status, ms: 0, detail })
    },
    finish(metrics = {}) {
      const passed = checks.filter((c) => c.status === "PASS").length
      const failed = checks.filter((c) => c.status === "FAIL").length
      const blocked = checks.filter((c) => c.status === "BLOCKED").length
      const notTested = checks.filter((c) => c.status === "NOT_TESTED").length
      let status = "PASS"
      if (failed > 0) status = "FAIL"
      else if (blocked > 0 && passed === 0) status = "BLOCKED"
      else if (notTested > 0 && passed === 0) status = "NOT_TESTED"
      return {
        suite: suiteName,
        status,
        durationMs: Math.round(performance.now() - tStart),
        total: checks.length,
        passed,
        failed,
        blocked,
        notTested,
        metrics,
        checks,
      }
    },
  }
}
