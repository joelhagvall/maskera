import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { NerRecognizer } from "maskera"
import { afterEach, describe, expect, it } from "vitest"
import {
  ApprovalBroker,
  buildCustomTermsDetector,
  createFileGuard,
  createMaskeraEngine,
  createMaskeraMcpServer,
  createModelProgressLogger,
  detectInstalledClients,
  MASKERA_SKILL_MARKDOWN,
  MASKERA_SKILL_URI,
  MASKERA_STATUS_URI,
  runDoctor,
  runInstall,
  runService,
  runWrap,
  SERVER_VERSION,
  SessionVault,
  startMaskeraProxy,
  writeDoctorReceipt,
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
      serverInfo: { name: "maskera-mcp", version: SERVER_VERSION },
    })
    const pkgJson = JSON.parse(await readFile(join(pkgRoot, "package.json"), "utf8")) as {
      version: string
    }
    expect(SERVER_VERSION).toBe(pkgJson.version)

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
          outputSchema?: Record<string, unknown>
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
      "maskera_list_files",
      "maskera_search_files",
      "maskera_list_sessions",
      "maskera_clear_session",
      "maskera_status",
    ])
    for (const tool of tools) {
      expect(tool.annotations?.openWorldHint).toBe(false)
      expect(tool.outputSchema?.type).toBe("object")
    }
    expect(tools.find((t) => t.name === "maskera_read_file")?.annotations?.readOnlyHint).toBe(true)
    expect(tools.find((t) => t.name === "maskera_list_files")?.annotations?.readOnlyHint).toBe(true)
    expect(tools.find((t) => t.name === "maskera_search_files")?.annotations?.readOnlyHint).toBe(
      true,
    )
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
      method: "unknown/method",
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

  it("writes without session_id only when exactly one restoration is possible", async () => {
    const root = await makeTempDir()
    const engine = createMaskeraEngine({
      defaultMode: "auto",
      recognizer: stubRecognizer([
        { value: "Anna Lindqvist", label: "NAMN" },
        { value: "Erik Berg", label: "NAMN" },
      ]),
    })
    const server = createMaskeraMcpServer({ engine, allowedRoots: [root] })
    const call = (id: number, name: string, args: Record<string, unknown>) =>
      server.handleMessage({
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name, arguments: args },
      })
    const payload = (res: unknown) =>
      (res as { result: { structuredContent: Record<string, unknown>; isError?: boolean } }).result

    const noSession = payload(
      await call(1, "maskera_write_file", { path: join(root, "a.txt"), text: "Hej [NAMN_1]" }),
    )
    expect(noSession.isError).toBe(true)
    expect(JSON.stringify(noSession)).toContain("maskera_read_file")

    await writeFile(join(root, "anna.txt"), "Utlägg för Anna Lindqvist, tel 070-174 06 58.", "utf8")
    const read = payload(await call(2, "maskera_read_file", { path: join(root, "anna.txt") }))
    expect(read.structuredContent.redacted).toContain("[NAMN_1]")

    const written = payload(
      await call(3, "maskera_write_file", {
        path: join(root, "verifikation.txt"),
        text: "Verifikation för [NAMN_1], ring [TELEFON_1].",
      }),
    )
    expect(written.isError).toBeFalsy()
    expect(written.structuredContent.session_id).toBe(read.structuredContent.session_id)
    expect(JSON.stringify(written)).not.toContain("Anna Lindqvist")
    expect(await readFile(join(root, "verifikation.txt"), "utf8")).toBe(
      "Verifikation för Anna Lindqvist, ring 070-174 06 58.",
    )

    const unknown = payload(
      await call(4, "maskera_write_file", { path: join(root, "b.txt"), text: "Hej [NAMN_9]" }),
    )
    expect(unknown.isError).toBe(true)
    expect(JSON.stringify(unknown)).toContain("[NAMN_9]")

    await writeFile(join(root, "erik.txt"), "Utlägg för Erik Berg.", "utf8")
    await call(5, "maskera_read_file", { path: join(root, "erik.txt") })
    const ambiguous = payload(
      await call(6, "maskera_write_file", { path: join(root, "c.txt"), text: "Hej [NAMN_1]" }),
    )
    expect(ambiguous.isError).toBe(true)
    expect(JSON.stringify(ambiguous)).not.toContain("Anna Lindqvist")
    expect(JSON.stringify(ambiguous)).not.toContain("Erik Berg")
    await expect(readFile(join(root, "c.txt"), "utf8")).rejects.toThrow()

    const onlyAnnaKnowsPhone = payload(
      await call(7, "maskera_write_file", {
        path: join(root, "d.txt"),
        text: "[NAMN_1] på [TELEFON_1]",
      }),
    )
    expect(onlyAnnaKnowsPhone.isError).toBeFalsy()
    expect(await readFile(join(root, "d.txt"), "utf8")).toBe("Anna Lindqvist på 070-174 06 58")
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

  it("lists and searches local files with redacted matches and supports placeholder search", async () => {
    const root = await makeTempDir()
    const outside = await makeTempDir()
    await writeFile(
      join(root, "case.txt"),
      "Faktura för 19900101-2385\nRing 070-174 06 58 om faktura.\n",
      "utf8",
    )
    await writeFile(join(root, "bin.dat"), Buffer.from([0x00, 0x01, 0x02]))
    await writeFile(join(outside, "secret.txt"), "faktura 19900101-2385", "utf8")
    await symlink(join(outside, "secret.txt"), join(root, "escape.txt"))

    const server = createMaskeraMcpServer({
      engine: createMaskeraEngine({ defaultMode: "rules" }),
      allowedRoots: [root],
    })

    const listed = await server.handleMessage({
      jsonrpc: "2.0",
      id: 50,
      method: "tools/call",
      params: { name: "maskera_list_files", arguments: {} },
    })
    const listData = (listed?.result as { structuredContent: { files: Array<{ path: string }> } })
      .structuredContent
    expect(listData.files.map((f) => f.path)).toEqual(["bin.dat", "case.txt"])

    const searched = await server.handleMessage({
      jsonrpc: "2.0",
      id: 51,
      method: "tools/call",
      params: {
        name: "maskera_search_files",
        arguments: { query: "faktura", session_id: "search-1" },
      },
    })
    const serialized = JSON.stringify(searched)
    expect(serialized).not.toContain("19900101-2385")
    expect(serialized).not.toContain("070-174 06 58")
    const searchData = (
      searched?.result as {
        structuredContent: {
          matches: Array<{ path: string; line: number; redacted_line: string }>
        }
      }
    ).structuredContent
    expect(searchData.matches).toEqual([
      { path: "case.txt", line: 1, redacted_line: "Faktura för [PERSONNUMMER_1]" },
      { path: "case.txt", line: 2, redacted_line: "Ring [TELEFON_1] om faktura." },
    ])

    // Searching by known session placeholder resolves locally without leaking raw value.
    const byPlaceholder = await server.handleMessage({
      jsonrpc: "2.0",
      id: 52,
      method: "tools/call",
      params: {
        name: "maskera_search_files",
        arguments: { query: "[TELEFON_1]", session_id: "search-1" },
      },
    })
    const phData = (
      byPlaceholder?.result as {
        structuredContent: { matches: Array<{ line: number; redacted_line: string }> }
      }
    ).structuredContent
    expect(phData.matches).toHaveLength(1)
    expect(phData.matches[0]?.line).toBe(2)
    expect(JSON.stringify(byPlaceholder)).not.toContain("070-174 06 58")
  })

  it("enforces --no-raw-restore and --read-only policies and exposes prompts/resources synced with SKILL.md", async () => {
    const root = await makeTempDir()
    const server = createMaskeraMcpServer({
      engine: createMaskeraEngine({ defaultMode: "rules" }),
      allowedRoots: [root],
      allowRawRestore: false,
      readOnly: true,
    })

    const list = await server.handleMessage({ jsonrpc: "2.0", id: 60, method: "tools/list" })
    const names = (list?.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name)
    expect(names).not.toContain("maskera_restore")
    expect(names).not.toContain("maskera_write_file")
    expect(names).not.toContain("maskera_clear_session")

    const blockedMap = await server.handleMessage({
      jsonrpc: "2.0",
      id: 61,
      method: "tools/call",
      params: {
        name: "maskera_redact",
        arguments: { text: "Ring 070-174 06 58", include_map: true },
      },
    })
    expect((blockedMap?.result as { isError?: boolean }).isError).toBe(true)

    const blockedWrite = await server.handleMessage({
      jsonrpc: "2.0",
      id: 62,
      method: "tools/call",
      params: {
        name: "maskera_write_file",
        arguments: { path: "x.txt", text: "hi", session_id: "s1" },
      },
    })
    expect((blockedWrite?.result as { isError?: boolean }).isError).toBe(true)

    const promptsList = await server.handleMessage({
      jsonrpc: "2.0",
      id: 63,
      method: "prompts/list",
    })
    expect(
      (promptsList?.result as { prompts: Array<{ name: string }> }).prompts.map((p) => p.name),
    ).toEqual(["maskera-workflow", "maskera-redact-file"])

    const promptGet = await server.handleMessage({
      jsonrpc: "2.0",
      id: 64,
      method: "prompts/get",
      params: { name: "maskera-workflow", arguments: { profile: "clinical" } },
    })
    const promptText = (promptGet?.result as { messages: Array<{ content: { text: string } }> })
      .messages[0]?.content.text
    expect(promptText).toContain('Active profile: "clinical"')

    const resourcesList = await server.handleMessage({
      jsonrpc: "2.0",
      id: 65,
      method: "resources/list",
    })
    expect(
      (resourcesList?.result as { resources: Array<{ uri: string }> }).resources.map((r) => r.uri),
    ).toEqual([MASKERA_SKILL_URI, MASKERA_STATUS_URI])

    const skillRes = await server.handleMessage({
      jsonrpc: "2.0",
      id: 66,
      method: "resources/read",
      params: { uri: MASKERA_SKILL_URI },
    })
    const skillText = (skillRes?.result as { contents: Array<{ text: string }> }).contents[0]?.text
    expect(skillText).toBe(MASKERA_SKILL_MARKDOWN)
    // Keep the bundled MCP skill verbatim in sync with repo skills/maskera/SKILL.md
    const repoSkillPath = resolve(pkgRoot, "../../skills/maskera/SKILL.md")
    if (existsSync(repoSkillPath)) {
      expect(await readFile(repoSkillPath, "utf8")).toBe(MASKERA_SKILL_MARKDOWN)
    }
  })

  it("gates raw PII export under browser and native approval modes", async () => {
    const approvals = new ApprovalBroker()
    const browserServer = createMaskeraMcpServer({
      engine: createMaskeraEngine({ defaultMode: "rules" }),
      approvalMode: "browser",
      approvals,
      approvalBaseUrl: "http://127.0.0.1:8787",
    })

    const toolsRes = await browserServer.handleMessage({
      jsonrpc: "2.0",
      id: 70,
      method: "tools/list",
    })
    expect(
      (toolsRes?.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name),
    ).toContain("maskera_resume")

    await browserServer.handleMessage({
      jsonrpc: "2.0",
      id: 71,
      method: "tools/call",
      params: {
        name: "maskera_redact",
        arguments: { text: "Ring 070-174 06 58", session_id: "apr-s1" },
      },
    })

    const paused = await browserServer.handleMessage({
      jsonrpc: "2.0",
      id: 72,
      method: "tools/call",
      params: {
        name: "maskera_restore",
        arguments: { text: "Hej [TELEFON_1]", session_id: "apr-s1" },
      },
    })
    expect(JSON.stringify(paused)).not.toContain("070-174 06 58")
    const pausedData = (
      paused?.result as {
        structuredContent: { status: string; request_id: string; approval_url: string }
      }
    ).structuredContent
    expect(pausedData.status).toBe("approval_required")
    expect(pausedData.approval_url).toContain("http://127.0.0.1:8787/_maskera#approval-")

    // Approve via broker and resume
    approvals.decide(pausedData.request_id, "approve")
    const resumed = await browserServer.handleMessage({
      jsonrpc: "2.0",
      id: 73,
      method: "tools/call",
      params: { name: "maskera_resume", arguments: { request_id: pausedData.request_id } },
    })
    expect(
      (resumed?.result as { structuredContent: { status: string; restored: string } })
        .structuredContent,
    ).toMatchObject({ status: "completed", restored: "Hej 070-174 06 58" })

    // Native elicitation mode: fails closed if client doesn't advertise elicitation, succeeds when accepted
    let elicitCalls = 0
    const nativeServer = createMaskeraMcpServer({
      engine: createMaskeraEngine({ defaultMode: "rules" }),
      approvalMode: "native",
      requestElicitation: async () => {
        elicitCalls += 1
        return { action: "accept", content: { confirm: true } }
      },
    })
    await nativeServer.handleMessage({
      jsonrpc: "2.0",
      id: 74,
      method: "tools/call",
      params: {
        name: "maskera_redact",
        arguments: { text: "Ring 070-174 06 58", session_id: "nat-1" },
      },
    })
    const deniedNoCap = await nativeServer.handleMessage({
      jsonrpc: "2.0",
      id: 75,
      method: "tools/call",
      params: {
        name: "maskera_restore",
        arguments: { text: "Hej [TELEFON_1]", session_id: "nat-1" },
      },
    })
    expect((deniedNoCap?.result as { isError?: boolean }).isError).toBe(true)

    await nativeServer.handleMessage({
      jsonrpc: "2.0",
      id: 76,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: { elicitation: {} } },
    })
    const allowedCap = await nativeServer.handleMessage({
      jsonrpc: "2.0",
      id: 77,
      method: "tools/call",
      params: {
        name: "maskera_restore",
        arguments: { text: "Hej [TELEFON_1]", session_id: "nat-1" },
      },
    })
    expect(elicitCalls).toBe(1)
    expect(
      (allowedCap?.result as { structuredContent: { restored: string } }).structuredContent
        .restored,
    ).toBe("Hej 070-174 06 58")
  })

  it("serves Streamable HTTP /mcp on startMaskeraProxy with shared vault, scoped URLs, and browser approvals", async () => {
    const root = await makeTempDir()
    await writeFile(join(root, "doc.txt"), "Kontakt 070-174 06 58", "utf8")
    const running = await startMaskeraProxy({
      port: 0,
      defaultMode: "rules",
      mcpRoots: [root],
    })
    try {
      const getRes = await fetch(running.mcpUrl)
      expect(getRes.status).toBe(405)

      const crossOrigin = await fetch(running.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://evil.test" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      })
      expect(crossOrigin.status).toBe(403)

      // Initialize scoped HTTP MCP session with browser approval mode
      const initRes = await fetch(`${running.mcpUrl}?approval_mode=browser`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-11-25" },
        }),
      })
      expect(initRes.status).toBe(200)
      const sessionId = initRes.headers.get("mcp-session-id")
      expect(sessionId).toBeTruthy()

      // Notification returns 202 Accepted
      const notifRes = await fetch(running.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "mcp-session-id": sessionId ?? "" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      })
      expect(notifRes.status).toBe(202)

      // Read file over HTTP MCP, then request restore (pauses for browser approval)
      const readRes = await fetch(running.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "mcp-session-id": sessionId ?? "" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "maskera_read_file",
            arguments: { path: "doc.txt", session_id: "http1" },
          },
        }),
      })
      const readBody = (await readRes.json()) as {
        result: { structuredContent: { redacted: string } }
      }
      expect(readBody.result.structuredContent.redacted).toBe("Kontakt [TELEFON_1]")

      const restorePaused = await fetch(running.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "mcp-session-id": sessionId ?? "" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "maskera_restore",
            arguments: { text: "Ring [TELEFON_1]", session_id: "http1" },
          },
        }),
      })
      const pausedJson = (await restorePaused.json()) as {
        result: { structuredContent: { status: string; request_id: string } }
      }
      expect(pausedJson.result.structuredContent.status).toBe("approval_required")

      // Approve through inspector HTTP endpoint (requires x-maskera-action: decide)
      const reqId = pausedJson.result.structuredContent.request_id
      const badApprove = await fetch(`${running.url}/_maskera/approvals/${reqId}/approve`, {
        method: "POST",
      })
      expect(badApprove.status).toBe(403)

      const goodApprove = await fetch(`${running.url}/_maskera/approvals/${reqId}/approve`, {
        method: "POST",
        headers: { "x-maskera-action": "decide" },
      })
      expect(goodApprove.status).toBe(200)

      const resumedRes = await fetch(running.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "mcp-session-id": sessionId ?? "" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "maskera_resume", arguments: { request_id: reqId } },
        }),
      })
      const resumedJson = (await resumedRes.json()) as {
        result: { structuredContent: { restored: string } }
      }
      expect(resumedJson.result.structuredContent.restored).toBe("Ring 070-174 06 58")

      // DELETE /mcp closes session; subsequent reuse returns 404
      const delRes = await fetch(running.mcpUrl, {
        method: "DELETE",
        headers: { "mcp-session-id": sessionId ?? "" },
      })
      expect(delRes.status).toBe(204)
      const afterDel = await fetch(running.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "mcp-session-id": sessionId ?? "" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "ping" }),
      })
      expect(afterDel.status).toBe(404)
    } finally {
      await running.close()
    }
  })

  it("runInstall merges client configs safely and runDoctor verifies Swedish redaction roundtrip", async () => {
    const dir = await makeTempDir()
    const cursorCfg = join(dir, ".cursor", "mcp.json")
    const res1 = await runInstall({
      client: "cursor",
      roots: [dir],
      noRawRestore: true,
      configPath: cursorCfg,
    })
    expect(res1.written).toBe(true)
    const parsedCursor = JSON.parse(await readFile(cursorCfg, "utf8")) as {
      mcpServers: { maskera: { command: string; args: string[] } }
    }
    expect(parsedCursor.mcpServers.maskera.command).toBe("npx")
    expect(parsedCursor.mcpServers.maskera.args).toContain("--no-raw-restore")

    const claudeHttp = await runInstall({
      client: "claude-code",
      transport: "http",
      noRawRestore: true,
      approvalMode: "browser",
    })
    expect(claudeHttp.written).toBe(false)
    expect(claudeHttp.command).toContain("claude mcp add --transport http maskera")
    expect(claudeHttp.command).toContain("no_raw_restore=1")
    expect(claudeHttp.command).toContain("approval_mode=browser")

    const report = await runDoctor({
      engine: createMaskeraEngine({ defaultMode: "rules" }),
      roots: [dir],
      proxyUrl: "http://127.0.0.1:1",
      client: "cursor",
      transport: "stdio",
      configPath: cursorCfg,
    })
    expect(report.schema).toBe("maskera-setup-receipt/v1")
    expect(report.ok).toBe(true)
    expect(report.client).toBe("cursor")
    expect(report.checks.find((c) => c.name === "redaction")?.status).toBe("ok")
    expect(report.sampleProof).toBeTruthy()
    expect(report.sampleProof?.rawPiiLeaked).toBe(false)
    expect(report.sampleProof?.roundtripRestored).toBe(true)
    expect(report.sampleProof?.maskedCount).toBeGreaterThanOrEqual(3)
    expect(report.sampleProof?.redactedPreview).toContain("[PERSONNUMMER_1]")
    expect(report.sampleProof?.redactedPreview).toContain("[EPOST_1]")
    expect(report.sampleProof?.redactedPreview).not.toContain("19900101-2385")

    const receiptPath = join(dir, "receipts", "setup-receipt.json")
    const writtenPath = await writeDoctorReceipt(receiptPath, report)
    const savedRaw = await readFile(writtenPath, "utf8")
    expect(savedRaw).not.toContain("19900101-2385")
    expect(savedRaw).not.toContain("provnamn.maskera@example.com")
    expect(JSON.parse(savedRaw).schema).toBe("maskera-setup-receipt/v1")

    const liveProxy = await startMaskeraProxy({
      port: 0,
      defaultMode: "rules",
      mcpRoots: [dir],
    })
    try {
      const liveReport = await runDoctor({
        engine: createMaskeraEngine({ defaultMode: "rules" }),
        roots: [dir],
        proxyUrl: liveProxy.url,
      })
      expect(liveReport.ok).toBe(true)
      expect(liveReport.checks.find((c) => c.name === "proxy")?.status).toBe("ok")
      expect(liveReport.checks.find((c) => c.name === "mcp-http")?.status).toBe("ok")
    } finally {
      await liveProxy.close()
    }
  })

  it("auto-detects clients, applies CLI installs, installs guard hooks idempotently, and manages launchd/systemd services", async () => {
    const dir = await makeTempDir()
    const fakeHome = await makeTempDir()
    await mkdir(join(dir, ".cursor"), { recursive: true })
    await mkdir(join(dir, ".claude"), { recursive: true })

    const detected = await detectInstalledClients({
      cwd: dir,
      homeDir: fakeHome,
      platform: "darwin",
      pathEnv: "",
    })
    expect(detected).toEqual(["claude-code", "cursor"])

    // Claude Code --project + --with-hook writes .mcp.json and .claude/settings.json idempotently
    const ccProject = await runInstall({
      client: "claude-code",
      cwd: dir,
      roots: [dir],
      noRawRestore: true,
      project: true,
      withHook: true,
    })
    expect(ccProject.written).toBe(true)
    expect(ccProject.configPath).toBe(join(dir, ".mcp.json"))
    expect(ccProject.hookWritten).toBe(true)
    expect(ccProject.hookPath).toBe(join(dir, ".claude", "settings.json"))

    // Second run must not duplicate the hook entry
    await runInstall({
      client: "claude-code",
      cwd: dir,
      roots: [dir],
      project: true,
      withHook: true,
    })
    const settingsJson = JSON.parse(
      await readFile(join(dir, ".claude", "settings.json"), "utf8"),
    ) as { hooks: { UserPromptSubmit: unknown[] } }
    expect(settingsJson.hooks.UserPromptSubmit).toHaveLength(1)

    // Claude Code --apply runs `claude mcp add` via injectable runner
    const ranCommands: Array<{ cmd: string; args: readonly string[] }> = []
    const ccApplied = await runInstall({
      client: "claude-code",
      cwd: dir,
      roots: [dir],
      transport: "http",
      noRawRestore: true,
      apply: true,
      execCommand: (cmd, args) => {
        ranCommands.push({ cmd, args })
        return { status: 0, stdout: "Added maskera", stderr: "" }
      },
    })
    expect(ccApplied.applied).toBe(true)
    expect(ranCommands[0]?.cmd).toBe("claude")
    expect(ranCommands[0]?.args).toContain("--transport")

    // Cursor --with-hook writes .cursor/hooks.json
    const cursorHook = await runInstall({
      client: "cursor",
      cwd: dir,
      roots: [dir],
      withHook: true,
    })
    expect(cursorHook.hookWritten).toBe(true)
    const cursorHooks = JSON.parse(await readFile(join(dir, ".cursor", "hooks.json"), "utf8")) as {
      version: number
      hooks: { beforeSubmitPrompt: Array<{ command: string }> }
    }
    expect(cursorHooks.version).toBe(1)
    expect(cursorHooks.hooks.beforeSubmitPrompt[0]?.command).toContain("@maskera/mcp guard")

    // Service dry-run on macOS and Linux
    const macDry = await runService({
      action: "install",
      platform: "darwin",
      homeDir: fakeHome,
      roots: [dir],
      noRawRestore: true,
      nodePath: "/usr/local/bin/node",
      cliPath: "/opt/maskera/cli.js",
      dryRun: true,
    })
    expect(macDry.manager).toBe("launchd")
    expect(macDry.snippet).toContain("dev.maskera.proxy")
    expect(macDry.snippet).toContain("--no-raw-restore")

    const linuxDry = await runService({
      action: "install",
      platform: "linux",
      homeDir: fakeHome,
      roots: [dir],
      rulesOnly: true,
      nodePath: "/usr/bin/node",
      cliPath: "/opt/maskera/cli.js",
      dryRun: true,
    })
    expect(linuxDry.manager).toBe("systemd")
    expect(linuxDry.snippet).toContain("ExecStart=")
    expect(linuxDry.snippet).toContain("--rules-only")

    // Service install + uninstall with mocked launchctl (touches only fakeHome)
    const svcCalls: string[] = []
    const macInst = await runService({
      action: "install",
      platform: "darwin",
      homeDir: fakeHome,
      port: 1,
      roots: [dir],
      nodePath: "/usr/local/bin/node",
      cliPath: "/opt/maskera/cli.js",
      execCommand: (cmd, args) => {
        svcCalls.push(`${cmd} ${args[0]}`)
        return { status: 0, stdout: "", stderr: "" }
      },
    })
    expect(macInst.installed).toBe(true)
    expect(macInst.serviceFile).toBeTruthy()
    expect(existsSync(macInst.serviceFile ?? "")).toBe(true)
    expect(svcCalls).toContain("launchctl bootstrap")

    const macUninst = await runService({
      action: "uninstall",
      platform: "darwin",
      homeDir: fakeHome,
      port: 1,
      execCommand: (cmd, args) => {
        svcCalls.push(`${cmd} ${args[0]}`)
        return { status: 0, stdout: "", stderr: "" }
      },
    })
    expect(macUninst.installed).toBe(false)
    expect(existsSync(macInst.serviceFile ?? "")).toBe(false)
  })

  it("runWrap injects proxy env vars, verifies startup, preserves exit code, and writes zero-PII receipt", async () => {
    const dir = await makeTempDir()
    const receiptPath = join(dir, "wrap-receipt.json")
    const logs: string[] = []
    const res = await runWrap({
      command: process.execPath,
      args: [
        "-e",
        "if (!process.env.ANTHROPIC_BASE_URL || !process.env.OPENAI_BASE_URL?.endsWith('/v1') || !process.env.MASKERA_MCP_URL?.endsWith('/mcp')) process.exit(42);",
      ],
      engine: createMaskeraEngine({ defaultMode: "rules" }),
      roots: [dir],
      receiptPath,
      onStderr: (line) => logs.push(line),
    })
    expect(res.exitCode).toBe(0)
    expect(res.startupReceipt?.ok).toBe(true)
    expect(res.session.requests).toBe(0)
    expect(logs.some((l) => l.includes("0 leaks verified"))).toBe(true)
    expect(logs.some((l) => l.includes("session done:"))).toBe(true)
    const receiptRaw = await readFile(receiptPath, "utf8")
    expect(receiptRaw).not.toContain("19900101-2385")
    expect(JSON.parse(receiptRaw).schema).toBe("maskera-wrap-receipt/v1")
  })

  it("createModelProgressLogger stays silent for fast loads and reports slow first-run loads", async () => {
    const fastLines: string[] = []
    const fastLogger = createModelProgressLogger((l) => fastLines.push(l), 200)
    fastLogger({ phase: "loading", model: "maskera-sv-ner" })
    fastLogger({ phase: "ready", model: "maskera-sv-ner", elapsedMs: 12 })
    expect(fastLines).toHaveLength(0)

    const slowLines: string[] = []
    const slowLogger = createModelProgressLogger((l) => slowLines.push(l), 15)
    slowLogger({ phase: "loading", model: "maskera-sv-ner" })
    await new Promise((r) => setTimeout(r, 40))
    slowLogger({ phase: "ready", model: "maskera-sv-ner", elapsedMs: 42 })
    expect(slowLines.length).toBe(2)
    expect(slowLines[0]).toContain("Loading Swedish ONNX model")
    expect(slowLines[1]).toContain("ready (42ms)")
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

describe("Security audit regression guards", () => {
  it("blocks mode='rules' downgrade on file tools, prevents search exfil under --no-raw-restore, and redacts before truncating", async () => {
    const root = await makeTempDir()
    const longLine = `${"a".repeat(495)}19900101-2385`
    await writeFile(
      join(root, "case.txt"),
      `Patient Anna Lindqvist (19900101-2385).\n${longLine}\n`,
      "utf8",
    )
    const engine = createMaskeraEngine({
      defaultMode: "auto",
      recognizer: stubRecognizer([{ value: "Anna Lindqvist", label: "NAMN" }]),
    })
    const server = createMaskeraMcpServer({
      engine,
      allowedRoots: [root],
      allowRawRestore: false,
    })

    const readOk = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "maskera_read_file", arguments: { path: "case.txt", session_id: "s1" } },
    })
    expect(JSON.stringify(readOk)).not.toContain("Anna Lindqvist")

    const downgradedRead = await server.handleMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "maskera_read_file",
        arguments: { path: "case.txt", session_id: "s1", mode: "rules" },
      },
    })
    expect((downgradedRead?.result as { isError?: boolean } | undefined)?.isError).toBe(true)
    expect(JSON.stringify(downgradedRead)).not.toContain("Anna Lindqvist")

    const downgradedSearch = await server.handleMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "maskera_search_files",
        arguments: { query: "[NAMN_1]", session_id: "s1", mode: "rules" },
      },
    })
    expect((downgradedSearch?.result as { isError?: boolean } | undefined)?.isError).toBe(true)
    expect(JSON.stringify(downgradedSearch)).not.toContain("Anna Lindqvist")

    const truncSearch = await server.handleMessage({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "maskera_search_files", arguments: { query: "aaaaa", session_id: "s1" } },
    })
    expect(JSON.stringify(truncSearch)).not.toContain("19900")
  })

  it("canonicalizes NFD custom terms and zero-width obfuscated names for lossless roundtrip", async () => {
    const engine = createMaskeraEngine({
      defaultMode: "auto",
      recognizer: stubRecognizer([{ value: "Anna Lindqvist", label: "NAMN" }]),
    })
    const nfdTerm = "Åsa Öberg".normalize("NFD")
    const nfcRes = await engine.redact("Kontakta Åsa Öberg idag.".normalize("NFC"), {
      mode: "rules",
      customTerms: [nfdTerm],
    })
    expect(nfcRes.result.text).not.toContain("Åsa")

    const zwText = "Patient A\u200bnna Lind\u00adqvist ringde."
    const zwRes = await engine.redact(zwText, { mode: "auto" })
    expect(zwRes.result.text).toBe("Patient [NAMN_1] ringde.")
    expect(zwRes.result.restore(zwRes.result.text)).toBe(zwText)
  })
})
