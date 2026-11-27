import { spawnSync } from "node:child_process"
import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
import type { RedactionProfile } from "maskera"
import type { ApprovalMode } from "./approvals"

export const SUPPORTED_CLIENTS = [
  "claude-code",
  "claude-desktop",
  "codex",
  "cursor",
  "opencode",
  "t3-code",
] as const

export type InstallClient = (typeof SUPPORTED_CLIENTS)[number]
export type InstallTransport = "stdio" | "http"

export type CommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
) => { status: number | null; stdout: string; stderr: string; error?: Error }

export interface InstallOptions {
  client: InstallClient
  transport?: InstallTransport
  mcpUrl?: string
  roots?: readonly string[]
  noRawRestore?: boolean
  readOnly?: boolean
  approvalMode?: ApprovalMode
  rulesOnly?: boolean
  profile?: RedactionProfile
  customTerms?: readonly string[]
  configPath?: string
  /** Run CLI registration commands directly (`claude mcp add` / `codex mcp add`). */
  apply?: boolean
  /** Write project-local `.mcp.json` when configuring `claude-code`. */
  project?: boolean
  /** Also install a `maskera-mcp guard` prompt hook (supported for `claude-code` and `cursor`). */
  withHook?: boolean
  dryRun?: boolean
  cwd?: string
  homeDir?: string
  platform?: NodeJS.Platform
  execCommand?: CommandRunner
}

export interface InstallResult {
  client: InstallClient
  transport: InstallTransport
  configPath: string | null
  command: string | null
  snippet: string
  written: boolean
  applied?: boolean
  applyOutput?: string
  hookPath?: string | null
  hookWritten?: boolean
  verifyStep: string
}

export function isInstallClient(value: string): value is InstallClient {
  return (SUPPORTED_CLIENTS as readonly string[]).includes(value)
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

async function binaryOnPath(
  name: string,
  pathEnv: string,
  platform: NodeJS.Platform,
): Promise<boolean> {
  const dirs = pathEnv.split(delimiter).filter(Boolean)
  const candidates = platform === "win32" ? [`${name}.cmd`, `${name}.exe`, name] : [name]
  for (const dir of dirs) {
    for (const candidate of candidates) {
      if (await pathExists(join(dir, candidate))) return true
    }
  }
  return false
}

function claudeDesktopDir(home: string, platform: NodeJS.Platform): string {
  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "Claude")
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA || join(home, "AppData", "Roaming")
    return join(appData, "Claude")
  }
  return join(home, ".config", "Claude")
}

/**
 * Auto-detects supported AI coding clients present in the workspace or on PATH.
 */
export async function detectInstalledClients(
  options: { cwd?: string; homeDir?: string; platform?: NodeJS.Platform; pathEnv?: string } = {},
): Promise<InstallClient[]> {
  const cwd = options.cwd ?? process.cwd()
  const home = options.homeDir ?? homedir()
  const platform = options.platform ?? process.platform
  const pathEnv = options.pathEnv ?? process.env.PATH ?? ""

  const detected: InstallClient[] = []
  const [
    hasCursorDir,
    hasCursorBin,
    hasOpencodeCfg,
    hasOpencodeBin,
    hasClaudeDir,
    hasClaudeBin,
    hasCodexBin,
    hasClaudeDesktopDir,
  ] = await Promise.all([
    pathExists(join(cwd, ".cursor")),
    binaryOnPath("cursor", pathEnv, platform),
    pathExists(join(cwd, "opencode.json")),
    binaryOnPath("opencode", pathEnv, platform),
    pathExists(join(cwd, ".claude")),
    binaryOnPath("claude", pathEnv, platform),
    binaryOnPath("codex", pathEnv, platform),
    pathExists(claudeDesktopDir(home, platform)),
  ])

  if (hasClaudeDir || hasClaudeBin) detected.push("claude-code")
  if (hasCodexBin) detected.push("codex")
  if (hasCursorDir || hasCursorBin) detected.push("cursor")
  if (hasOpencodeCfg || hasOpencodeBin) detected.push("opencode")
  if (hasClaudeDesktopDir) detected.push("claude-desktop")

  return detected
}

function buildStdioArgs(options: InstallOptions): string[] {
  const args = ["-y", "@maskera/mcp"]
  const roots = options.roots?.length ? options.roots : [options.cwd ?? process.cwd()]
  for (const root of roots) {
    args.push("--root", resolve(root))
  }
  if (options.rulesOnly) args.push("--rules-only")
  if (options.noRawRestore) args.push("--no-raw-restore")
  if (options.readOnly) args.push("--read-only")
  if (options.approvalMode && options.approvalMode !== "automatic") {
    args.push("--approval-mode", options.approvalMode)
  }
  if (options.profile) args.push("--profile", options.profile)
  for (const term of options.customTerms ?? []) {
    args.push("--custom-term", term)
  }
  return args
}

function buildGuardCommand(options: InstallOptions): string {
  const parts = ["npx", "-y", "@maskera/mcp", "guard"]
  if (options.rulesOnly) parts.push("--rules-only")
  if (options.profile) parts.push("--profile", options.profile)
  for (const term of options.customTerms ?? []) {
    parts.push("--custom-term", shellQuote(term))
  }
  return parts.join(" ")
}

function buildHttpUrl(options: InstallOptions): string {
  const base = (options.mcpUrl ?? "http://127.0.0.1:8787/mcp").trim()
  const url = new URL(base)
  if (options.noRawRestore) url.searchParams.set("no_raw_restore", "1")
  if (options.readOnly) url.searchParams.set("read_only", "1")
  if (options.approvalMode && options.approvalMode !== "automatic") {
    url.searchParams.set("approval_mode", options.approvalMode)
  }
  return url.toString()
}

function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(arg)) return arg
  return `'${arg.replace(/'/g, "'\\''")}'`
}

function defaultConfigPath(
  client: InstallClient,
  cwd: string,
  home: string,
  platform: NodeJS.Platform,
): string | null {
  if (client === "cursor") return join(cwd, ".cursor", "mcp.json")
  if (client === "opencode") return join(cwd, "opencode.json")
  if (client === "claude-desktop") {
    return join(claudeDesktopDir(home, platform), "claude_desktop_config.json")
  }
  return null
}

function buildServerEntry(transport: InstallTransport, stdioArgs: string[], httpUrl: string) {
  if (transport === "http") {
    return {
      type: "http",
      url: httpUrl,
    }
  }
  return {
    command: "npx",
    args: stdioArgs,
  }
}

async function readJsonObjectOrEmpty(filePath: string): Promise<Record<string, unknown>> {
  try {
    const existingRaw = await readFile(filePath, "utf8")
    const parsed = JSON.parse(existingRaw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Existing config "${filePath}" is not a JSON object.`)
    }
    return parsed as Record<string, unknown>
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {}
    }
    throw err
  }
}

async function mergeJsonConfig(
  filePath: string,
  keyPath: ["mcpServers"] | ["mcp", "servers"],
  entry: Record<string, unknown>,
  dryRun: boolean,
): Promise<{ snippet: string; written: boolean }> {
  const rootObj = await readJsonObjectOrEmpty(filePath)

  if (keyPath[0] === "mcpServers") {
    const current =
      rootObj.mcpServers &&
      typeof rootObj.mcpServers === "object" &&
      !Array.isArray(rootObj.mcpServers)
        ? (rootObj.mcpServers as Record<string, unknown>)
        : {}
    rootObj.mcpServers = { ...current, maskera: entry }
  } else {
    const mcpObj =
      rootObj.mcp && typeof rootObj.mcp === "object" && !Array.isArray(rootObj.mcp)
        ? (rootObj.mcp as Record<string, unknown>)
        : {}
    const serversObj =
      mcpObj.servers && typeof mcpObj.servers === "object" && !Array.isArray(mcpObj.servers)
        ? (mcpObj.servers as Record<string, unknown>)
        : {}
    rootObj.mcp = { ...mcpObj, servers: { ...serversObj, maskera: entry } }
  }

  const snippet = `${JSON.stringify(rootObj, null, 2)}\n`
  if (!dryRun) {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, snippet, "utf8")
  }
  return { snippet, written: !dryRun }
}

async function installGuardHook(
  client: InstallClient,
  cwd: string,
  guardCommand: string,
  dryRun: boolean,
): Promise<{ hookPath: string | null; hookWritten: boolean }> {
  if (client === "claude-code") {
    const hookPath = join(cwd, ".claude", "settings.json")
    const rootObj = await readJsonObjectOrEmpty(hookPath)
    const hooksObj =
      rootObj.hooks && typeof rootObj.hooks === "object" && !Array.isArray(rootObj.hooks)
        ? ({ ...(rootObj.hooks as Record<string, unknown>) } as Record<string, unknown>)
        : {}
    const existingList = Array.isArray(hooksObj.UserPromptSubmit)
      ? [...(hooksObj.UserPromptSubmit as unknown[])]
      : []
    const alreadyConfigured = existingList.some(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        JSON.stringify(entry).includes("@maskera/mcp guard"),
    )
    if (!alreadyConfigured) {
      existingList.push({
        hooks: [
          {
            type: "command",
            command: guardCommand,
          },
        ],
      })
    }
    hooksObj.UserPromptSubmit = existingList
    rootObj.hooks = hooksObj
    if (!dryRun) {
      await mkdir(dirname(hookPath), { recursive: true })
      await writeFile(hookPath, `${JSON.stringify(rootObj, null, 2)}\n`, "utf8")
    }
    return { hookPath, hookWritten: !dryRun }
  }

  if (client === "cursor") {
    const hookPath = join(cwd, ".cursor", "hooks.json")
    const rootObj = await readJsonObjectOrEmpty(hookPath)
    const hooksObj =
      rootObj.hooks && typeof rootObj.hooks === "object" && !Array.isArray(rootObj.hooks)
        ? ({ ...(rootObj.hooks as Record<string, unknown>) } as Record<string, unknown>)
        : {}
    const existingList = Array.isArray(hooksObj.beforeSubmitPrompt)
      ? [...(hooksObj.beforeSubmitPrompt as unknown[])]
      : []
    const alreadyConfigured = existingList.some(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        JSON.stringify(entry).includes("@maskera/mcp guard"),
    )
    if (!alreadyConfigured) {
      existingList.push({ command: guardCommand })
    }
    hooksObj.beforeSubmitPrompt = existingList
    rootObj.version = typeof rootObj.version === "number" ? rootObj.version : 1
    rootObj.hooks = hooksObj
    if (!dryRun) {
      await mkdir(dirname(hookPath), { recursive: true })
      await writeFile(hookPath, `${JSON.stringify(rootObj, null, 2)}\n`, "utf8")
    }
    return { hookPath, hookWritten: !dryRun }
  }

  return { hookPath: null, hookWritten: false }
}

const defaultCommandRunner: CommandRunner = (command, args, cwd) => {
  const res = spawnSync(command, args, { cwd, encoding: "utf8" })
  return {
    status: res.status,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    error: res.error,
  }
}

export async function runInstall(options: InstallOptions): Promise<InstallResult> {
  const cwd = options.cwd ?? process.cwd()
  const home = options.homeDir ?? homedir()
  const platform = options.platform ?? process.platform
  const transport: InstallTransport = options.transport ?? "stdio"
  const dryRun = options.dryRun === true
  const stdioArgs = buildStdioArgs(options)
  const httpUrl = buildHttpUrl(options)
  const entry = buildServerEntry(transport, stdioArgs, httpUrl)
  const execCommand = options.execCommand ?? defaultCommandRunner
  const guardCommand = buildGuardCommand(options)

  const hookResult = options.withHook
    ? await installGuardHook(options.client, cwd, guardCommand, dryRun)
    : undefined

  const verifyStep =
    transport === "http"
      ? `Start "npx -y @maskera/mcp proxy" first, open http://127.0.0.1:8787/_maskera, and ask your agent to call maskera_status.`
      : `Restart ${options.client} (or open a new session) and ask the agent to call maskera_status.`

  const hookFields = hookResult
    ? { hookPath: hookResult.hookPath, hookWritten: hookResult.hookWritten }
    : {}

  if (options.client === "claude-code") {
    const cliArgs =
      transport === "http"
        ? ["mcp", "add", "--transport", "http", "maskera", httpUrl]
        : ["mcp", "add", "maskera", "--", "npx", ...stdioArgs]
    const command = `claude ${cliArgs.map(shellQuote).join(" ")}`

    if (options.configPath || options.project) {
      const targetPath = options.configPath ? resolve(options.configPath) : join(cwd, ".mcp.json")
      const merged = await mergeJsonConfig(targetPath, ["mcpServers"], entry, dryRun)
      return {
        client: options.client,
        transport,
        configPath: targetPath,
        command,
        snippet: merged.snippet,
        written: merged.written,
        ...hookFields,
        verifyStep,
      }
    }

    if (options.apply && !dryRun) {
      const run = execCommand("claude", cliArgs, cwd)
      if (run.error) {
        throw new Error(`Failed to execute "claude": ${run.error.message}`)
      }
      if (run.status !== 0) {
        throw new Error(
          `Command "${command}" exited with status ${String(run.status)}: ${(run.stderr || run.stdout).trim()}`,
        )
      }
      return {
        client: options.client,
        transport,
        configPath: null,
        command,
        snippet: `${command}\n`,
        written: false,
        applied: true,
        applyOutput: (run.stdout || run.stderr).trim(),
        ...hookFields,
        verifyStep,
      }
    }

    return {
      client: options.client,
      transport,
      configPath: null,
      command,
      snippet: `${command}\n`,
      written: false,
      ...hookFields,
      verifyStep,
    }
  }

  if (options.client === "codex") {
    const cliArgs =
      transport === "http"
        ? ["mcp", "add", "maskera", "--url", httpUrl]
        : ["mcp", "add", "maskera", "--", "npx", ...stdioArgs]
    const command = `codex ${cliArgs.map(shellQuote).join(" ")}`

    if (options.apply && !dryRun) {
      const run = execCommand("codex", cliArgs, cwd)
      if (run.error) {
        throw new Error(`Failed to execute "codex": ${run.error.message}`)
      }
      if (run.status !== 0) {
        throw new Error(
          `Command "${command}" exited with status ${String(run.status)}: ${(run.stderr || run.stdout).trim()}`,
        )
      }
      return {
        client: options.client,
        transport,
        configPath: null,
        command,
        snippet: `${command}\n`,
        written: false,
        applied: true,
        applyOutput: (run.stdout || run.stderr).trim(),
        ...hookFields,
        verifyStep,
      }
    }

    return {
      client: options.client,
      transport,
      configPath: null,
      command,
      snippet: `${command}\n`,
      written: false,
      ...hookFields,
      verifyStep,
    }
  }

  if (options.client === "t3-code") {
    const config = { mcpServers: { maskera: entry } }
    if (options.configPath) {
      const merged = await mergeJsonConfig(
        resolve(options.configPath),
        ["mcpServers"],
        entry,
        dryRun,
      )
      return {
        client: options.client,
        transport,
        configPath: resolve(options.configPath),
        command: null,
        snippet: merged.snippet,
        written: merged.written,
        ...hookFields,
        verifyStep,
      }
    }
    return {
      client: options.client,
      transport,
      configPath: null,
      command: null,
      snippet: `${JSON.stringify(config, null, 2)}\n`,
      written: false,
      ...hookFields,
      verifyStep,
    }
  }

  const targetPath = options.configPath
    ? resolve(options.configPath)
    : defaultConfigPath(options.client, cwd, home, platform)
  if (!targetPath) {
    throw new Error(
      `Unable to determine config path for "${options.client}". Pass --config <path>.`,
    )
  }
  const keyPath: ["mcpServers"] | ["mcp", "servers"] =
    options.client === "opencode" ? ["mcp", "servers"] : ["mcpServers"]
  const merged = await mergeJsonConfig(targetPath, keyPath, entry, dryRun)
  return {
    client: options.client,
    transport,
    configPath: targetPath,
    command: null,
    snippet: merged.snippet,
    written: merged.written,
    ...hookFields,
    verifyStep,
  }
}
