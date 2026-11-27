/**
 * Real-Client E2E Integration Audit Suite (`audit:clients`).
 *
 * 1. Packs and cleanly installs `@maskera/mcp` into a throwaway directory so
 *    real clients execute the ACTUAL distributable artifact (not internal src).
 * 2. Runs the real installed CLI harnesses (`claude`, `codex`, `opencode`) via
 *    `scripts/e2e-harnesses.mjs` pointed at the installed binary (zero paid API
 *    calls unless `--live` is explicitly passed with `--max-usd`).
 * 3. Explicitly reports unavailable GUI/daemon/paid-cloud clients as NOT_TESTED.
 */
import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import {
  createSuiteCollector,
  hasLocalNerModel,
  pkgRoot,
  repoRoot,
  runProcess,
} from "../lib/harness.mjs"

function detectBinary(name) {
  const res = spawnSync("which", [name], { encoding: "utf8" })
  if (res.status !== 0 || !res.stdout.trim()) return null
  const ver = spawnSync(name, ["--version"], { encoding: "utf8", timeout: 5_000 })
  return {
    path: res.stdout.trim(),
    version: (ver.stdout || ver.stderr || "").trim().split("\n")[0] || "unknown",
  }
}

export async function runClientsAudit(options = {}) {
  const suite = createSuiteCollector("clients")
  const live = options.live === true
  const claudeBin = detectBinary("claude")
  const codexBin = detectBinary("codex")
  const opencodeBin = detectBinary("opencode")
  const ollamaBin = detectBinary("ollama")
  const hasClaudeDesktopApp = existsSync("/Applications/Claude.app")
  const hasCursorApp = existsSync("/Applications/Cursor.app")

  const availableCliClients = [
    ...(claudeBin ? ["claude"] : []),
    ...(codexBin ? ["codex"] : []),
    ...(opencodeBin ? ["opencode"] : []),
  ]

  const clientInventory = {
    claudeCode: claudeBin ? `INSTALLED (${claudeBin.version})` : "NOT_INSTALLED",
    codexCli: codexBin ? `INSTALLED (${codexBin.version})` : "NOT_INSTALLED",
    openCode: opencodeBin ? `INSTALLED (${opencodeBin.version})` : "NOT_INSTALLED",
    claudeDesktopGui: hasClaudeDesktopApp ? "INSTALLED_GUI_UNAUTOMATABLE" : "NOT_INSTALLED",
    cursorIde: hasCursorApp ? "INSTALLED_GUI_UNAUTOMATABLE" : "NOT_INSTALLED",
    ollamaLocal: ollamaBin ? "INSTALLED_DAEMON_CHECK" : "NOT_INSTALLED",
  }

  if (availableCliClients.length === 0) {
    suite.record(
      "real-cli-clients",
      "Real installed CLI harnesses (claude, codex, opencode)",
      "NOT_TESTED",
      "No real AI CLI client binaries (claude, codex, opencode) found on PATH in this environment",
    )
  } else {
    // Pack & install real tarball first so we test the distributable artifact
    const installDir = await mkdtemp(join(tmpdir(), "maskera-audit-clients-"))
    try {
      const rootPkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"))
      const tarballs = ["@maskera/core", "maskera", "@maskera/mcp"].map((name) => {
        const out = execFileSync(
          "pnpm",
          ["--filter", name, "pack", "--pack-destination", installDir],
          { cwd: repoRoot, encoding: "utf8" },
        )
        return out.trim().split("\n").filter(Boolean).pop()
      })
      await writeFile(
        join(installDir, "package.json"),
        JSON.stringify(
          {
            name: "maskera-audit-client-install",
            private: true,
            ...(rootPkg.packageManager ? { packageManager: rootPkg.packageManager } : {}),
          },
          null,
          2,
        ),
      )
      execFileSync("pnpm", ["add", ...tarballs], {
        cwd: installDir,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, COREPACK_ENABLE_STRICT: "0" },
      })
      const installedCli = join(installDir, "node_modules/@maskera/mcp/dist/cli.js")
      assert.equal(existsSync(installedCli), true, "Installed @maskera/mcp dist/cli.js missing")

      const harnessScript = resolve(pkgRoot, "scripts/e2e-harnesses.mjs")
      const modeArg = hasLocalNerModel ? "both" : "rules"
      const args = [
        harnessScript,
        "--only",
        availableCliClients.join(","),
        "--mode",
        modeArg,
        "--json",
      ]

      await suite.check(
        "real-cli-harnesses-installed-artifact",
        `Real clients (${availableCliClients.join(", ")}) over cleanly installed @maskera/mcp tarball (${modeArg})`,
        async () => {
          const run = await runProcess(process.execPath, args, {
            cwd: pkgRoot,
            env: { MASKERA_MCP_CLI: installedCli },
            timeoutMs: 180_000,
          })
          assert.equal(
            run.code,
            0,
            `e2e-harnesses failed (${run.code}):\n${run.stderr}\n${run.stdout}`,
          )
          const parsed = JSON.parse(run.stdout)
          assert.equal(parsed.ok, true)
          const summary = parsed.results
            .map(
              (r) =>
                `${r.harness}/${r.lane}:${r.status}(${r.totalMs}ms,redactions=${r.redactions})`,
            )
            .join(", ")
          return summary
        },
      )
    } finally {
      await rm(installDir, { recursive: true, force: true })
    }
  }

  // Explicitly document GUI & external paid cloud & local daemon clients as NOT_TESTED
  suite.record(
    "claude-desktop-gui",
    "Claude Desktop GUI third-party inference E2E (protocol covered via mock; GUI not headless-automatable)",
    "NOT_TESTED",
    hasClaudeDesktopApp
      ? "Claude.app installed, but GUI Electron interaction requires manual session; protocol path verified in e2e-agent-test.mjs"
      : "Claude Desktop not installed in this environment",
  )
  suite.record(
    "cursor-ide-gui",
    "Cursor IDE GUI MCP + hooks E2E (config & hook schema covered; GUI not headless-automatable)",
    "NOT_TESTED",
    hasCursorApp
      ? "Cursor.app installed, but IDE GUI session requires interactive sign-in; .cursor/mcp.json & beforeSubmitPrompt hook verified in unit/E2E tests"
      : "Cursor IDE not installed in this environment",
  )

  // Check if local Ollama daemon is running
  let ollamaRunning = false
  if (ollamaBin) {
    try {
      const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(500) })
      ollamaRunning = r.ok
    } catch {
      ollamaRunning = false
    }
  }
  suite.record(
    "local-llm-ollama",
    "Local model inference via Ollama OpenAI-compatible proxy",
    "NOT_TESTED",
    ollamaRunning
      ? "Ollama daemon running (opt-in local model run not invoked by default)"
      : "Ollama daemon not running in this environment",
  )

  if (!live) {
    suite.record(
      "cloud-llm-live-opt-in",
      "Live external cloud model calls (Anthropic/OpenAI/OpenCode Go)",
      "NOT_TESTED",
      "Opt-in only (zero paid API calls by default); run with `pnpm test:mcp:harnesses -- --live` to execute against live subscriptions",
    )
  }

  return suite.finish({
    availableCliClients,
    clientInventory,
  })
}
