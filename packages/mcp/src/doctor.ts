import { constants as fsConstants } from "node:fs"
import { access, mkdir, stat, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import type { RedactionProfile } from "maskera"
import type { MaskeraEngine, MaskMode } from "./engine"
import { SERVER_VERSION } from "./server"
import { SessionVault } from "./vault"

export type DoctorCheckStatus = "ok" | "warn" | "fail"

export interface DoctorCheck {
  name: string
  status: DoctorCheckStatus
  detail: string
}

export interface DoctorSampleProof {
  modeUsed: "hybrid" | "rules"
  maskedCount: number
  countsByLabel: Record<string, number>
  redactedPreview: string
  rawPiiLeaked: boolean
  roundtripRestored: boolean
  elapsedMs: number
}

export interface DoctorReport {
  schema: "maskera-setup-receipt/v1"
  timestamp: string
  version: string
  ok: boolean
  mode: MaskMode
  client?: string
  transport?: string
  configPath?: string | null
  sampleProof: DoctorSampleProof | null
  checks: DoctorCheck[]
}

const SYNTHETIC_SAMPLE =
  "Kontakta Anna Lindqvist (19900101-2385) på provnamn.maskera@example.com eller 070-174 06 58."
const SYNTHETIC_SECRETS = [
  "19900101-2385",
  "provnamn.maskera@example.com",
  "070-174 06 58",
] as const

async function probeLiveHttpMcp(mcpUrl: string): Promise<DoctorCheck> {
  const startedAt = Date.now()
  try {
    const initRes = await fetch(mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-11-25" },
      }),
      signal: AbortSignal.timeout(1_500),
    })
    if (!initRes.ok) {
      return {
        name: "mcp-http",
        status: "fail",
        detail: `${mcpUrl} initialize returned HTTP ${initRes.status}`,
      }
    }
    const sessionId = initRes.headers.get("mcp-session-id")
    const callHeaders: Record<string, string> = { "content-type": "application/json" }
    if (sessionId) callHeaders["mcp-session-id"] = sessionId

    const redactRes = await fetch(mcpUrl, {
      method: "POST",
      headers: callHeaders,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "maskera_redact",
          arguments: {
            text: "Test provnamn.maskera@example.com 19900101-2385",
            session_id: "doctor-http-probe",
          },
        },
      }),
      signal: AbortSignal.timeout(5_000),
    })
    const bodyText = await redactRes.text()
    if (sessionId) {
      await fetch(mcpUrl, {
        method: "DELETE",
        headers: { "mcp-session-id": sessionId },
        signal: AbortSignal.timeout(800),
      }).catch(() => {})
    }
    if (!redactRes.ok) {
      return {
        name: "mcp-http",
        status: "fail",
        detail: `${mcpUrl} tools/call returned HTTP ${redactRes.status}`,
      }
    }
    const leaked =
      bodyText.includes("provnamn.maskera@example.com") || bodyText.includes("19900101-2385")
    const hasPlaceholders = bodyText.includes("[EPOST_1]") && bodyText.includes("[PERSONNUMMER_1]")
    if (leaked || !hasPlaceholders) {
      return {
        name: "mcp-http",
        status: "fail",
        detail: `Live /mcp probe failed (leaked=${leaked}, placeholders=${hasPlaceholders})`,
      }
    }
    return {
      name: "mcp-http",
      status: "ok",
      detail: `Live ${mcpUrl} masked synthetic PII (0 leaks, ${Date.now() - startedAt}ms)`,
    }
  } catch (err) {
    return {
      name: "mcp-http",
      status: "fail",
      detail: `Live /mcp probe error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

export async function runDoctor(options: {
  engine: MaskeraEngine
  roots: readonly string[]
  mode?: MaskMode
  profile?: RedactionProfile
  customTerms?: readonly string[]
  proxyUrl?: string
  mcpUrl?: string
  client?: string
  transport?: string
  configPath?: string | null
}): Promise<DoctorReport> {
  const checks: DoctorCheck[] = []
  const mode = options.mode ?? options.engine.status().defaultMode
  let sampleProof: DoctorSampleProof | null = null

  // 1. Node runtime
  const major = Number(process.versions.node.split(".")[0] ?? 0)
  checks.push({
    name: "node",
    status: major >= 18 ? "ok" : "fail",
    detail: `Node ${process.versions.node} (requires >=18)`,
  })

  // 2. Allowed workspace roots
  for (const rawRoot of options.roots) {
    const abs = resolve(rawRoot)
    try {
      const info = await stat(abs)
      if (!info.isDirectory()) {
        checks.push({ name: `root:${abs}`, status: "fail", detail: "Not a directory" })
        continue
      }
      await access(abs, fsConstants.R_OK)
      checks.push({ name: `root:${abs}`, status: "ok", detail: "Readable directory" })
    } catch (err) {
      checks.push({
        name: `root:${abs}`,
        status: "fail",
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  // 3. Synthetic Swedish PII redact + restore self-test
  const startedAt = Date.now()
  try {
    const { result, modeUsed } = await options.engine.redact(SYNTHETIC_SAMPLE, {
      mode,
      profile: options.profile,
      customTerms: options.customTerms,
    })
    const vault = new SessionVault()
    const applied = vault.apply(SYNTHETIC_SAMPLE, result, "doctor-check")
    const restored = vault.restore(applied.redacted, { sessionId: applied.sessionId })
    const leaks = SYNTHETIC_SECRETS.filter((s) => applied.redacted.includes(s))
    const roundtripOk = restored.restored === SYNTHETIC_SAMPLE
    const elapsedMs = Date.now() - startedAt
    sampleProof = {
      modeUsed,
      maskedCount: applied.totalRedactions,
      countsByLabel: applied.counts,
      redactedPreview: applied.redacted,
      rawPiiLeaked: leaks.length > 0,
      roundtripRestored: roundtripOk,
      elapsedMs,
    }
    if (leaks.length > 0 || !roundtripOk) {
      checks.push({
        name: "redaction",
        status: "fail",
        detail: `Self-test failed (leaks=${leaks.length}, roundtrip=${roundtripOk})`,
      })
    } else {
      checks.push({
        name: "redaction",
        status: "ok",
        detail: `mode=${modeUsed}, masked=${applied.totalRedactions} items, roundtrip=ok (${elapsedMs}ms)`,
      })
    }
  } catch (err) {
    checks.push({
      name: "redaction",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
    })
  }

  // 4. Optional live proxy + Streamable HTTP /mcp probe
  let proxyBase = (options.proxyUrl ?? "http://127.0.0.1:8787").replace(/\/$/, "")
  if (!options.proxyUrl && options.mcpUrl) {
    try {
      const parsed = new URL(options.mcpUrl)
      proxyBase = parsed.origin
    } catch {
      // Keep default proxyBase
    }
  }
  let liveMcpUrl: string | null = null
  try {
    const res = await fetch(`${proxyBase}/_maskera/status`, {
      signal: AbortSignal.timeout(800),
    })
    if (res.ok) {
      const data = (await res.json()) as {
        mcp_url?: string
        requests_proxied?: number
        total_redactions?: number
      }
      liveMcpUrl = options.mcpUrl ?? data.mcp_url ?? `${proxyBase}/mcp`
      checks.push({
        name: "proxy",
        status: "ok",
        detail: `Running at ${proxyBase} (mcp=${liveMcpUrl}, requests=${data.requests_proxied ?? 0}, redacted=${data.total_redactions ?? 0})`,
      })
    } else {
      checks.push({
        name: "proxy",
        status: "warn",
        detail: `${proxyBase}/_maskera/status returned HTTP ${res.status}`,
      })
    }
  } catch {
    checks.push({
      name: "proxy",
      status: "warn",
      detail: `Not running on ${proxyBase} (start with "npx -y @maskera/mcp proxy" if needed)`,
    })
  }

  if (liveMcpUrl) {
    checks.push(await probeLiveHttpMcp(liveMcpUrl))
  }

  return {
    schema: "maskera-setup-receipt/v1",
    timestamp: new Date().toISOString(),
    version: SERVER_VERSION,
    ok: checks.every((c) => c.status !== "fail"),
    mode,
    ...(options.client ? { client: options.client } : {}),
    ...(options.transport ? { transport: options.transport } : {}),
    ...(options.configPath !== undefined ? { configPath: options.configPath } : {}),
    sampleProof,
    checks,
  }
}

export async function writeDoctorReceipt(filePath: string, report: DoctorReport): Promise<string> {
  const abs = resolve(filePath)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return abs
}

export function formatDoctorReport(report: DoctorReport, heading?: string): string {
  const title =
    heading ??
    `maskera-mcp doctor (${report.ok ? "OK" : "FAILED"}, v${report.version}, mode=${report.mode})`
  const lines = [title]
  for (const check of report.checks) {
    const tag = check.status === "ok" ? "[ok]  " : check.status === "warn" ? "[warn]" : "[fail]"
    lines.push(`  ${tag} ${check.name}: ${check.detail}`)
  }
  if (report.sampleProof && !report.sampleProof.rawPiiLeaked) {
    lines.push(`  [ok]   proof: "${report.sampleProof.redactedPreview}" (0 leaks, restored=ok)`)
  }
  return `${lines.join("\n")}\n`
}
