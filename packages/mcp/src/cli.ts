import { readFile } from "node:fs/promises"
import { delimiter } from "node:path"
import { createInterface } from "node:readline"
import { format } from "node:util"
import type { RedactionProfile } from "maskera"
import type { ApprovalMode } from "./approvals"
import { formatDoctorReport, runDoctor, writeDoctorReceipt } from "./doctor"
import { createMaskeraEngine, createModelProgressLogger, type MaskMode } from "./engine"
import { runGuard, runGuardViaWarmProxy } from "./guard"
import {
  detectInstalledClients,
  type InstallClient,
  type InstallResult,
  type InstallTransport,
  isInstallClient,
  runInstall,
  SUPPORTED_CLIENTS,
} from "./install"
import { startMaskeraProxy } from "./proxy"
import {
  createMaskeraMcpServer,
  type ElicitationRequest,
  type ElicitationResponse,
  SERVER_NAME,
  SERVER_VERSION,
} from "./server"
import { runService, type ServiceAction } from "./service"
import { openUrlInBrowser, runWrap } from "./wrap"

type Subcommand = "mcp" | "proxy" | "wrap" | "guard" | "install" | "doctor" | "service"

interface ParsedCli {
  command: Subcommand
  roots: string[]
  defaultMode: MaskMode
  profile?: RedactionProfile
  customTerms: string[]
  allowRawRestore: boolean
  readOnly: boolean
  approvalMode: ApprovalMode
  help: boolean
  version: boolean
  // proxy & wrap flags
  host: string
  port: number
  portExplicit: boolean
  upstream?: string
  anthropicUpstream?: string
  openaiUpstream?: string
  restoreResponses: boolean
  auditLogPath?: string
  openInspector: boolean
  // wrap child command
  wrapCommand?: string
  wrapArgs: string[]
  // guard flags
  redact: boolean
  noProxy: boolean
  file?: string
  // install flags
  client?: InstallClient | "all"
  transport: InstallTransport
  mcpUrl?: string
  configPath?: string
  apply: boolean
  project: boolean
  withHook: boolean
  dryRun: boolean
  verify: boolean
  // service flags
  serviceAction?: ServiceAction
  // doctor / receipt flags
  proxyUrl?: string
  receiptPath?: string
  json: boolean
}

function parseApprovalMode(raw: string): ApprovalMode {
  const v = raw.trim().toLowerCase()
  if (v === "automatic" || v === "browser" || v === "native") return v
  throw new Error(`Invalid --approval-mode "${raw}": expected "automatic", "browser", or "native".`)
}

function isServiceAction(value: string): value is ServiceAction {
  return value === "install" || value === "status" || value === "uninstall"
}

function parseArgs(argv: readonly string[]): ParsedCli {
  let startIndex = 0
  let command: Subcommand = "mcp"
  if (
    argv[0] === "proxy" ||
    argv[0] === "wrap" ||
    argv[0] === "guard" ||
    argv[0] === "mcp" ||
    argv[0] === "install" ||
    argv[0] === "doctor" ||
    argv[0] === "service"
  ) {
    command = argv[0]
    startIndex = 1
  }

  const roots: string[] = []
  const customTerms: string[] = []
  let defaultMode: MaskMode = process.env.MASKERA_MCP_MODE === "rules" ? "rules" : "auto"
  let profile: RedactionProfile | undefined
  let allowRawRestore = process.env.MASKERA_MCP_NO_RAW_RESTORE !== "1"
  let readOnly = process.env.MASKERA_MCP_READ_ONLY === "1"
  let approvalMode: ApprovalMode = process.env.MASKERA_MCP_APPROVAL_MODE
    ? parseApprovalMode(process.env.MASKERA_MCP_APPROVAL_MODE)
    : "automatic"
  let help = false
  let version = false
  let host = process.env.MASKERA_PROXY_HOST || "127.0.0.1"
  let port = Number(process.env.MASKERA_PROXY_PORT || "8787")
  let portExplicit = Boolean(process.env.MASKERA_PROXY_PORT)
  let upstream = process.env.MASKERA_PROXY_UPSTREAM || undefined
  let anthropicUpstream = process.env.MASKERA_ANTHROPIC_UPSTREAM || undefined
  let openaiUpstream = process.env.MASKERA_OPENAI_UPSTREAM || undefined
  let restoreResponses = true
  let auditLogPath = process.env.MASKERA_AUDIT_LOG || undefined
  let openInspector = false
  let wrapCommand: string | undefined
  const wrapArgs: string[] = []
  let redact = false
  let noProxy = process.env.MASKERA_GUARD_NO_PROXY === "1"
  let file: string | undefined
  let client: InstallClient | "all" | undefined
  let transport: InstallTransport = "stdio"
  let mcpUrl: string | undefined
  let configPath: string | undefined
  let apply = false
  let project = false
  let withHook = false
  let dryRun = false
  let verify = true
  let serviceAction: ServiceAction | undefined
  let proxyUrl: string | undefined
  let receiptPath: string | undefined
  let json = false

  const envRoots = process.env.MASKERA_MCP_ROOTS
  if (envRoots) {
    for (const entry of envRoots.split(delimiter)) {
      const trimmed = entry.trim()
      if (trimmed) roots.push(trimmed)
    }
  }

  const takeValue = (
    flag: string,
    arg: string,
    index: number,
    allowLeadingDash = false,
  ): { value: string; nextIndex: number } => {
    const eq = arg.indexOf("=")
    if (eq >= 0) {
      const value = arg.slice(eq + 1)
      if (!value.trim()) throw new Error(`Flag ${flag} requires a non-empty value.`)
      return { value, nextIndex: index }
    }
    const next = argv[index + 1]
    if (next === undefined || !next.trim() || (!allowLeadingDash && next.startsWith("-"))) {
      throw new Error(`Flag ${flag} requires a non-empty value.`)
    }
    return { value: next, nextIndex: index + 1 }
  }

  for (let i = startIndex; i < argv.length; i++) {
    const arg = argv[i] ?? ""

    if (command === "wrap") {
      if (arg === "--") {
        wrapCommand = argv[i + 1]
        wrapArgs.push(...argv.slice(i + 2))
        break
      }
      if (!arg.startsWith("-")) {
        wrapCommand = arg
        wrapArgs.push(...argv.slice(i + 1))
        break
      }
    }

    const eq = arg.indexOf("=")
    const flag = eq >= 0 ? arg.slice(0, eq) : arg

    if (flag === "--help" || flag === "-h") {
      help = true
    } else if (flag === "--version" || flag === "-v") {
      version = true
    } else if (flag === "--rules-only") {
      defaultMode = "rules"
    } else if (flag === "--no-raw-restore") {
      allowRawRestore = false
    } else if (flag === "--read-only") {
      readOnly = true
    } else if (flag === "--approval-mode" || flag === "--elicitation-mode") {
      const { value, nextIndex } = takeValue(flag, arg, i)
      i = nextIndex
      approvalMode = parseApprovalMode(value)
    } else if (flag === "--no-restore") {
      restoreResponses = false
    } else if (flag === "--open") {
      openInspector = true
    } else if (flag === "--redact") {
      redact = true
    } else if (flag === "--no-proxy") {
      noProxy = true
    } else if (flag === "--apply") {
      apply = true
    } else if (flag === "--project") {
      project = true
    } else if (flag === "--with-hook") {
      withHook = true
    } else if (flag === "--dry-run") {
      dryRun = true
    } else if (flag === "--no-verify") {
      verify = false
    } else if (flag === "--json") {
      json = true
    } else if (flag === "--root") {
      const { value, nextIndex } = takeValue(flag, arg, i)
      i = nextIndex
      if (value.trim()) roots.push(value.trim())
    } else if (flag === "--host") {
      const { value, nextIndex } = takeValue(flag, arg, i)
      i = nextIndex
      host = value.trim()
    } else if (flag === "--port") {
      const { value, nextIndex } = takeValue(flag, arg, i)
      i = nextIndex
      const parsedPort = Number(value.trim())
      if (!Number.isInteger(parsedPort) || parsedPort < 0 || parsedPort > 65535) {
        throw new Error(`Invalid --port "${value}": expected integer 0..65535.`)
      }
      port = parsedPort
      portExplicit = true
    } else if (flag === "--upstream") {
      const { value, nextIndex } = takeValue(flag, arg, i)
      i = nextIndex
      upstream = value.trim()
    } else if (flag === "--anthropic-upstream") {
      const { value, nextIndex } = takeValue(flag, arg, i)
      i = nextIndex
      anthropicUpstream = value.trim()
    } else if (flag === "--openai-upstream") {
      const { value, nextIndex } = takeValue(flag, arg, i)
      i = nextIndex
      openaiUpstream = value.trim()
    } else if (flag === "--profile") {
      const { value, nextIndex } = takeValue(flag, arg, i)
      i = nextIndex
      if (value !== "general" && value !== "clinical") {
        throw new Error(`Invalid --profile "${value}": expected "general" or "clinical".`)
      }
      profile = value
    } else if (flag === "--custom-term") {
      const { value, nextIndex } = takeValue(flag, arg, i, true)
      i = nextIndex
      customTerms.push(value)
    } else if (flag === "--audit-log") {
      const { value, nextIndex } = takeValue(flag, arg, i)
      i = nextIndex
      auditLogPath = value.trim() || undefined
    } else if (flag === "--file") {
      const { value, nextIndex } = takeValue(flag, arg, i, true)
      i = nextIndex
      file = value
    } else if (flag === "--transport") {
      const { value, nextIndex } = takeValue(flag, arg, i)
      i = nextIndex
      if (value !== "stdio" && value !== "http") {
        throw new Error(`Invalid --transport "${value}": expected "stdio" or "http".`)
      }
      transport = value
    } else if (flag === "--url") {
      const { value, nextIndex } = takeValue(flag, arg, i)
      i = nextIndex
      mcpUrl = value.trim()
    } else if (flag === "--config") {
      const { value, nextIndex } = takeValue(flag, arg, i, true)
      i = nextIndex
      configPath = value
    } else if (flag === "--proxy-url") {
      const { value, nextIndex } = takeValue(flag, arg, i)
      i = nextIndex
      proxyUrl = value.trim()
    } else if (flag === "--receipt") {
      const { value, nextIndex } = takeValue(flag, arg, i, true)
      i = nextIndex
      receiptPath = value
    } else if (command === "install" && !arg.startsWith("-") && !client) {
      if (arg === "all") {
        client = "all"
      } else if (isInstallClient(arg)) {
        client = arg
      } else {
        throw new Error(
          `Unknown client "${arg}". Expected one of: ${SUPPORTED_CLIENTS.join(", ")}, or all.`,
        )
      }
    } else if (command === "service" && !arg.startsWith("-") && !serviceAction) {
      if (!isServiceAction(arg)) {
        throw new Error(`Unknown service action "${arg}". Expected: install, status, or uninstall.`)
      }
      serviceAction = arg
    } else {
      throw new Error(`Unknown option "${arg}". Run with --help for usage.`)
    }
  }

  if (roots.length === 0) roots.push(process.cwd())
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port "${String(port)}": expected integer 0..65535.`)
  }

  return {
    command,
    roots,
    defaultMode,
    profile,
    customTerms,
    allowRawRestore,
    readOnly,
    approvalMode,
    help,
    version,
    host,
    port,
    portExplicit,
    upstream,
    anthropicUpstream,
    openaiUpstream,
    restoreResponses,
    auditLogPath,
    openInspector,
    wrapCommand,
    wrapArgs,
    redact,
    noProxy,
    file,
    client,
    transport,
    mcpUrl,
    configPath,
    apply,
    project,
    withHook,
    dryRun,
    verify,
    serviceAction,
    proxyUrl,
    receiptPath,
    json,
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      `${SERVER_NAME} ${SERVER_VERSION}`,
      "Local Swedish PII redaction for any AI agent: MCP server (stdio + Streamable HTTP), LLM proxy, wrap launcher, hook guard, installer, doctor, and background service.",
      "",
      "Usage:",
      "  maskera-mcp [mcp]              [--root <dir>] [--no-raw-restore] [--read-only] [--approval-mode automatic|native] [--rules-only]",
      "  maskera-mcp proxy              [--port 8787] [--host 127.0.0.1] [--root <dir>] [--open] [--upstream <url>] [--audit-log <file.jsonl>] [--no-raw-restore] [--read-only] [--approval-mode automatic|browser] [--rules-only] [--no-restore]",
      "  maskera-mcp wrap [flags] -- <cmd> [args...]   Start local proxy, verify, inject ANTHROPIC_BASE_URL/OPENAI_BASE_URL, and run <cmd>",
      "  maskera-mcp guard              [--redact] [--file <path>] [--proxy-url <url>] [--no-proxy] [--rules-only]",
      `  maskera-mcp install [client|all] [--transport stdio|http] [--url <http://127.0.0.1:8787/mcp>] [--root <dir>] [--apply] [--project] [--with-hook] [--no-raw-restore] [--read-only] [--config <path>] [--receipt <file.json>] [--no-verify] [--dry-run]`,
      "  maskera-mcp doctor             [--root <dir>] [--proxy-url <url>] [--receipt <file.json>] [--rules-only] [--json]",
      "  maskera-mcp service <install|status|uninstall> [--port 8787] [--root <dir>] [--no-raw-restore] [--rules-only] [--dry-run] [--json]",
      "",
      "Subcommands:",
      "  mcp       (default) Start MCP stdio server (read/write/list/search files, redact, restore, prompts, resources)",
      "  proxy     Start local Anthropic/OpenAI HTTP reverse proxy + Streamable HTTP /mcp + live inspector",
      "  wrap      One-command launcher: starts ephemeral local proxy, verifies 0 leaks, runs any CLI with proxy env vars, prints session receipt on exit",
      "  guard     Check stdin/file/hook JSON for PII (exits 2 if PII found, or outputs redacted text with --redact)",
      `  install   Auto-detect or configure an MCP client (${SUPPORTED_CLIENTS.join(", ")}, or all) + optional guard hook (--with-hook) + setup receipt`,
      "  doctor    Verify Node runtime, workspace roots, local Swedish PII roundtrip, and running proxy + /mcp",
      "  service   Install, inspect, or remove a local launchd (macOS) or systemd --user (Linux) background proxy service",
      "",
      "Common options:",
      "  --rules-only            Deterministic Swedish rules only (no ONNX model load)",
      "  --profile <p>           Precision profile: 'general' or 'clinical'",
      "  --custom-term <word>    Extra protected word/phrase (repeatable)",
      "  --no-raw-restore        Block maskera_restore and include_map=true (allow maskera_write_file only)",
      "  --read-only             Hide and block maskera_write_file and maskera_clear_session",
      "  --approval-mode <m>     Raw PII export gate: 'automatic' (default), 'browser', or 'native'",
      "  --open                  Open local live inspector (/_maskera) in the browser (proxy/wrap)",
      "  -v, --version           Print version",
      "  -h, --help              Print this help",
      "",
      "Environment:",
      "  MASKERA_MCP_ROOTS           Path-delimited allowed workspace roots (mcp/proxy)",
      "  MASKERA_MCP_MODE            'auto' (default) or 'rules'",
      "  MASKERA_MCP_NO_RAW_RESTORE  '1' to disable raw PII export into model context",
      "  MASKERA_MCP_READ_ONLY       '1' to disable file writes and session clears",
      "  MASKERA_MCP_APPROVAL_MODE   'automatic', 'browser', or 'native'",
      "  MASKERA_MODEL_PATH          Local ONNX model directory base path",
      "  MASKERA_MODEL_ID            Model id (defaults to joelhagvall/maskera-sv-ner)",
      "  MASKERA_DTYPE               ONNX dtype: 'q8' (default on Node, ~2.5x faster), 'q4', or 'fp32'",
      "  MASKERA_CACHE_DIR           Transformers.js cache directory",
      "  MASKERA_ALLOW_REMOTE_MODELS '0' to disable Hugging Face Hub downloads",
      "",
    ].join("\n"),
  )
}

function buildEngine(args: ParsedCli) {
  const showProgress = args.command !== "mcp" && !args.json
  return createMaskeraEngine({
    defaultMode: args.defaultMode,
    onModelStatus: showProgress ? createModelProgressLogger() : undefined,
    nerOptions: {
      localModelPath: process.env.MASKERA_MODEL_PATH || undefined,
      model: process.env.MASKERA_MODEL_ID || undefined,
      dtype: process.env.MASKERA_DTYPE || undefined,
      cacheDir: process.env.MASKERA_CACHE_DIR || undefined,
      allowRemoteModels:
        process.env.MASKERA_ALLOW_REMOTE_MODELS === "0"
          ? false
          : process.env.MASKERA_ALLOW_REMOTE_MODELS === "1"
            ? true
            : undefined,
    },
  })
}

const MAX_GUARD_INPUT_BYTES = 16 * 1024 * 1024 // 16 MiB ceiling

async function readStdinAll(maxBytes = MAX_GUARD_INPUT_BYTES): Promise<string> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of process.stdin) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buf.byteLength
    if (total > maxBytes) {
      throw new Error(`Input exceeds max allowed size (${maxBytes} bytes).`)
    }
    chunks.push(buf)
  }
  return Buffer.concat(chunks).toString("utf8")
}

function formatSingleInstallHuman(installed: InstallResult): string {
  const lines: string[] = []
  if (installed.applied && installed.command) {
    lines.push(`Registered Maskera in ${installed.client} (${installed.transport}):`)
    lines.push(`  ${installed.command}`)
    if (installed.applyOutput) lines.push(`  ${installed.applyOutput}`)
  } else if (installed.written && installed.configPath) {
    lines.push(`Updated ${installed.configPath} for ${installed.client} (${installed.transport}).`)
  } else if (installed.command) {
    lines.push(
      `Run this command for ${installed.client} (or pass --apply to run it automatically):`,
    )
    lines.push("")
    lines.push(`  ${installed.command}`)
  } else if (installed.configPath) {
    lines.push(`Dry run for ${installed.client} (${installed.configPath}):`)
    lines.push("")
    lines.push(installed.snippet.trimEnd())
  } else {
    lines.push(`Add this to ${installed.client}:`)
    lines.push("")
    lines.push(installed.snippet.trimEnd())
  }
  if (installed.hookPath) {
    lines.push(
      installed.hookWritten
        ? `Installed PII guard hook in ${installed.hookPath}.`
        : `Dry run: would install PII guard hook in ${installed.hookPath}.`,
    )
  }
  return `${lines.join("\n")}\n`
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.version) {
    process.stdout.write(`${SERVER_NAME} ${SERVER_VERSION}\n`)
    return
  }

  if (args.help) {
    printHelp()
    return
  }

  // Route third-party console output (Transformers.js / ONNX warnings) to
  // stderr so stdout stays clean for MCP JSON-RPC, install/doctor --json, and guard --redact.
  const writeStderr = (...items: unknown[]) => {
    process.stderr.write(`${format(...items)}\n`)
  }
  console.log = writeStderr
  console.info = writeStderr
  console.debug = writeStderr
  console.warn = writeStderr

  if (args.command === "service") {
    const action: ServiceAction = args.serviceAction ?? "status"
    const res = await runService({
      action,
      host: args.host,
      port: args.port,
      roots: args.roots,
      rulesOnly: args.defaultMode === "rules",
      noRawRestore: !args.allowRawRestore,
      readOnly: args.readOnly,
      approvalMode: args.approvalMode,
      profile: args.profile,
      customTerms: args.customTerms,
      auditLogPath: args.auditLogPath,
      dryRun: args.dryRun,
    })
    if (args.json) {
      process.stdout.write(`${JSON.stringify(res, null, 2)}\n`)
    } else {
      process.stdout.write(`${res.detail}\n`)
      if (args.dryRun && res.snippet) {
        process.stdout.write(`\n${res.snippet}`)
      } else if (res.action === "install" && res.installed) {
        process.stdout.write(
          `  Inspector:           ${res.inspectorUrl}\n  Streamable HTTP MCP: ${res.mcpUrl}\n`,
        )
      }
    }
    if (res.manager === "unsupported" && action !== "status") process.exit(1)
    return
  }

  if (args.command === "install") {
    let targets: InstallClient[] = []
    if (!args.client) {
      const detected = await detectInstalledClients()
      if (detected.length === 1 && detected[0]) {
        targets = [detected[0]]
      } else if (detected.length > 1) {
        if (args.json) {
          process.stdout.write(`${JSON.stringify({ detected }, null, 2)}\n`)
          return
        }
        process.stdout.write(
          [
            `Detected clients: ${detected.join(", ")}`,
            "",
            "Run install for one client, or pass 'all' to configure all detected clients:",
            ...detected.map(
              (c) =>
                `  npx -y @maskera/mcp install ${c} --root . --no-raw-restore${c === "claude-code" || c === "codex" ? " --apply" : ""}${c === "claude-code" || c === "cursor" ? " --with-hook" : ""}`,
            ),
            "  npx -y @maskera/mcp install all --root . --no-raw-restore",
            "",
          ].join("\n"),
        )
        return
      } else {
        throw new Error(
          `No supported AI client detected automatically. Specify one explicitly: maskera-mcp install <${SUPPORTED_CLIENTS.join("|")}>`,
        )
      }
    } else if (args.client === "all") {
      const detected = await detectInstalledClients()
      if (detected.length === 0) {
        throw new Error(
          `No supported AI client detected for "install all". Specify one explicitly: maskera-mcp install <${SUPPORTED_CLIENTS.join("|")}>`,
        )
      }
      targets = detected
    } else {
      targets = [args.client]
    }

    const results: InstallResult[] = []
    for (const targetClient of targets) {
      results.push(
        await runInstall({
          client: targetClient,
          transport: args.transport,
          mcpUrl: args.mcpUrl,
          roots: args.roots,
          noRawRestore: !args.allowRawRestore,
          readOnly: args.readOnly,
          approvalMode: args.approvalMode,
          rulesOnly: args.defaultMode === "rules",
          profile: args.profile,
          customTerms: args.customTerms,
          configPath: targets.length === 1 ? args.configPath : undefined,
          apply: args.apply,
          project: args.project,
          withHook: args.withHook,
          dryRun: args.dryRun,
        }),
      )
    }

    const primary = results[0]
    if (!primary) return

    let receipt: Awaited<ReturnType<typeof runDoctor>> | undefined
    let receiptSavedPath: string | undefined
    if (args.verify) {
      const verifyEngine = buildEngine(args)
      receipt = await runDoctor({
        engine: verifyEngine,
        roots: args.roots,
        mode: args.defaultMode,
        profile: args.profile,
        customTerms: args.customTerms.length > 0 ? args.customTerms : undefined,
        proxyUrl: args.proxyUrl,
        mcpUrl: args.transport === "http" ? args.mcpUrl : undefined,
        client: targets.length === 1 ? primary.client : targets.join(","),
        transport: primary.transport,
        configPath: targets.length === 1 ? primary.configPath : null,
      })
      if (args.receiptPath) {
        receiptSavedPath = await writeDoctorReceipt(args.receiptPath, receipt)
      }
    }

    if (args.json) {
      const payload =
        results.length === 1
          ? {
              ...primary,
              ...(receipt ? { receipt } : {}),
              ...(receiptSavedPath ? { receiptPath: receiptSavedPath } : {}),
            }
          : {
              clients: results,
              ...(receipt ? { receipt } : {}),
              ...(receiptSavedPath ? { receiptPath: receiptSavedPath } : {}),
            }
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
      if (receipt && !receipt.ok) process.exit(1)
      return
    }

    for (const installed of results) {
      process.stdout.write(formatSingleInstallHuman(installed))
    }
    if (receipt) {
      process.stdout.write(
        `\n${formatDoctorReport(
          receipt,
          `Setup receipt (${receipt.ok ? "OK" : "FAILED"}, @maskera/mcp ${receipt.version}, mode=${receipt.mode}):`,
        )}`,
      )
      if (receiptSavedPath) {
        process.stdout.write(`Saved receipt: ${receiptSavedPath}\n`)
      }
    }
    process.stdout.write(`\nVerify: ${primary.verifyStep}\n`)
    if (receipt && !receipt.ok) process.exit(1)
    return
  }

  if (args.command === "guard") {
    let raw: string
    if (args.file) {
      const buf = await readFile(args.file)
      if (buf.byteLength > MAX_GUARD_INPUT_BYTES) {
        throw new Error(
          `"${args.file}" is ${buf.byteLength} bytes (max ${MAX_GUARD_INPUT_BYTES} bytes for guard).`,
        )
      }
      if (buf.includes(0)) {
        throw new Error(`"${args.file}" appears to be a binary file; only UTF-8 text is supported.`)
      }
      try {
        raw = new TextDecoder("utf-8", { fatal: true }).decode(buf)
      } catch {
        throw new Error(`"${args.file}" is not valid UTF-8 text; convert it to UTF-8 first.`)
      }
    } else {
      raw = await readStdinAll()
    }

    // Reuse a warm local proxy's already-loaded ONNX model when running in hybrid
    // mode (or when --proxy-url was explicitly passed) so hooks finish in ~10ms
    // instead of cold-loading 43 MB per invocation. Falls back locally if offline.
    const shouldTryWarmProxy =
      !args.noProxy && (args.defaultMode !== "rules" || Boolean(args.proxyUrl))
    const warmProxyUrl = args.proxyUrl ?? process.env.MASKERA_PROXY_URL ?? "http://127.0.0.1:8787"

    const warmResult = shouldTryWarmProxy
      ? await runGuardViaWarmProxy(raw, {
          proxyUrl: warmProxyUrl,
          mode: args.defaultMode,
          profile: args.profile,
          customTerms: args.customTerms.length > 0 ? args.customTerms : undefined,
          preserveJsonStructure: args.redact,
          includeRedacted: args.redact,
        })
      : null

    const result =
      warmResult ??
      (await runGuard(raw, buildEngine(args), {
        mode: args.defaultMode,
        profile: args.profile,
        customTerms: args.customTerms.length > 0 ? args.customTerms : undefined,
        preserveJsonStructure: args.redact,
      }))
    if (args.redact) {
      process.stdout.write(result.redacted)
      return
    }
    if (result.blocked) {
      const summary = Object.entries(result.counts)
        .map(([label, n]) => `${label}=${n}`)
        .join(", ")
      process.stderr.write(
        `[maskera-guard] Blocked: detected ${result.totalRedactions} PII item(s) (${summary}). Redact with maskera before sending.\n`,
      )
      process.exit(2)
    }
    return
  }

  const engine = buildEngine(args)

  if (args.command === "wrap") {
    if (!args.wrapCommand) {
      throw new Error(
        "Missing command to wrap. Usage: maskera-mcp wrap [flags] -- <command> [args...]",
      )
    }
    const wrapRes = await runWrap({
      command: args.wrapCommand,
      args: args.wrapArgs,
      engine,
      roots: args.roots,
      host: args.host,
      port: args.portExplicit ? args.port : 0,
      upstream: args.upstream,
      anthropicUpstream: args.anthropicUpstream,
      openaiUpstream: args.openaiUpstream,
      allowRawRestore: args.allowRawRestore,
      readOnly: args.readOnly,
      approvalMode: args.approvalMode,
      profile: args.profile,
      customTerms: args.customTerms.length > 0 ? args.customTerms : undefined,
      restoreResponses: args.restoreResponses,
      auditLogPath: args.auditLogPath,
      verify: args.verify,
      receiptPath: args.receiptPath,
      openInspector: args.openInspector,
    })
    process.exit(wrapRes.exitCode)
  }

  if (args.command === "doctor") {
    const report = await runDoctor({
      engine,
      roots: args.roots,
      mode: args.defaultMode,
      profile: args.profile,
      customTerms: args.customTerms.length > 0 ? args.customTerms : undefined,
      proxyUrl: args.proxyUrl,
      mcpUrl: args.mcpUrl,
    })
    const savedPath = args.receiptPath
      ? await writeDoctorReceipt(args.receiptPath, report)
      : undefined
    if (args.json) {
      process.stdout.write(
        `${JSON.stringify(savedPath ? { ...report, receiptPath: savedPath } : report, null, 2)}\n`,
      )
    } else {
      process.stdout.write(formatDoctorReport(report))
      if (savedPath) process.stdout.write(`Saved receipt: ${savedPath}\n`)
    }
    if (!report.ok) process.exit(1)
    return
  }

  if (args.command === "proxy") {
    const running = await startMaskeraProxy({
      host: args.host,
      port: args.port,
      upstream: args.upstream,
      anthropicUpstream: args.anthropicUpstream,
      openaiUpstream: args.openaiUpstream,
      engine,
      mcpRoots: args.roots,
      allowRawRestore: args.allowRawRestore,
      readOnly: args.readOnly,
      approvalMode: args.approvalMode,
      profile: args.profile,
      customTerms: args.customTerms.length > 0 ? args.customTerms : undefined,
      restoreResponses: args.restoreResponses,
      auditLogPath: args.auditLogPath,
      onLog: (line) => process.stderr.write(`${line}\n`),
    })
    engine.warmup()
    process.stderr.write(
      [
        `[maskera-proxy] listening on ${running.url} (mode=${args.defaultMode}, restore=${args.restoreResponses})`,
        `  Local live inspector:    ${running.inspectorUrl}`,
        `  Streamable HTTP MCP:     ${running.mcpUrl}`,
        `  Claude Code / Anthropic: ANTHROPIC_BASE_URL=${running.url}`,
        `  Codex / Cursor / OpenAI: OPENAI_BASE_URL=${running.url}/v1`,
        `  Or one-command launch:   npx -y @maskera/mcp wrap -- claude`,
        ...(args.auditLogPath ? [`  Local audit log (JSONL): ${args.auditLogPath}`] : []),
        "",
      ].join("\n"),
    )
    if (args.openInspector) {
      openUrlInBrowser(running.inspectorUrl)
    }
    const shutdown = () => {
      void running.close().finally(() => process.exit(0))
    }
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)
    return
  }

  // Default: MCP stdio server with bidirectional elicitation support.
  let nextServerReqId = 1
  const pendingClientResponses = new Map<
    string,
    { resolve: (value: ElicitationResponse) => void; reject: (err: Error) => void }
  >()

  const requestElicitation = (req: ElicitationRequest): Promise<ElicitationResponse> => {
    const id = `maskera_elicit_${nextServerReqId++}`
    return new Promise<ElicitationResponse>((resolveReq, rejectReq) => {
      pendingClientResponses.set(id, { resolve: resolveReq, reject: rejectReq })
      process.stdout.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id,
          method: "elicitation/create",
          params: req,
        })}\n`,
      )
    })
  }

  const server = createMaskeraMcpServer({
    engine,
    allowedRoots: args.roots,
    defaultProfile: args.profile,
    defaultCustomTerms: args.customTerms.length > 0 ? args.customTerms : undefined,
    allowRawRestore: args.allowRawRestore,
    readOnly: args.readOnly,
    approvalMode: args.approvalMode,
    requestElicitation,
  })
  // Warm up ONNX in the background while the MCP client completes initialize/tools/list.
  engine.warmup()
  let chain = Promise.resolve()
  const rl = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })

  rl.on("line", (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      chain = chain.then(() => {
        process.stdout.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          })}\n`,
        )
      })
      return
    }

    // Handle responses to server-initiated requests (such as elicitation/create)
    // immediately outside the request chain so in-flight calls never deadlock.
    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      !("method" in parsed) &&
      typeof (parsed as { id?: unknown }).id === "string"
    ) {
      const resp = parsed as { id: string; result?: unknown; error?: { message?: string } }
      const pending = pendingClientResponses.get(resp.id)
      if (pending) {
        pendingClientResponses.delete(resp.id)
        if (resp.error) {
          pending.resolve({ action: "cancel" })
        } else {
          const resultObj =
            resp.result && typeof resp.result === "object"
              ? (resp.result as Record<string, unknown>)
              : {}
          const action =
            resultObj.action === "accept" ||
            resultObj.action === "decline" ||
            resultObj.action === "cancel"
              ? resultObj.action
              : "cancel"
          const content =
            resultObj.content &&
            typeof resultObj.content === "object" &&
            !Array.isArray(resultObj.content)
              ? (resultObj.content as Record<string, unknown>)
              : undefined
          pending.resolve({ action, content })
        }
        return
      }
    }

    chain = chain.then(async () => {
      try {
        const response = await server.handleMessage(parsed)
        if (response) {
          process.stdout.write(`${JSON.stringify(response)}\n`)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`[maskera-mcp] internal error: ${message}\n`)
        const maybeId =
          parsed && typeof parsed === "object" && !Array.isArray(parsed)
            ? (parsed as { id?: unknown }).id
            : undefined
        if (typeof maybeId === "string" || typeof maybeId === "number" || maybeId === null) {
          process.stdout.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: maybeId,
              error: { code: -32603, message: "Internal error" },
            })}\n`,
          )
        }
      }
    })
  })

  rl.on("close", () => {
    for (const pending of pendingClientResponses.values()) {
      pending.resolve({ action: "cancel" })
    }
    pendingClientResponses.clear()
  })
}

const isGuardCommand = process.argv[2] === "guard"

void main().catch((err) => {
  process.stderr.write(`[maskera-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  // Guard fails closed with exit code 2 so agent hooks (e.g. Claude Code)
  // block rather than silently allowing unredacted prompts when guard errors.
  process.exit(isGuardCommand ? 2 : 1)
})
