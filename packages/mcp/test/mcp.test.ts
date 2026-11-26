import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { NerRecognizer } from "maskera"
import { afterEach, describe, expect, it } from "vitest"
import {
  buildCustomTermsDetector,
  createFileGuard,
  createMaskeraEngine,
  createMaskeraMcpServer,
  SessionVault,
} from "../src/index"

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const cliDistPath = join(pkgRoot, "dist", "cli.js")

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "maskera-mcp-test-"))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) await rm(dir, { recursive: true, force: true })
  }
})

function stubRecognizer(entities: Array<{ value: string; label: string }>): NerRecognizer {
  return {
    ready: Promise.resolve(),
    async detect(text: string) {
      const out = []
      for (const entity of entities) {
        let from = 0
        for (;;) {
          const idx = text.indexOf(entity.value, from)
          if (idx < 0) break
          out.push({
            start: idx,
            end: idx + entity.value.length,
            value: entity.value,
            label: entity.label,
          })
          from = idx + entity.value.length
        }
      }
      return out
    },
  }
}

describe("buildCustomTermsDetector", () => {
  it("matches case-insensitively on whole-word boundaries, longest first", () => {
    const detector = buildCustomTermsDetector(["Orion", "Projekt Orion", "  ", "x"])
    expect(detector).not.toBeNull()
    const text = "Vi kör projekt orion och Oriongruppen men också Orion separat."
    const hits = detector?.detect(text) ?? []
    expect(hits.map((h) => h.value)).toEqual(["projekt orion", "Orion"])
  })

  it("returns null when no valid terms remain", () => {
    expect(buildCustomTermsDetector(["", "a"])).toBeNull()
  })
})

describe("SessionVault", () => {
  it("keeps placeholder numbering consistent across calls and avoids collisions", async () => {
    const engine = createMaskeraEngine({ defaultMode: "rules" })
    const vault = new SessionVault(2)

    const first = await engine.redact("Ring 070-174 06 58, personnummer 19900101-2385.")
    const applied1 = vault.apply(
      "Ring 070-174 06 58, personnummer 19900101-2385.",
      first.result,
      "case-1",
    )
    expect(applied1.redacted).toBe("Ring [TELEFON_1], personnummer [PERSONNUMMER_1].")

    // Second call with same phone and a literal [TELEFON_2] collision in text.
    const text2 = "Samma nr 070-174 06 58, nytt 070-174 06 59 och bokstavlig [TELEFON_2]."
    const second = await engine.redact(text2)
    const applied2 = vault.apply(text2, second.result, "case-1")
    expect(applied2.redacted).toBe(
      "Samma nr [TELEFON_1], nytt [TELEFON_3] och bokstavlig [TELEFON_2].",
    )

    const restored = vault.restore("Svar till [TELEFON_1] och [TELEFON_3].", {
      sessionId: "case-1",
    })
    expect(restored.restored).toBe("Svar till 070-174 06 58 och 070-174 06 59.")

    // list() exposes counts only, never raw PII values.
    const listed = JSON.stringify(vault.list())
    expect(listed).not.toContain("070-174 06 58")
    expect(listed).not.toContain("19900101-2385")

    // LRU eviction when exceeding maxSessions (2).
    const r2 = await engine.redact("anna@example.com")
    vault.apply("anna@example.com", r2.result, "case-2")
    vault.apply("anna@example.com", r2.result, "case-3")
    expect(vault.size).toBe(2)
    expect(vault.clear("case-1")).toBe(false)
    expect(vault.clear("case-2")).toBe(true)
  })
})

describe("FileGuard", () => {
  it("confines reads and writes to allowed roots and blocks symlinks, binary, and overwrites", async () => {
    const root = await makeTempDir()
    const outside = await makeTempDir()
    const guard = createFileGuard([root])

    const okPath = join(root, "note.txt")
    await writeFile(okPath, "Hej Anna", "utf8")
    const read = await guard.readText(okPath)
    expect(read.content).toBe("Hej Anna")

    // Path traversal blocked (both non-existent and existing outside files)
    const outsideFile = join(outside, "secret.txt")
    await writeFile(outsideFile, "Hemligt", "utf8")
    await expect(guard.readText(join(root, "..", "secret.txt"))).rejects.toThrow(
      /outside allowed workspace roots/i,
    )
    await expect(guard.readText(outsideFile)).rejects.toThrow(/outside allowed workspace roots/i)

    // Symlink escape blocked
    const escapeLink = join(root, "escape.txt")
    await symlink(outsideFile, escapeLink)
    await expect(guard.readText(escapeLink)).rejects.toThrow(/outside allowed workspace roots/i)

    // Binary file blocked
    const binFile = join(root, "bin.dat")
    await writeFile(binFile, Buffer.from([0x00, 0x01, 0x02]))
    await expect(guard.readText(binFile)).rejects.toThrow(/binary/i)

    // Overwrite guard
    const outFile = join(root, "reply.txt")
    await guard.writeText(outFile, "v1")
    await expect(guard.writeText(outFile, "v2")).rejects.toThrow(/already exists/i)
    await guard.writeText(outFile, "v2", { overwrite: true })
    expect(await readFile(outFile, "utf8")).toBe("v2")
  })
})

describe("MaskeraMcpServer JSON-RPC protocol and tools", () => {
  it("handles initialize, ping, tools/list, notifications, and error codes", async () => {
    const server = createMaskeraMcpServer({
      engine: createMaskeraEngine({ defaultMode: "rules" }),
    })

    const init = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05" },
    })
    expect(init?.result).toMatchObject({
      protocolVersion: "2024-11-05",
      serverInfo: { name: "maskera-mcp" },
    })

    const initModern = await server.handleMessage({
      jsonrpc: "2.0",
      id: 101,
      method: "initialize",
      params: { protocolVersion: "2025-11-25" },
    })
    expect(initModern?.result).toMatchObject({
      protocolVersion: "2025-11-25",
    })

    // Notifications produce no response
    expect(
      await server.handleMessage({
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    ).toBeNull()

    expect(await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "ping" })).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: {},
    })

    const list = await server.handleMessage({ jsonrpc: "2.0", id: 3, method: "tools/list" })
    const tools = (
      list?.result as {
        tools: Array<{
          name: string
          annotations?: {
            readOnlyHint: boolean
            destructiveHint: boolean
            openWorldHint: boolean
          }
        }>
      }
    ).tools
    const toolNames = tools.map((t) => t.name)
    expect(toolNames).toEqual([
      "maskera_redact",
      "maskera_restore",
      "maskera_read_file",
      "maskera_write_file",
      "maskera_list_sessions",
      "maskera_clear_session",
      "maskera_status",
    ])
    for (const tool of tools) {
      expect(tool.annotations?.openWorldHint).toBe(false)
    }
    expect(tools.find((t) => t.name === "maskera_read_file")?.annotations?.readOnlyHint).toBe(true)
    expect(tools.find((t) => t.name === "maskera_write_file")?.annotations?.readOnlyHint).toBe(
      false,
    )
    expect(
      tools.find((t) => t.name === "maskera_clear_session")?.annotations?.destructiveHint,
    ).toBe(true)

    const invalidReq = await server.handleMessage("not-an-object")
    expect(invalidReq?.error?.code).toBe(-32600)

    const unknownMethod = await server.handleMessage({
      jsonrpc: "2.0",
      id: 4,
      method: "resources/read",
    })
    expect(unknownMethod?.error?.code).toBe(-32601)

    const missingToolName = await server.handleMessage({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {},
    })
    expect(missingToolName?.error?.code).toBe(-32602)
  })

  it("redacts files locally, keeps raw PII out of tool responses, and restores directly to disk", async () => {
    const root = await makeTempDir()
    const inputPath = join(root, "klient.txt")
    const outputPath = join(root, "svar.txt")
    await writeFile(
      inputPath,
      "Anna Lindqvist (19900101-2385) bor på Maskeragatan 12, 123 45 Göteborg, tel 070-174 06 58, epost anna@example.com, projekt Projekt Orion.",
      "utf8",
    )

    const engine = createMaskeraEngine({
      defaultMode: "auto",
      recognizer: stubRecognizer([
        { value: "Anna Lindqvist", label: "NAMN" },
        { value: "Göteborg", label: "PLATS" },
      ]),
    })
    const server = createMaskeraMcpServer({ engine, allowedRoots: [root] })

    const readRes = await server.handleMessage({
      jsonrpc: "2.0",
      id: 10,
      method: "tools/call",
      params: {
        name: "maskera_read_file",
        arguments: {
          path: inputPath,
          session_id: "klient-session",
          custom_terms: ["Projekt Orion"],
        },
      },
    })

    const readPayload = (readRes?.result as { structuredContent: Record<string, unknown> })
      .structuredContent
    const serializedRead = JSON.stringify(readRes)
    expect(readPayload.mode).toBe("hybrid")
    expect(readPayload.session_id).toBe("klient-session")
    expect(readPayload.redacted).toContain("[NAMN_1]")
    expect(readPayload.redacted).toContain("[PERSONNUMMER_1]")
    expect(readPayload.redacted).toContain("[ADRESS_1]")
    expect(readPayload.redacted).toContain("[TELEFON_1]")
    expect(readPayload.redacted).toContain("[EPOST_1]")
    expect(readPayload.redacted).toContain("[EGENT_1]")
    // Verify ZERO raw PII leaks into the MCP response.
    for (const secret of [
      "Anna Lindqvist",
      "19900101-2385",
      "Maskeragatan 12",
      "070-174 06 58",
      "anna@example.com",
      "Projekt Orion",
    ]) {
      expect(serializedRead).not.toContain(secret)
    }

    const writeRes = await server.handleMessage({
      jsonrpc: "2.0",
      id: 11,
      method: "tools/call",
      params: {
        name: "maskera_write_file",
        arguments: {
          path: outputPath,
          session_id: "klient-session",
          text: "Hej [NAMN_1], vi bekräftar [EGENT_1] och ringer [TELEFON_1].",
        },
      },
    })
    expect(JSON.stringify(writeRes)).not.toContain("Anna Lindqvist")
    expect(JSON.stringify(writeRes)).not.toContain("070-174 06 58")

    const onDisk = await readFile(outputPath, "utf8")
    expect(onDisk).toBe("Hej Anna Lindqvist, vi bekräftar Projekt Orion och ringer 070-174 06 58.")

    const statusRes = await server.handleMessage({
      jsonrpc: "2.0",
      id: 12,
      method: "tools/call",
      params: { name: "maskera_status", arguments: {} },
    })
    const status = (statusRes?.result as { structuredContent: Record<string, unknown> })
      .structuredContent
    expect(status.active_sessions).toBe(1)

    const clearRes = await server.handleMessage({
      jsonrpc: "2.0",
      id: 13,
      method: "tools/call",
      params: {
        name: "maskera_clear_session",
        arguments: { session_id: "klient-session" },
      },
    })
    expect(
      (clearRes?.result as { structuredContent: { cleared: boolean } }).structuredContent.cleared,
    ).toBe(true)
  })

  it("fails loudly in auto mode if NER fails rather than silently leaking names", async () => {
    const failingRecognizer: NerRecognizer = {
      get ready() {
        return Promise.reject(new Error("model unavailable"))
      },
      async detect() {
        throw new Error("model unavailable")
      },
    }
    const server = createMaskeraMcpServer({
      engine: createMaskeraEngine({ defaultMode: "auto", recognizer: failingRecognizer }),
    })

    const res = await server.handleMessage({
      jsonrpc: "2.0",
      id: 20,
      method: "tools/call",
      params: {
        name: "maskera_redact",
        arguments: { text: "Hej Anna Lindqvist" },
      },
    })
    const result = res?.result as { isError?: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(true)
    expect(result.content[0]?.text).toContain('mode="rules"')
  })

  it("supports maskera_redact include_map opt-in and maskera_restore explicit map", async () => {
    const server = createMaskeraMcpServer({
      engine: createMaskeraEngine({ defaultMode: "rules" }),
    })

    const redacted = await server.handleMessage({
      jsonrpc: "2.0",
      id: 30,
      method: "tools/call",
      params: {
        name: "maskera_redact",
        arguments: {
          text: "Org.nr 202100-4748, IBAN SE42 8000 0890 1191 4616 8423",
          include_map: true,
        },
      },
    })
    const content = (
      redacted?.result as {
        structuredContent: { redacted: string; map: Record<string, string> }
      }
    ).structuredContent
    expect(content.redacted).toBe("Org.nr [ORGANISATIONSNUMMER_1], IBAN [IBAN_1]")
    expect(content.map).toEqual({
      "[ORGANISATIONSNUMMER_1]": "202100-4748",
      "[IBAN_1]": "SE42 8000 0890 1191 4616 8423",
    })

    const restored = await server.handleMessage({
      jsonrpc: "2.0",
      id: 31,
      method: "tools/call",
      params: {
        name: "maskera_restore",
        arguments: { text: content.redacted, map: content.map },
      },
    })
    expect(
      (restored?.result as { structuredContent: { restored: string } }).structuredContent.restored,
    ).toBe("Org.nr 202100-4748, IBAN SE42 8000 0890 1191 4616 8423")
  })
  it("caches detected spans across repeated calls without re-running NER and handles warmup safely", async () => {
    let detectCalls = 0
    const countingRecognizer: NerRecognizer = {
      ready: Promise.resolve(),
      async detect(text: string) {
        detectCalls += 1
        const idx = text.indexOf("Anna Lindqvist")
        return idx >= 0
          ? [
              {
                start: idx,
                end: idx + "Anna Lindqvist".length,
                value: "Anna Lindqvist",
                label: "NAMN",
              },
            ]
          : []
      },
    }
    const engine = createMaskeraEngine({ defaultMode: "auto", recognizer: countingRecognizer })
    engine.warmup()
    await Promise.resolve()

    const first = await engine.redact("Hej Anna Lindqvist (070-174 06 58)")
    const second = await engine.redact("Hej Anna Lindqvist (070-174 06 58)")
    expect(detectCalls).toBe(1)
    expect(second.result.text).toBe(first.result.text)
    expect(second.result.map).toEqual(first.result.map)
    expect(engine.status().cacheHits).toBe(1)
    expect(engine.status().cacheMisses).toBe(1)

    // Different customTerms must miss cache and re-run
    const third = await engine.redact("Hej Anna Lindqvist (070-174 06 58)", {
      customTerms: ["Hej"],
    })
    expect(detectCalls).toBe(2)
    expect(third.result.text).toContain("[EGENT_1]")

    engine.clearCache()
    expect(engine.status().cacheSize).toBe(0)
    expect(engine.status().cacheHits).toBe(0)

    // Warmup on a failing recognizer must not cause an unhandled rejection
    const failingEngine = createMaskeraEngine({
      defaultMode: "auto",
      recognizer: {
        get ready() {
          return Promise.reject(new Error("offline"))
        },
        async detect() {
          throw new Error("offline")
        },
      },
    })
    failingEngine.warmup()
    await new Promise((r) => setTimeout(r, 10))
    expect(failingEngine.status().nerError).toContain("offline")
  })
})

describe.runIf(existsSync(cliDistPath))("maskera-mcp stdio CLI", () => {
  it("speaks strict newline-delimited JSON-RPC over real stdin/stdout", async () => {
    const root = await makeTempDir()
    const srcFile = join(root, "in.txt")
    const outFile = join(root, "out.txt")
    await writeFile(srcFile, "Ring 070-174 06 58 om 19900101-2385.", "utf8")

    const child = spawn(process.execPath, [cliDistPath, "--rules-only", "--root", root], {
      stdio: ["pipe", "pipe", "pipe"],
    })

    const requests = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: {
          name: "maskera_read_file",
          arguments: { path: srcFile, session_id: "stdio-1" },
        },
      },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "maskera_write_file",
          arguments: {
            path: outFile,
            session_id: "stdio-1",
            text: "Klart: [TELEFON_1] / [PERSONNUMMER_1]",
          },
        },
      },
    ]

    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8")
    })
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8")
    })

    for (const req of requests) {
      child.stdin.write(`${JSON.stringify(req)}\n`)
    }
    child.stdin.end()

    const exitCode = await new Promise<number | null>((resolveExit, reject) => {
      child.on("error", reject)
      child.on("close", resolveExit)
    })

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    const lines = stdout
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l))
    expect(lines.map((l) => l.id)).toEqual([1, 2, 3])
    expect(JSON.stringify(lines)).not.toContain("070-174 06 58")
    expect(JSON.stringify(lines)).not.toContain("19900101-2385")
    expect(await readFile(outFile, "utf8")).toBe("Klart: 070-174 06 58 / 19900101-2385")
  })
})
