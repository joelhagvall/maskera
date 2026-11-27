import { readFile } from "node:fs/promises"
import { delimiter } from "node:path"
import { createInterface } from "node:readline"
import { format } from "node:util"
import type { RedactionProfile } from "maskera"
import type { ApprovalMode } from "./approvals"
import { formatDoctorReport, runDoctor } from "./doctor"
import { createMaskeraEngine, type MaskMode } from "./engine"
import { runGuard } from "./guard"
import {
  type InstallClient,
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

type Subcommand = "mcp" | "proxy" | "guard" | "install" | "doctor"

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
  // proxy flags
  host: string
  port: number
  upstream?: string
  anthropicUpstream?: string
  openaiUpstream?: string
  restoreResponses: boolean
  auditLogPath?: string
  // guard flags
  redact: boolean
  file?: string
  // install flags
  client?: InstallClient
  transport: InstallTransport
  mcpUrl?: string
  configPath?: string
  dryRun: boolean
  // doctor flags
  proxyUrl?: string
  json: boolean
}

function parseApprovalMode(raw: string): ApprovalMode {
  const v = raw.trim().toLowerCase()
  if (v === "automatic" || v === "browser" || v === "native") return v
  throw new Error(`Invalid --approval-mode "${raw}": expected "automatic", "browser", or "native".`)
}

function parseArgs(argv: readonly string[]): ParsedCli {
  let startIndex = 0
  let command: Subcommand = "mcp"
  if (
    argv[0] === "proxy" ||
    argv[0] === "guard" ||
    argv[0] === "mcp" ||
    argv[0] === "install" ||
    argv[0] === "doctor"
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
  let upstream = process.env.MASKERA_PROXY_UPSTREAM || undefined
  let anthropicUpstream = process.env.MASKERA_ANTHROPIC_UPSTREAM || undefined
  let openaiUpstream = process.env.MASKERA_OPENAI_UPSTREAM || undefined
  let restoreResponses = true
  let auditLogPath = process.env.MASKERA_AUDIT_LOG || undefined
  let redact = false
  let file: string | undefined
  let client: InstallClient | undefined
  let transport: InstallTransport = "stdio"
  let mcpUrl: string | undefined
  let configPath: string | undefined
  let dryRun = false
  let proxyUrl: string | undefined
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
    } else if (flag === "--redact") {
      redact = true
    } else if (flag === "--dry-run") {
      dryRun = true
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
    } else if (command === "install" && !arg.startsWith("-") && !client) {
      if (!isInstallClient(arg)) {
        throw new Error(
          `Unknown client "${arg}". Expected one of: ${SUPPORTED_CLIENTS.join(", ")}.`,
        )
      }
      client = arg
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
    upstream,
    anthropicUpstream,
    openaiUpstream,
    restoreResponses,
    auditLogPath,
    redact,
    file,
    client,
    transport,
    mcpUrl,
    configPath,
    dryRun,
    proxyUrl,
    json,
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      `${SERVER_NAME} ${SERVER_VERSION}`,
      "Local Swedish PII redaction for any AI agent: MCP server (stdio + Streamable HTTP), LLM proxy, hook guard, installer, and doctor.",
      "",
      "Usage:",
      "  maskera-mcp [mcp]            [--root <dir>] [--no-raw-restore] [--read-only] [--approval-mode automatic|native] [--rules-only]",
      "  maskera-mcp proxy            [--port 8787] [--host 127.0.0.1] [--root <dir>] [--upstream <url>] [--audit-log <file.jsonl>] [--no-raw-restore] [--read-only] [--approval-mode automatic|browser] [--rules-only] [--no-restore]",
      "  maskera-mcp guard            [--redact] [--file <path>] [--rules-only]",
      `  maskera-mcp install <client> [--transport stdio|http] [--url <http://127.0.0.1:8787/mcp>] [--root <dir>] [--no-raw-restore] [--read-only] [--config <path>] [--dry-run]`,
      "  maskera-mcp doctor           [--root <dir>] [--proxy-url <url>] [--rules-only] [--json]",
      "",
      "Subcommands:",
      "  mcp       (default) Start MCP stdio server (read/write/list/search files, redact, restore, prompts, resources)",
      "  proxy     Start local Anthropic/OpenAI HTTP reverse proxy + Streamable HTTP /mcp + live inspector",
      "  guard     Check stdin/file/hook JSON for PII (exits 2 if PII found, or outputs redacted text with --redact)",
      `  install   Configure an MCP client (${SUPPORTED_CLIENTS.join(", ")})`,
      "  doctor    Verify Node runtime, workspace roots, local Swedish PII roundtrip, and running proxy",
      "",
      "Common options:",
      "  --rules-only            Deterministic Swedish rules only (no ONNX model load)",
      "  --profile <p>           Precision profile: 'general' or 'clinical'",
      "  --custom-term <word>    Extra protected word/phrase (repeatable)",
      "  --no-raw-restore        Block maskera_restore and include_map=true (allow maskera_write_file only)",
      "  --read-only             Hide and block maskera_write_file and maskera_clear_session",
      "  --approval-mode <m>     Raw PII export gate: 'automatic' (default), 'browser', or 'native'",
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
  return createMaskeraEngine({
    defaultMode: args.defaultMode,
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

async function readStdinAll(): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString("utf8")
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

  if (args.command === "install") {
    if (!args.client) {
      throw new Error(
        `Missing client name. Usage: maskera-mcp install <${SUPPORTED_CLIENTS.join("|")}>`,
      )
    }
    const installed = await runInstall({
      client: args.client,
      transport: args.transport,
      mcpUrl: args.mcpUrl,
      roots: args.roots,
      noRawRestore: !args.allowRawRestore,
      readOnly: args.readOnly,
      approvalMode: args.approvalMode,
      rulesOnly: args.defaultMode === "rules",
      profile: args.profile,
      customTerms: args.customTerms,
      configPath: args.configPath,
      dryRun: args.dryRun,
    })
    if (args.json) {
      process.stdout.write(`${JSON.stringify(installed, null, 2)}\n`)
      return
    }
    if (installed.written && installed.configPath) {
      process.stdout.write(
        `Updated ${installed.configPath} for ${installed.client} (${installed.transport}).\n`,
      )
    } else if (installed.command) {
      process.stdout.write(`Run this command for ${installed.client}:\n\n  ${installed.command}\n`)
    } else if (installed.configPath) {
      process.stdout.write(
        `Dry run for ${installed.client} (${installed.configPath}):\n\n${installed.snippet}`,
      )
    } else {
      process.stdout.write(`Add this to ${installed.client}:\n\n${installed.snippet}`)
    }
    process.stdout.write(`\nVerify: ${installed.verifyStep}\n`)
    return
  }

  // Route third-party console output (Transformers.js / ONNX warnings) to
  // stderr so stdout stays clean for MCP JSON-RPC, doctor --json, and guard --redact.
  const writeStderr = (...items: unknown[]) => {
    process.stderr.write(`${format(...items)}\n`)
  }
  console.log = writeStderr
  console.info = writeStderr
  console.debug = writeStderr
  console.warn = writeStderr

  const engine = buildEngine(args)

  if (args.command === "doctor") {
    const report = await runDoctor({
      engine,
      roots: args.roots,
      mode: args.defaultMode,
      profile: args.profile,
      customTerms: args.customTerms.length > 0 ? args.customTerms : undefined,
      proxyUrl: args.proxyUrl,
    })
    if (args.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    } else {
      process.stdout.write(formatDoctorReport(report))
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
        ...(args.auditLogPath ? [`  Local audit log (JSONL): ${args.auditLogPath}`] : []),
        "",
      ].join("\n"),
    )
    const shutdown = () => {
      void running.close().finally(() => process.exit(0))
    }
    process.on("SIGINT", shutdown)
    process.on("SIGTERM", shutdown)
    return
  }

  if (args.command === "guard") {
    let raw: string
    if (args.file) {
      const buf = await readFile(args.file)
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
    const result = await runGuard(raw, engine, {
      mode: args.defaultMode,
      profile: args.profile,
      customTerms: args.customTerms.length > 0 ? args.customTerms : undefined,
      preserveJsonStructure: args.redact,
    })
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
