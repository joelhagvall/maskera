import { readFile } from "node:fs/promises"
import { delimiter } from "node:path"
import { createInterface } from "node:readline"
import { format } from "node:util"
import type { RedactionProfile } from "maskera"
import { createMaskeraEngine, type MaskMode } from "./engine"
import { runGuard } from "./guard"
import { startMaskeraProxy } from "./proxy"
import { createMaskeraMcpServer, SERVER_NAME, SERVER_VERSION } from "./server"

type Subcommand = "mcp" | "proxy" | "guard"

interface ParsedCli {
  command: Subcommand
  roots: string[]
  defaultMode: MaskMode
  profile?: RedactionProfile
  customTerms: string[]
  help: boolean
  version: boolean
  // proxy flags
  host: string
  port: number
  upstream?: string
  anthropicUpstream?: string
  openaiUpstream?: string
  restoreResponses: boolean
  // guard flags
  redact: boolean
  file?: string
}

function parseArgs(argv: readonly string[]): ParsedCli {
  let startIndex = 0
  let command: Subcommand = "mcp"
  if (argv[0] === "proxy" || argv[0] === "guard" || argv[0] === "mcp") {
    command = argv[0]
    startIndex = 1
  }

  const roots: string[] = []
  const customTerms: string[] = []
  let defaultMode: MaskMode = process.env.MASKERA_MCP_MODE === "rules" ? "rules" : "auto"
  let profile: RedactionProfile | undefined
  let help = false
  let version = false
  let host = process.env.MASKERA_PROXY_HOST || "127.0.0.1"
  let port = Number(process.env.MASKERA_PROXY_PORT || "8787")
  let upstream = process.env.MASKERA_PROXY_UPSTREAM || undefined
  let anthropicUpstream = process.env.MASKERA_ANTHROPIC_UPSTREAM || undefined
  let openaiUpstream = process.env.MASKERA_OPENAI_UPSTREAM || undefined
  let restoreResponses = true
  let redact = false
  let file: string | undefined

  const envRoots = process.env.MASKERA_MCP_ROOTS
  if (envRoots) {
    for (const entry of envRoots.split(delimiter)) {
      const trimmed = entry.trim()
      if (trimmed) roots.push(trimmed)
    }
  }

  for (let i = startIndex; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--help" || arg === "-h") {
      help = true
    } else if (arg === "--version" || arg === "-v") {
      version = true
    } else if (arg === "--rules-only") {
      defaultMode = "rules"
    } else if (arg === "--no-restore") {
      restoreResponses = false
    } else if (arg === "--redact") {
      redact = true
    } else if (arg === "--root" && argv[i + 1]) {
      roots.push(argv[++i] as string)
    } else if (arg?.startsWith("--root=")) {
      const value = arg.slice("--root=".length).trim()
      if (value) roots.push(value)
    } else if (arg === "--host" && argv[i + 1]) {
      host = argv[++i] as string
    } else if (arg?.startsWith("--host=")) {
      host = arg.slice("--host=".length).trim()
    } else if (arg === "--port" && argv[i + 1]) {
      port = Number(argv[++i])
    } else if (arg?.startsWith("--port=")) {
      port = Number(arg.slice("--port=".length).trim())
    } else if (arg === "--upstream" && argv[i + 1]) {
      upstream = argv[++i] as string
    } else if (arg?.startsWith("--upstream=")) {
      upstream = arg.slice("--upstream=".length).trim()
    } else if (arg === "--anthropic-upstream" && argv[i + 1]) {
      anthropicUpstream = argv[++i] as string
    } else if (arg === "--openai-upstream" && argv[i + 1]) {
      openaiUpstream = argv[++i] as string
    } else if (arg === "--profile" && argv[i + 1]) {
      const val = argv[++i]
      if (val === "general" || val === "clinical") profile = val
    } else if (arg === "--custom-term" && argv[i + 1]) {
      customTerms.push(argv[++i] as string)
    } else if (arg === "--file" && argv[i + 1]) {
      file = argv[++i] as string
    }
  }

  if (roots.length === 0) roots.push(process.cwd())
  if (!Number.isFinite(port) || port < 0 || port > 65535) port = 8787

  return {
    command,
    roots,
    defaultMode,
    profile,
    customTerms,
    help,
    version,
    host,
    port,
    upstream,
    anthropicUpstream,
    openaiUpstream,
    restoreResponses,
    redact,
    file,
  }
}

function printHelp(): void {
  process.stdout.write(
    [
      `${SERVER_NAME} ${SERVER_VERSION}`,
      "Local Swedish PII redaction for any AI agent: MCP server, harness-agnostic LLM proxy, and hook guard.",
      "",
      "Usage:",
      "  maskera-mcp [mcp]   [--root <dir>] [--rules-only]",
      "  maskera-mcp proxy   [--port 8787] [--host 127.0.0.1] [--upstream <url>] [--rules-only] [--no-restore]",
      "  maskera-mcp guard   [--redact] [--file <path>] [--rules-only]",
      "",
      "Subcommands:",
      "  mcp     (default) Start MCP stdio server (maskera_read_file, maskera_write_file, maskera_redact, ...)",
      "  proxy   Start local Anthropic/OpenAI HTTP reverse proxy (works with Claude Code, Codex, Cursor, OpenCode, SDKs)",
      "  guard   Check stdin/file/hook JSON for PII (exits 2 if PII found, or outputs redacted text with --redact)",
      "",
      "Common options:",
      "  --rules-only            Deterministic Swedish rules only (no ONNX model load)",
      "  --profile <p>           Precision profile: 'general' or 'clinical'",
      "  --custom-term <word>    Extra protected word/phrase (repeatable)",
      "  -v, --version           Print version",
      "  -h, --help              Print this help",
      "",
      "Environment:",
      "  MASKERA_MCP_ROOTS           Path-delimited allowed workspace roots (mcp)",
      "  MASKERA_MCP_MODE            'auto' (default) or 'rules'",
      "  MASKERA_MODEL_PATH          Local ONNX model directory base path",
      "  MASKERA_MODEL_ID            Model id (defaults to joelhagvall/maskera-sv-ner)",
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

  // Route third-party console output (Transformers.js / ONNX warnings) to
  // stderr so stdout stays clean for MCP JSON-RPC and guard --redact output.
  const writeStderr = (...items: unknown[]) => {
    process.stderr.write(`${format(...items)}\n`)
  }
  console.log = writeStderr
  console.info = writeStderr
  console.debug = writeStderr
  console.warn = writeStderr

  const engine = buildEngine(args)

  if (args.command === "proxy") {
    const running = await startMaskeraProxy({
      host: args.host,
      port: args.port,
      upstream: args.upstream,
      anthropicUpstream: args.anthropicUpstream,
      openaiUpstream: args.openaiUpstream,
      engine,
      profile: args.profile,
      customTerms: args.customTerms.length > 0 ? args.customTerms : undefined,
      restoreResponses: args.restoreResponses,
      onLog: (line) => process.stderr.write(`${line}\n`),
    })
    process.stderr.write(
      [
        `[maskera-proxy] listening on ${running.url} (mode=${args.defaultMode}, restore=${args.restoreResponses})`,
        `  Claude Code / Anthropic: ANTHROPIC_BASE_URL=${running.url}`,
        `  Codex / Cursor / OpenAI: OPENAI_BASE_URL=${running.url}/v1`,
        `  Status (counts only):    ${running.url}/_maskera/status`,
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
    const raw = args.file ? await readFile(args.file, "utf8") : await readStdinAll()
    const result = await runGuard(raw, engine, {
      mode: args.defaultMode,
      profile: args.profile,
      customTerms: args.customTerms.length > 0 ? args.customTerms : undefined,
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

  // Default: MCP stdio server.
  const server = createMaskeraMcpServer({ engine, allowedRoots: args.roots })
  let chain = Promise.resolve()
  const rl = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })

  rl.on("line", (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    chain = chain.then(async () => {
      let parsed: unknown
      try {
        parsed = JSON.parse(trimmed)
      } catch {
        process.stdout.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            error: { code: -32700, message: "Parse error" },
          })}\n`,
        )
        return
      }
      try {
        const response = await server.handleMessage(parsed)
        if (response) {
          process.stdout.write(`${JSON.stringify(response)}\n`)
        }
      } catch (err) {
        process.stderr.write(
          `[maskera-mcp] internal error: ${err instanceof Error ? err.message : String(err)}\n`,
        )
      }
    })
  })
}

void main().catch((err) => {
  process.stderr.write(`[maskera-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
