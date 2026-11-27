import { spawnSync } from "node:child_process"
import { access, mkdir, unlink, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import type { RedactionProfile } from "maskera"
import type { ApprovalMode } from "./approvals"
import type { CommandRunner } from "./install"

export type ServiceAction = "install" | "status" | "uninstall"

export interface ServiceOptions {
  action: ServiceAction
  host?: string
  port?: number
  roots?: readonly string[]
  rulesOnly?: boolean
  noRawRestore?: boolean
  readOnly?: boolean
  approvalMode?: ApprovalMode
  profile?: RedactionProfile
  customTerms?: readonly string[]
  auditLogPath?: string
  dryRun?: boolean
  platform?: NodeJS.Platform
  homeDir?: string
  nodePath?: string
  cliPath?: string
  pathEnv?: string
  uid?: number
  execCommand?: CommandRunner
}

export interface ServiceResult {
  action: ServiceAction
  platform: NodeJS.Platform
  manager: "launchd" | "systemd" | "unsupported"
  serviceName: string
  serviceFile: string | null
  proxyUrl: string
  mcpUrl: string
  inspectorUrl: string
  installed: boolean
  running: boolean
  written: boolean
  snippet?: string
  detail: string
}

export const LAUNCHD_LABEL = "dev.maskera.proxy"
export const SYSTEMD_UNIT = "maskera-proxy.service"

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function systemdQuote(arg: string): string {
  if (/^[A-Za-z0-9_./:=+-]+$/.test(arg)) return arg
  return `"${arg.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}

function buildProxyProgramArgs(options: ServiceOptions): string[] {
  const nodePath = options.nodePath ?? process.execPath
  const cliPath = options.cliPath ?? process.argv[1] ?? ""
  const isEphemeralNpx =
    !cliPath ||
    cliPath.includes("_npx") ||
    cliPath.startsWith("/tmp/") ||
    cliPath.startsWith("/var/folders/")

  const base = isEphemeralNpx ? ["npx", "-y", "@maskera/mcp"] : [nodePath, resolve(cliPath)]
  const args = [
    ...base,
    "proxy",
    "--host",
    options.host ?? "127.0.0.1",
    "--port",
    String(options.port ?? 8787),
  ]

  for (const root of options.roots ?? []) {
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
  if (options.auditLogPath) args.push("--audit-log", resolve(options.auditLogPath))
  return args
}

export function renderLaunchdPlist(options: {
  programArguments: readonly string[]
  stdoutLogPath: string
  stderrLogPath: string
  pathEnv?: string
}): string {
  const argLines = options.programArguments
    .map((arg) => `      <string>${xmlEscape(arg)}</string>`)
    .join("\n")
  const envBlock = options.pathEnv
    ? `    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${xmlEscape(options.pathEnv)}</string>
    </dict>\n`
    : ""
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LAUNCHD_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${argLines}
    </array>
${envBlock}    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${xmlEscape(options.stdoutLogPath)}</string>
    <key>StandardErrorPath</key>
    <string>${xmlEscape(options.stderrLogPath)}</string>
  </dict>
</plist>
`
}

export function renderSystemdUnit(options: {
  programArguments: readonly string[]
  pathEnv?: string
}): string {
  const execStart = options.programArguments.map(systemdQuote).join(" ")
  const envLine = options.pathEnv
    ? `Environment="PATH=${options.pathEnv.replace(/"/g, '\\"')}"\n`
    : ""
  return `[Unit]
Description=Maskera local Swedish PII proxy and Streamable HTTP MCP server
After=network.target

[Service]
Type=simple
${envLine}ExecStart=${execStart}
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
`
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function probeProxyHealth(proxyUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${proxyUrl}/_maskera/status`, {
      signal: AbortSignal.timeout(800),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function runService(options: ServiceOptions): Promise<ServiceResult> {
  const platform = options.platform ?? process.platform
  const home = options.homeDir ?? homedir()
  const host = options.host ?? "127.0.0.1"
  const port = options.port ?? 8787
  const proxyUrl = `http://${host}:${port}`
  const mcpUrl = `${proxyUrl}/mcp`
  const inspectorUrl = `${proxyUrl}/_maskera`
  const dryRun = options.dryRun === true
  const execCommand = options.execCommand ?? defaultCommandRunner
  const pathEnv = options.pathEnv ?? process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin"

  if (platform !== "darwin" && platform !== "linux") {
    return {
      action: options.action,
      platform,
      manager: "unsupported",
      serviceName: LAUNCHD_LABEL,
      serviceFile: null,
      proxyUrl,
      mcpUrl,
      inspectorUrl,
      installed: false,
      running: await probeProxyHealth(proxyUrl),
      written: false,
      detail: `Background service installation is supported on macOS (launchd) and Linux (systemd --user). On ${platform}, run "npx -y @maskera/mcp proxy" or "npx -y @maskera/mcp wrap -- <cmd>".`,
    }
  }

  const isMac = platform === "darwin"
  const manager = isMac ? "launchd" : "systemd"
  const serviceName = isMac ? LAUNCHD_LABEL : SYSTEMD_UNIT
  const serviceFile = isMac
    ? join(home, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`)
    : join(home, ".config", "systemd", "user", SYSTEMD_UNIT)

  if (options.action === "status") {
    const installed = await fileExists(serviceFile)
    const running = await probeProxyHealth(proxyUrl)
    return {
      action: "status",
      platform,
      manager,
      serviceName,
      serviceFile,
      proxyUrl,
      mcpUrl,
      inspectorUrl,
      installed,
      running,
      written: false,
      detail: running
        ? `Running on ${proxyUrl} (${installed ? `service file ${serviceFile}` : "started manually"}).`
        : installed
          ? `Installed at ${serviceFile}, but not responding on ${proxyUrl}.`
          : `Not installed (${serviceFile} does not exist) and not running on ${proxyUrl}.`,
    }
  }

  if (options.action === "uninstall") {
    const existed = await fileExists(serviceFile)
    if (!dryRun) {
      if (isMac) {
        const uid = options.uid ?? process.getuid?.() ?? 501
        execCommand("launchctl", ["bootout", `gui/${uid}`, serviceFile], home)
      } else {
        execCommand("systemctl", ["--user", "disable", "--now", SYSTEMD_UNIT], home)
      }
      if (existed) {
        await unlink(serviceFile).catch(() => {})
      }
      if (!isMac) {
        execCommand("systemctl", ["--user", "daemon-reload"], home)
      }
    }
    return {
      action: "uninstall",
      platform,
      manager,
      serviceName,
      serviceFile,
      proxyUrl,
      mcpUrl,
      inspectorUrl,
      installed: false,
      running: false,
      written: !dryRun && existed,
      detail: dryRun
        ? `Dry run: would unload and remove ${serviceFile}.`
        : existed
          ? `Stopped and removed ${serviceFile}.`
          : `Service file ${serviceFile} was not present.`,
    }
  }

  // action === "install"
  const programArguments = buildProxyProgramArgs(options)
  const snippet = isMac
    ? renderLaunchdPlist({
        programArguments,
        stdoutLogPath: join(home, "Library", "Logs", "maskera-proxy.log"),
        stderrLogPath: join(home, "Library", "Logs", "maskera-proxy.err.log"),
        pathEnv,
      })
    : renderSystemdUnit({ programArguments, pathEnv })

  if (dryRun) {
    return {
      action: "install",
      platform,
      manager,
      serviceName,
      serviceFile,
      proxyUrl,
      mcpUrl,
      inspectorUrl,
      installed: false,
      running: await probeProxyHealth(proxyUrl),
      written: false,
      snippet,
      detail: `Dry run: would write ${serviceFile} and start ${serviceName}.`,
    }
  }

  await mkdir(dirname(serviceFile), { recursive: true })
  if (isMac) {
    await mkdir(join(home, "Library", "Logs"), { recursive: true })
  }
  await writeFile(serviceFile, snippet, "utf8")

  if (isMac) {
    const uid = options.uid ?? process.getuid?.() ?? 501
    execCommand("launchctl", ["bootout", `gui/${uid}`, serviceFile], home)
    const boot = execCommand("launchctl", ["bootstrap", `gui/${uid}`, serviceFile], home)
    if (boot.error || boot.status !== 0) {
      const legacy = execCommand("launchctl", ["load", "-w", serviceFile], home)
      if (legacy.error || legacy.status !== 0) {
        throw new Error(
          `Failed to load LaunchAgent ${serviceFile}: ${(boot.stderr || legacy.stderr || boot.error?.message || "launchctl failed").trim()}`,
        )
      }
    }
  } else {
    const reload = execCommand("systemctl", ["--user", "daemon-reload"], home)
    if (reload.error) {
      throw new Error(`Failed to run systemctl --user: ${reload.error.message}`)
    }
    const enable = execCommand("systemctl", ["--user", "enable", "--now", SYSTEMD_UNIT], home)
    if (enable.error || enable.status !== 0) {
      throw new Error(
        `Failed to enable ${SYSTEMD_UNIT}: ${(enable.stderr || enable.stdout || enable.error?.message || "systemctl failed").trim()}`,
      )
    }
  }

  // Wait briefly for the freshly started local proxy to respond on /_maskera/status.
  let running = false
  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (await probeProxyHealth(proxyUrl)) {
      running = true
      break
    }
    await new Promise((r) => setTimeout(r, 150))
  }

  return {
    action: "install",
    platform,
    manager,
    serviceName,
    serviceFile,
    proxyUrl,
    mcpUrl,
    inspectorUrl,
    installed: true,
    running,
    written: true,
    snippet,
    detail: running
      ? `Installed and started ${serviceName} (${serviceFile}). Listening on ${proxyUrl}.`
      : `Installed ${serviceName} (${serviceFile}). Check logs if ${proxyUrl} is still warming up.`,
  }
}
