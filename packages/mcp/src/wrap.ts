import { spawn } from "node:child_process"
import type { RedactionProfile } from "maskera"
import type { ApprovalMode } from "./approvals"
import { type DoctorReport, runDoctor, writeDoctorReceipt } from "./doctor"
import type { MaskeraEngine, MaskMode } from "./engine"
import { type ProxyStats, startMaskeraProxy } from "./proxy"

export interface WrapOptions {
  command: string
  args: readonly string[]
  engine: MaskeraEngine
  roots: readonly string[]
  host?: string
  /** Defaults to `0` (ephemeral free port) so multiple wrapped sessions never collide. */
  port?: number
  upstream?: string
  anthropicUpstream?: string
  openaiUpstream?: string
  allowRawRestore?: boolean
  readOnly?: boolean
  approvalMode?: ApprovalMode
  profile?: RedactionProfile
  customTerms?: readonly string[]
  restoreResponses?: boolean
  blockBinary?: boolean
  auditLogPath?: string
  verify?: boolean
  receiptPath?: string
  openInspector?: boolean
  env?: NodeJS.ProcessEnv
  onStderr?: (line: string) => void
}

export interface WrapReceipt {
  schema: "maskera-wrap-receipt/v1"
  timestamp: string
  command: string
  exitCode: number
  proxyUrl: string
  mcpUrl: string
  startupReceipt: DoctorReport | null
  session: ProxyStats
}

export interface WrapResult {
  exitCode: number
  signal: NodeJS.Signals | null
  proxyUrl: string
  mcpUrl: string
  startupReceipt: DoctorReport | null
  session: ProxyStats
  receiptPath?: string
}

/**
 * Best-effort opener for a local loopback URL in the user's default browser.
 * Never throws if running headless or on a system without a GUI opener.
 */
export function openUrlInBrowser(
  url: string,
  platform: NodeJS.Platform = process.platform,
): boolean {
  try {
    let cmd: string
    let args: string[]
    if (platform === "darwin") {
      cmd = "open"
      args = [url]
    } else if (platform === "win32") {
      cmd = "cmd"
      args = ["/c", "start", "", url]
    } else {
      cmd = "xdg-open"
      args = [url]
    }
    const child = spawn(cmd, args, {
      stdio: "ignore",
      detached: true,
    })
    child.on("error", () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}

function formatCountSummary(counts: Record<string, number>): string {
  const entries = Object.entries(counts).filter(([, n]) => n > 0)
  if (entries.length === 0) return ""
  return ` (${entries.map(([k, n]) => `${k}=${n}`).join(", ")})`
}

/**
 * Starts a local Maskera proxy on a loopback port, runs an optional zero-PII
 * startup self-check, injects `ANTHROPIC_BASE_URL`, `OPENAI_BASE_URL`,
 * `MASKERA_PROXY_URL`, and `MASKERA_MCP_URL` into the wrapped child command,
 * forwards stdio transparently, and shuts down cleanly with a session receipt.
 */
export async function runWrap(options: WrapOptions): Promise<WrapResult> {
  if (!options.command.trim()) {
    throw new Error("Missing command to wrap. Usage: maskera-mcp wrap -- <command> [args...]")
  }
  const writeStderr = options.onStderr ?? ((line: string) => process.stderr.write(`${line}\n`))
  const mode: MaskMode = options.engine.status().defaultMode
  const running = await startMaskeraProxy({
    host: options.host ?? "127.0.0.1",
    port: options.port ?? 0,
    upstream: options.upstream,
    anthropicUpstream: options.anthropicUpstream,
    openaiUpstream: options.openaiUpstream,
    engine: options.engine,
    mcpRoots: options.roots,
    allowRawRestore: options.allowRawRestore,
    readOnly: options.readOnly,
    approvalMode: options.approvalMode,
    profile: options.profile,
    customTerms: options.customTerms,
    restoreResponses: options.restoreResponses,
    blockBinary: options.blockBinary,
    auditLogPath: options.auditLogPath,
  })

  let startupReceipt: DoctorReport | null = null
  try {
    if (options.verify !== false) {
      startupReceipt = await runDoctor({
        engine: options.engine,
        roots: options.roots,
        mode,
        profile: options.profile,
        customTerms: options.customTerms,
        proxyUrl: running.url,
        mcpUrl: running.mcpUrl,
      })
      if (!startupReceipt.ok) {
        const failed = startupReceipt.checks
          .filter((c) => c.status === "fail")
          .map((c) => `${c.name}: ${c.detail}`)
          .join("; ")
        throw new Error(`Startup self-check failed (${failed})`)
      }
    } else {
      options.engine.warmup()
    }

    const proofMode = startupReceipt?.sampleProof?.modeUsed ?? mode
    const verifiedNote = startupReceipt ? ", 0 leaks verified" : ""
    writeStderr(
      `[maskera-wrap] active on ${running.url} (mode=${proofMode}${verifiedNote}) | inspector ${running.inspectorUrl}`,
    )

    if (options.openInspector) {
      openUrlInBrowser(running.inspectorUrl)
    }

    const childEnv: NodeJS.ProcessEnv = {
      ...(options.env ?? process.env),
      ANTHROPIC_BASE_URL: running.url,
      OPENAI_BASE_URL: `${running.url}/v1`,
      MASKERA_PROXY_URL: running.url,
      MASKERA_MCP_URL: running.mcpUrl,
    }

    const child = spawn(options.command, [...options.args], {
      stdio: "inherit",
      env: childEnv,
    })

    const forwardSigInt = () => {
      if (!child.killed) child.kill("SIGINT")
    }
    const forwardSigTerm = () => {
      if (!child.killed) child.kill("SIGTERM")
    }
    process.on("SIGINT", forwardSigInt)
    process.on("SIGTERM", forwardSigTerm)

    const { exitCode, signal } = await new Promise<{
      exitCode: number
      signal: NodeJS.Signals | null
    }>((resolveExit, rejectExit) => {
      child.on("error", rejectExit)
      child.on("exit", (code, sig) => {
        resolveExit({
          exitCode: code ?? (sig ? 1 : 0),
          signal: sig,
        })
      })
    }).finally(() => {
      process.off("SIGINT", forwardSigInt)
      process.off("SIGTERM", forwardSigTerm)
    })

    const session = running.stats()

    let receiptSavedPath: string | undefined
    if (options.receiptPath) {
      const payload: WrapReceipt = {
        schema: "maskera-wrap-receipt/v1",
        timestamp: new Date().toISOString(),
        command: options.command,
        exitCode,
        proxyUrl: running.url,
        mcpUrl: running.mcpUrl,
        startupReceipt,
        session,
      }
      // Reuse writeDoctorReceipt's directory-creating JSON writer pattern
      receiptSavedPath = await writeDoctorReceipt(
        options.receiptPath,
        payload as unknown as DoctorReport,
      )
    }

    writeStderr(
      `[maskera-wrap] session done: ${session.requests} request(s), ${session.redactions} masked item(s)${formatCountSummary(session.counts)}, vault cleared.${receiptSavedPath ? ` receipt: ${receiptSavedPath}` : ""}`,
    )

    return {
      exitCode,
      signal,
      proxyUrl: running.url,
      mcpUrl: running.mcpUrl,
      startupReceipt,
      session,
      ...(receiptSavedPath ? { receiptPath: receiptSavedPath } : {}),
    }
  } finally {
    await running.close()
  }
}
