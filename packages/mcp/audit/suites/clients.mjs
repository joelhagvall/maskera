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
import { spawn, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { createServer } from "node:http"
import { createServer as createNetServer } from "node:net"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createMaskeraEngine, startMaskeraProxy } from "../../dist/index.js"
import {
  createSuiteCollector,
  getLocalNerOptions,
  hasLocalNerModel,
  installPackedTarballs,
  packWorkspaceTarballs,
  pkgRoot,
  runProcess,
} from "../lib/harness.mjs"

function pickFreePort() {
  return new Promise((resolvePort, reject) => {
    const srv = createNetServer()
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address()
      const port = typeof addr === "object" && addr ? addr.port : 0
      srv.close((err) => (err ? reject(err) : resolvePort(port)))
    })
    srv.on("error", reject)
  })
}

async function listOllamaModels(baseUrl) {
  try {
    const r = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(1_500) })
    if (!r.ok) return null
    const data = await r.json()
    const models = Array.isArray(data?.models) ? data.models.map((m) => m.name).filter(Boolean) : []
    return models
  } catch {
    return null
  }
}

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
      const packed = packWorkspaceTarballs(installDir)
      const { cliPath: installedCli } = installPackedTarballs(installDir, packed, {
        packageName: "maskera-audit-client-install",
      })

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

  // Local model inference via Ollama OpenAI-compatible proxy
  const hasOllamaModelsDir = existsSync(join(homedir(), ".ollama", "models", "manifests"))
  const existingOllamaModels = ollamaBin ? await listOllamaModels("http://127.0.0.1:11434") : null
  if (ollamaBin && (existingOllamaModels?.length || hasOllamaModelsDir)) {
    await suite.check(
      "local-llm-ollama",
      "Real local Ollama model inference through maskera-mcp proxy with egress inspection and response restoration",
      async () => {
        let ollamaBaseUrl = "http://127.0.0.1:11434"
        let spawnedOllama = null
        let models = existingOllamaModels
        try {
          if (!models) {
            const ollamaPort = await pickFreePort()
            ollamaBaseUrl = `http://127.0.0.1:${ollamaPort}`
            spawnedOllama = spawn("ollama", ["serve"], {
              env: { ...process.env, OLLAMA_HOST: `127.0.0.1:${ollamaPort}` },
              stdio: "ignore",
            })
            const deadline = Date.now() + 15_000
            while (Date.now() < deadline) {
              models = await listOllamaModels(ollamaBaseUrl)
              if (models) break
              await new Promise((r) => setTimeout(r, 250))
            }
          }
          if (!models || models.length === 0) {
            throw new Error("Ollama daemon started but no local models are installed.")
          }
          const modelName = models[0]

          // Intercept the exact body reaching Ollama to prove 0 raw canaries cross the boundary
          let capturedUpstreamBody = ""
          const tapServer = createServer(async (req, res) => {
            const chunks = []
            for await (const c of req) chunks.push(c)
            const bodyBuf = Buffer.concat(chunks)
            capturedUpstreamBody = bodyBuf.toString("utf8")
            const upstreamRes = await fetch(`${ollamaBaseUrl}${req.url ?? ""}`, {
              method: req.method,
              headers: { "content-type": req.headers["content-type"] ?? "application/json" },
              body: bodyBuf.byteLength > 0 ? new Uint8Array(bodyBuf) : undefined,
              signal: AbortSignal.timeout(90_000),
            })
            const outBuf = Buffer.from(await upstreamRes.arrayBuffer())
            res.writeHead(upstreamRes.status, {
              "content-type": upstreamRes.headers.get("content-type") ?? "application/json",
            })
            res.end(outBuf)
          })
          await new Promise((resolveListen) => tapServer.listen(0, "127.0.0.1", resolveListen))
          const tapAddr = tapServer.address()
          const tapUrl = `http://127.0.0.1:${typeof tapAddr === "object" && tapAddr ? tapAddr.port : 0}`

          const engine = createMaskeraEngine({
            defaultMode: hasLocalNerModel ? "auto" : "rules",
            nerOptions: getLocalNerOptions(),
          })
          const proxy = await startMaskeraProxy({
            port: 0,
            upstream: tapUrl,
            engine,
          })
          try {
            const canaries = ["Anna Lindqvist", "19900101-2385", "070-174 06 58"]
            const res = await fetch(`${proxy.url}/v1/chat/completions`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-maskera-session": "ollama-audit",
              },
              body: JSON.stringify({
                model: modelName,
                stream: false,
                temperature: 0,
                max_tokens: 200,
                keep_alive: 0,
                messages: [
                  {
                    role: "user",
                    content:
                      "Upprepa patientens namn, personnummer och telefonnummer exakt som de står i texten och behåll eventuella hakparenteser oförändrade: Patient Anna Lindqvist, personnummer 19900101-2385, tel 070-174 06 58.",
                  },
                ],
              }),
              signal: AbortSignal.timeout(90_000),
            })
            assert.equal(res.status, 200, `Ollama via proxy returned HTTP ${res.status}`)
            const redactedHeader = Number(res.headers.get("x-maskera-redacted") ?? "0")
            assert.ok(redactedHeader >= 2, `Expected >=2 redactions, got ${redactedHeader}`)
            for (const c of canaries) {
              assert.equal(
                capturedUpstreamBody.includes(c),
                false,
                `Raw canary "${c}" leaked to local Ollama model!`,
              )
            }
            assert.equal(
              capturedUpstreamBody.includes("[PERSONNUMMER_1]"),
              true,
              "Expected [PERSONNUMMER_1] placeholder in Ollama request",
            )
            const body = await res.json()
            assert.ok(Array.isArray(body.choices) && body.choices.length > 0)
            const msg = body.choices[0]?.message
            const replyText = `${msg?.content ?? ""} ${msg?.reasoning ?? ""}`
            assert.ok(replyText.trim().length > 0, "Empty completion from local Ollama model")
            // Any placeholder echoed by the local model must have been restored
            assert.equal(replyText.includes("[PERSONNUMMER_1]"), false)
            return `Ollama ${modelName}: HTTP 200, 0 raw canaries leaked, redacted=${redactedHeader}`
          } finally {
            await proxy.close()
            await new Promise((r) => tapServer.close(r))
          }
        } finally {
          if (spawnedOllama && !spawnedOllama.killed) {
            spawnedOllama.kill("SIGTERM")
          }
        }
      },
    )
  } else {
    suite.record(
      "local-llm-ollama",
      "Local model inference via Ollama OpenAI-compatible proxy",
      "NOT_TESTED",
      ollamaBin
        ? "Ollama binary found, but no local models are installed"
        : "Ollama not installed in this environment",
    )
  }

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
