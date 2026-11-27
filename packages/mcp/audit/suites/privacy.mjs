/**
 * Privacy & Canary Leakage Audit Suite (`audit:privacy`).
 *
 * Tracks unique synthetic Swedish PII canaries through every surface:
 *   - Outgoing HTTP/SSE traffic at the upstream boundary (all LLM routes)
 *   - MCP stdio & Streamable HTTP requests, responses, errors, notifications
 *   - Tool arguments, tool results, resources, prompts
 *   - Streaming chunks, retries, timeouts, cancellations
 *   - stdout, stderr, JSONL audit logs, setup receipts, inspector status
 */
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { brotliCompressSync, gzipSync } from "node:zlib"
import {
  createMaskeraEngine,
  runDoctor,
  runWrap,
  startMaskeraProxy,
  writeDoctorReceipt,
} from "../../dist/index.js"
import { SYNTHETIC_CANARIES, scanForCanaryLeaks, startEgressAuditor } from "../lib/canary.mjs"
import {
  createSuiteCollector,
  distCliPath,
  getLocalNerEnv,
  getLocalNerOptions,
  hasLocalNerModel,
  runProcess,
} from "../lib/harness.mjs"

export async function runPrivacyAudit() {
  const suite = createSuiteCollector("privacy")
  const dir = await mkdtemp(join(tmpdir(), "maskera-audit-privacy-"))
  let totalLeaks = 0
  let surfacesChecked = 0

  const assertZeroLeaks = (surface, text, canaries = SYNTHETIC_CANARIES) => {
    surfacesChecked += 1
    const leaks = scanForCanaryLeaks(surface, text, canaries)
    totalLeaks += leaks.length
    assert.equal(leaks.length, 0, `Canary leak(s) on ${surface}: ${JSON.stringify(leaks)}`)
  }

  const mode = hasLocalNerModel ? "auto" : "rules"
  const activeCanaries = hasLocalNerModel
    ? SYNTHETIC_CANARIES
    : SYNTHETIC_CANARIES.filter((c) => !c.nerRequired)
  const customTerms = ["Projekt-Nordstjarnan-Test"]
  const compositeDoc = [
    "Patient Anna Lindqvist (19900101-2385) och anhörig Erik Bergström (19850601-2387).",
    "Handläggare Karin Sjöberg, samordningsnummer 19640372-2397, org.nr 202100-4748.",
    "Telefon 070-174 06 58 / 08-465 00 412, e-post provnamn.maskera@example.com och kandidat.test@example.org.",
    "Adress: Maskeragatan 44, 123 45 Uppsala.",
    "Betalning: IBAN SE4280000890119146168423, bankgiro 991-2346, plusgiro 920100-5, kort 4242 4242 4242 4242.",
    "Kodnamn: Projekt-Nordstjarnan-Test.",
  ].join("\n")

  const engine = createMaskeraEngine({
    defaultMode: mode,
    nerOptions: getLocalNerOptions(),
  })

  try {
    // 1. Proxy egress auditor across all LLM endpoints, encodings, and nested fields
    await suite.check(
      "proxy-egress-all-endpoints",
      `Zero raw/URL/Base64 canary leaks across Anthropic, OpenAI Chat, Responses, Completions, Embeddings, Batches (${mode})`,
      async () => {
        const auditFile = join(dir, "privacy-audit.jsonl")
        const stderrLogs = []
        const egress = await startEgressAuditor((_req, res) => {
          res.writeHead(200, { "content-type": "application/json" })
          res.end(
            JSON.stringify({
              id: "msg_audit",
              type: "message",
              role: "assistant",
              content: [{ type: "text", text: "Klart [PERSONNUMMER_1] [EPOST_1]" }],
              choices: [{ message: { role: "assistant", content: "Klart [PERSONNUMMER_1]" } }],
              output_text: "Klart [PERSONNUMMER_1]",
            }),
          )
        })
        const proxy = await startMaskeraProxy({
          port: 0,
          upstream: egress.url,
          engine,
          mcpRoots: [dir],
          customTerms,
          auditLogPath: auditFile,
          onLog: (line) => stderrLogs.push(line),
        })

        try {
          const calls = [
            {
              url: "/v1/messages",
              headers: { "content-type": "application/json", "content-encoding": "gzip" },
              body: gzipSync(
                Buffer.from(
                  JSON.stringify({
                    model: "claude-sonnet-4-6",
                    system:
                      "Systemnotering om Projekt-Nordstjarnan-Test och provnamn.maskera@example.com",
                    metadata: { user_id: "provnamn.maskera@example.com" },
                    tools: [
                      {
                        name: "lookup",
                        description: "Tel 070-174 06 58 Projekt-Nordstjarnan-Test",
                      },
                    ],
                    messages: [
                      { role: "user", content: compositeDoc },
                      {
                        role: "user",
                        content: [
                          {
                            type: "document",
                            title: "Bilaga 19900101-2385",
                            source: {
                              type: "base64",
                              media_type: "text/plain",
                              data: Buffer.from(compositeDoc, "utf8").toString("base64"),
                            },
                          },
                        ],
                      },
                    ],
                  }),
                ),
              ),
            },
            {
              url: "/v1/messages/count_tokens",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                model: "claude-sonnet-4-6",
                messages: [{ role: "user", content: compositeDoc }],
              }),
            },
            {
              url: "/v1/messages/batches",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                requests: [
                  {
                    custom_id: "req-1",
                    params: {
                      model: "claude-sonnet-4-6",
                      messages: [{ role: "user", content: compositeDoc }],
                    },
                  },
                ],
              }),
            },
            {
              url: "/v1/chat/completions",
              headers: { "content-type": "application/json", "content-encoding": "br" },
              body: brotliCompressSync(
                Buffer.from(
                  JSON.stringify({
                    model: "gpt-4.1",
                    user: "provnamn.maskera@example.com",
                    messages: [
                      {
                        role: "user",
                        name: "provnamn.maskera@example.com",
                        content: compositeDoc,
                      },
                      {
                        role: "assistant",
                        reasoning_content: "Kontroll 19900101-2385",
                        tool_calls: [
                          {
                            id: "tc1",
                            type: "function",
                            function: {
                              name: "save_case",
                              arguments: JSON.stringify({
                                pnr: 199001012385,
                                email: "provnamn.maskera@example.com",
                              }),
                            },
                          },
                        ],
                      },
                    ],
                  }),
                ),
              ),
            },
            {
              url: "/v1/responses",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                model: "gpt-5",
                instructions: "Hantera ärende Projekt-Nordstjarnan-Test",
                input: [
                  {
                    type: "message",
                    role: "user",
                    content: [{ type: "input_text", text: compositeDoc }],
                  },
                  {
                    type: "custom_tool_call",
                    name: "apply_patch",
                    input: `+++ patch\n+${compositeDoc}`,
                  },
                  {
                    type: "message",
                    role: "user",
                    content: [
                      {
                        type: "input_file",
                        file_data: `data:text/plain;base64,${Buffer.from("Fil 19900101-2385 provnamn.maskera@example.com").toString("base64")}`,
                      },
                    ],
                  },
                ],
              }),
            },
            {
              url: "/v1/completions",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ model: "gpt-3.5-turbo-instruct", prompt: compositeDoc }),
            },
            {
              url: "/v1/embeddings",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ model: "text-embedding-3-small", input: [compositeDoc] }),
            },
          ]

          for (const c of calls) {
            const r = await fetch(`${proxy.url}${c.url}`, {
              method: "POST",
              headers: c.headers,
              body: c.body,
            })
            assert.equal(r.status, 200, `${c.url} returned ${r.status}`)
          }

          surfacesChecked += egress.captured.length * 2
          const egressLeaks = egress.scanAll(activeCanaries)
          totalLeaks += egressLeaks.length
          assert.equal(
            egressLeaks.length,
            0,
            `Upstream egress leaks: ${JSON.stringify(egressLeaks)}`,
          )

          // Check inspector status & preview & logs & JSONL audit file
          const statusText = await (await fetch(`${proxy.url}/_maskera/status`)).text()
          assertZeroLeaks("inspector /_maskera/status", statusText, activeCanaries)
          assertZeroLeaks(
            "inspector.list()",
            JSON.stringify(proxy.inspector.list()),
            activeCanaries,
          )
          assertZeroLeaks("proxy stderr log", stderrLogs.join("\n"), activeCanaries)

          await proxy.close()
          const auditRaw = await readFile(auditFile, "utf8")
          assertZeroLeaks("audit.jsonl", auditRaw, activeCanaries)
          return `${egress.captured.length} outbound LLM calls + inspector + audit.jsonl scanned: 0 leaks`
        } finally {
          await proxy.close().catch(() => {})
          await egress.close()
        }
      },
    )

    // 2. MCP stdio stdout/stderr + file workflow canary scan
    await suite.check(
      "mcp-stdio-zero-leak",
      "MCP stdio tools (read/search/redact/write/list/status) leak 0 canaries to stdout/stderr",
      async () => {
        const srcFile = join(dir, "sensitive.txt")
        const outFile = join(dir, "restored.txt")
        await writeFile(srcFile, compositeDoc, "utf8")
        const msgs = [
          {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: { protocolVersion: "2025-11-25" },
          },
          { jsonrpc: "2.0", method: "notifications/initialized" },
          {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
              name: "maskera_read_file",
              arguments: { path: "sensitive.txt", session_id: "p1", custom_terms: customTerms },
            },
          },
          {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
              name: "maskera_search_files",
              arguments: { query: "[PERSONNUMMER_1]", session_id: "p1", custom_terms: customTerms },
            },
          },
          {
            jsonrpc: "2.0",
            id: 4,
            method: "tools/call",
            params: { name: "maskera_list_sessions", arguments: {} },
          },
          {
            jsonrpc: "2.0",
            id: 5,
            method: "tools/call",
            params: {
              name: "maskera_write_file",
              arguments: {
                path: "restored.txt",
                session_id: "p1",
                text: "Svar till [PERSONNUMMER_1] [EPOST_1]",
              },
            },
          },
          {
            jsonrpc: "2.0",
            id: 6,
            method: "tools/call",
            params: { name: "maskera_status", arguments: {} },
          },
          {
            jsonrpc: "2.0",
            id: 7,
            method: "tools/call",
            params: { name: "maskera_clear_session", arguments: { session_id: "p1" } },
          },
        ]
        const cliArgs = [
          "--root",
          dir,
          "--no-raw-restore",
          ...(hasLocalNerModel ? [] : ["--rules-only"]),
        ]
        const run = await runProcess(process.execPath, [distCliPath, ...cliArgs], {
          input: `${msgs.map((m) => JSON.stringify(m)).join("\n")}\n`,
          env: getLocalNerEnv(),
        })
        assert.equal(run.code, 0, `MCP stdio exited ${run.code}: ${run.stderr}`)
        assertZeroLeaks("mcp stdio stdout", run.stdout, activeCanaries)
        assertZeroLeaks("mcp stdio stderr", run.stderr, activeCanaries)
        const restoredDisk = await readFile(outFile, "utf8")
        assert.equal(restoredDisk, "Svar till 19900101-2385 provnamn.maskera@example.com")
        return "MCP stdio stdout/stderr clean; disk restore verified"
      },
    )

    // 3. Guard CLI + Doctor receipt + Wrap receipt zero-leak check
    await suite.check(
      "guard-doctor-wrap-zero-leak",
      "Guard stderr, doctor receipt, and wrap receipt contain 0 raw canaries",
      async () => {
        const guardRun = await runProcess(
          process.execPath,
          [
            distCliPath,
            "guard",
            "--no-proxy",
            "--custom-term",
            "Projekt-Nordstjarnan-Test",
            ...(hasLocalNerModel ? [] : ["--rules-only"]),
          ],
          { input: JSON.stringify({ prompt: compositeDoc }), env: getLocalNerEnv() },
        )
        assert.equal(guardRun.code, 2, `Expected guard exit 2, got ${guardRun.code}`)
        assertZeroLeaks("guard stdout", guardRun.stdout, activeCanaries)
        assertZeroLeaks("guard stderr", guardRun.stderr, activeCanaries)

        const guardRedact = await runProcess(
          process.execPath,
          [
            distCliPath,
            "guard",
            "--redact",
            "--no-proxy",
            "--custom-term",
            "Projekt-Nordstjarnan-Test",
            ...(hasLocalNerModel ? [] : ["--rules-only"]),
          ],
          {
            input: JSON.stringify({
              hook_event_name: "PostToolUse",
              tool_input: { pnr: 199001012385, body: compositeDoc },
            }),
            env: getLocalNerEnv(),
          },
        )
        assert.equal(
          guardRedact.code,
          0,
          `guard --redact exited ${guardRedact.code}: ${guardRedact.stderr}`,
        )
        assertZeroLeaks("guard --redact stdout", guardRedact.stdout, activeCanaries)
        assertZeroLeaks("guard --redact stderr", guardRedact.stderr, activeCanaries)

        const docReceiptPath = join(dir, "doctor-receipt.json")
        const docReport = await runDoctor({
          engine,
          roots: [dir],
          mode,
          proxyUrl: "http://127.0.0.1:1",
        })
        await writeDoctorReceipt(docReceiptPath, docReport)
        const docRaw = await readFile(docReceiptPath, "utf8")
        assertZeroLeaks("doctor receipt JSON", docRaw, activeCanaries)

        const wrapReceiptPath = join(dir, "wrap-receipt.json")
        const wrapStderr = []
        const wrapRes = await runWrap({
          command: process.execPath,
          args: ["-e", "process.exit(0)"],
          engine,
          roots: [dir],
          receiptPath: wrapReceiptPath,
          onStderr: (line) => wrapStderr.push(line),
        })
        assert.equal(wrapRes.exitCode, 0)
        assertZeroLeaks("wrap stderr", wrapStderr.join("\n"), activeCanaries)
        assertZeroLeaks(
          "wrap receipt JSON",
          await readFile(wrapReceiptPath, "utf8"),
          activeCanaries,
        )
        return "Guard, doctor receipt, and wrap receipt all 0 leaks"
      },
    )

    // 4. Error/timeout/cancellation/retry paths never leak raw canaries
    await suite.check(
      "error-retry-cancel-no-leak",
      "Upstream 500, timeout, and client cancellation never leak raw canaries to logs or error responses",
      async () => {
        const stderrLogs = []
        let attempt = 0
        const egress = await startEgressAuditor(async (_req, res) => {
          attempt += 1
          if (attempt === 1) {
            res.writeHead(500, { "content-type": "application/json" })
            res.end(JSON.stringify({ error: { message: "upstream temporary failure" } }))
            return
          }
          await new Promise((r) => setTimeout(r, 400))
          if (!res.destroyed) {
            res.writeHead(200, { "content-type": "application/json" })
            res.end(JSON.stringify({ ok: true }))
          }
        })
        const proxy = await startMaskeraProxy({
          port: 0,
          upstream: egress.url,
          engine,
          onLog: (line) => stderrLogs.push(line),
        })
        try {
          const r1 = await fetch(`${proxy.url}/v1/messages`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ messages: [{ role: "user", content: compositeDoc }] }),
          })
          assert.equal(r1.status, 500)
          assertZeroLeaks("500 error response body", await r1.text(), activeCanaries)

          const ac = new AbortController()
          setTimeout(() => ac.abort(), 60)
          await fetch(`${proxy.url}/v1/messages`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ messages: [{ role: "user", content: compositeDoc }] }),
            signal: ac.signal,
          }).catch(() => {})

          assertZeroLeaks("error/cancel proxy logs", stderrLogs.join("\n"), activeCanaries)
          const egressLeaks = egress.scanAll(activeCanaries)
          totalLeaks += egressLeaks.length
          assert.equal(
            egressLeaks.length,
            0,
            `Egress leaked during error/cancel: ${JSON.stringify(egressLeaks)}`,
          )
          return "0 leaks across upstream 500 and client abort"
        } finally {
          await proxy.close()
          await egress.close()
        }
      },
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  return suite.finish({
    mode,
    canariesTracked: activeCanaries.length,
    surfacesChecked,
    canaryLeaks: totalLeaks,
  })
}
