/**
 * Shared helpers for `@maskera/mcp` audit suites.
 */
import assert from "node:assert/strict"
import { execFileSync, spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
export const pkgRoot = resolve(here, "../..")
export const repoRoot = resolve(pkgRoot, "../..")
export const distIndexPath = resolve(pkgRoot, "dist/index.js")
export const distCliPath = resolve(pkgRoot, "dist/cli.js")
export const localModelsDir = resolve(repoRoot, "apps/demo/public/models")

function readDemoModelDirectory() {
  try {
    const metaPath = resolve(repoRoot, "apps/demo/src/model-meta.json")
    const meta = JSON.parse(readFileSync(metaPath, "utf8"))
    if (typeof meta?.directory === "string" && meta.directory.trim()) {
      return meta.directory.trim()
    }
  } catch {
    // Running outside a full monorepo checkout; disable local ONNX shortcut.
  }
  return null
}

export const localModelId = readDemoModelDirectory()
export const hasLocalNerModel = Boolean(
  localModelId && existsSync(join(localModelsDir, localModelId)),
)

const WORKSPACE_TARBALL_PACKAGES = ["@maskera/core", "maskera", "@maskera/mcp"]

/**
 * Packs `@maskera/core`, `maskera`, and `@maskera/mcp` into `targetDir` via
 * `pnpm pack` and returns their absolute tarball paths.
 */
export function packWorkspaceTarballs(targetDir) {
  const byName = {}
  const paths = []
  for (const name of WORKSPACE_TARBALL_PACKAGES) {
    const out = execFileSync("pnpm", ["--filter", name, "pack", "--pack-destination", targetDir], {
      cwd: repoRoot,
      encoding: "utf8",
    })
    const tgz = out.trim().split("\n").filter(Boolean).pop()
    assert.ok(tgz && existsSync(tgz), `Failed to pack ${name}`)
    byName[name] = tgz
    paths.push(tgz)
  }
  return {
    core: byName["@maskera/core"],
    ner: byName.maskera,
    mcp: byName["@maskera/mcp"],
    byName,
    paths,
  }
}

/**
 * Installs packed workspace tarballs into a clean throwaway directory with
 * `pnpm.overrides` pinning `@maskera/core` and `maskera` to the local `.tgz`
 * files so transitive dependencies resolve locally instead of querying npm
 * (which fails before a version bump is published and would otherwise test
 * stale registry releases instead of the freshly packed artifacts).
 */
export function installPackedTarballs(
  targetDir,
  tarballs,
  { packageName = "maskera-mcp-clean-install" } = {},
) {
  const rootPkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"))
  writeFileSync(
    join(targetDir, "package.json"),
    JSON.stringify(
      {
        name: packageName,
        private: true,
        ...(rootPkg.packageManager ? { packageManager: rootPkg.packageManager } : {}),
        pnpm: {
          overrides: {
            "@maskera/core": `file:${tarballs.core}`,
            maskera: `file:${tarballs.ner}`,
          },
        },
      },
      null,
      2,
    ),
  )

  const t0 = performance.now()
  try {
    execFileSync("pnpm", ["add", ...tarballs.paths], {
      cwd: targetDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, COREPACK_ENABLE_STRICT: "0" },
    })
  } catch (err) {
    const detail = [err?.stderr, err?.stdout]
      .filter((part) => typeof part === "string" && part.trim())
      .join("\n")
      .trim()
    throw new Error(
      detail ? `${err instanceof Error ? err.message : String(err)}\n${detail}` : String(err),
    )
  }
  const installMs = Math.round(performance.now() - t0)

  const lockfile = readFileSync(join(targetDir, "pnpm-lock.yaml"), "utf8")
  for (const tgzPath of [tarballs.core, tarballs.ner, tarballs.mcp]) {
    const fileName = basename(tgzPath)
    assert.equal(
      lockfile.includes(`file:${fileName}`) || lockfile.includes(`file:${tgzPath}`),
      true,
      `Expected pnpm-lock.yaml to resolve ${fileName} from local tarball`,
    )
  }

  const binPath = join(targetDir, "node_modules/.bin/maskera-mcp")
  const cliPath = join(targetDir, "node_modules/@maskera/mcp/dist/cli.js")
  assert.equal(existsSync(binPath), true, "Installed maskera-mcp binary missing")
  assert.equal(existsSync(cliPath), true, "Installed @maskera/mcp dist/cli.js missing")
  return { installMs, binPath, cliPath }
}

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
