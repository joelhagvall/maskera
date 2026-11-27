import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
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
  dryRun?: boolean
  cwd?: string
  homeDir?: string
  platform?: NodeJS.Platform
}

export interface InstallResult {
  client: InstallClient
  transport: InstallTransport
  configPath: string | null
  command: string | null
  snippet: string
  written: boolean
  verifyStep: string
}

export function isInstallClient(value: string): value is InstallClient {
  return (SUPPORTED_CLIENTS as readonly string[]).includes(value)
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
    if (platform === "darwin") {
      return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
    }
    if (platform === "win32") {
      const appData = process.env.APPDATA || join(home, "AppData", "Roaming")
      return join(appData, "Claude", "claude_desktop_config.json")
    }
    return join(home, ".config", "Claude", "claude_desktop_config.json")
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

async function mergeJsonConfig(
  filePath: string,
  keyPath: ["mcpServers"] | ["mcp", "servers"],
  entry: Record<string, unknown>,
  dryRun: boolean,
): Promise<{ snippet: string; written: boolean }> {
  let rootObj: Record<string, unknown> = {}
  try {
    const existingRaw = await readFile(filePath, "utf8")
    const parsed = JSON.parse(existingRaw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`Existing config "${filePath}" is not a JSON object.`)
    }
    rootObj = parsed as Record<string, unknown>
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err
    }
  }

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

export async function runInstall(options: InstallOptions): Promise<InstallResult> {
  const cwd = options.cwd ?? process.cwd()
  const home = options.homeDir ?? homedir()
  const platform = options.platform ?? process.platform
  const transport: InstallTransport = options.transport ?? "stdio"
  const dryRun = options.dryRun === true
  const stdioArgs = buildStdioArgs(options)
  const httpUrl = buildHttpUrl(options)
  const entry = buildServerEntry(transport, stdioArgs, httpUrl)

  const verifyStep =
    transport === "http"
      ? `Start "npx -y @maskera/mcp proxy" first, open http://127.0.0.1:8787/_maskera, and ask your agent to call maskera_status.`
      : `Restart ${options.client} (or open a new session) and ask the agent to call maskera_status.`

  if (options.client === "claude-code") {
    const command =
      transport === "http"
        ? `claude mcp add --transport http maskera ${shellQuote(httpUrl)}`
        : `claude mcp add maskera -- npx ${stdioArgs.map(shellQuote).join(" ")}`
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
        command,
        snippet: merged.snippet,
        written: merged.written,
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
      verifyStep,
    }
  }

  if (options.client === "codex") {
    const command =
      transport === "http"
        ? `codex mcp add maskera --url ${shellQuote(httpUrl)}`
        : `codex mcp add maskera -- npx ${stdioArgs.map(shellQuote).join(" ")}`
    return {
      client: options.client,
      transport,
      configPath: null,
      command,
      snippet: `${command}\n`,
      written: false,
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
    verifyStep,
  }
}
