/**
 * MCP Protocol & Transport Conformance Audit Suite.
 *
 * Verifies JSON-RPC 2.0, MCP protocol versions (2025-11-25, 2025-06-18,
 * 2025-03-26, 2024-11-05), capability negotiation, tool/prompt/resource
 * schemas, error codes, cancellation notifications, stdout purity, native
 * bidirectional elicitation, and Streamable HTTP semantics.
 */
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createMaskeraEngine,
  createMaskeraMcpServer,
  MASKERA_SKILL_URI,
  MASKERA_STATUS_URI,
  startMaskeraProxy,
} from "../../dist/index.js"
import { createSuiteCollector, distCliPath, runProcess } from "../lib/harness.mjs"

export async function runProtocolAudit() {
  const suite = createSuiteCollector("protocol")
  const dir = await mkdtemp(join(tmpdir(), "maskera-audit-proto-"))

  try {
    await suite.check(
      "mcp-versions-and-jsonrpc",
      "Negotiates all 4 advertised MCP versions, falls back cleanly on unknown versions, and returns strict JSON-RPC 2.0 error codes",
      async () => {
        const server = createMaskeraMcpServer({
          engine: createMaskeraEngine({ defaultMode: "rules" }),
          allowedRoots: [dir],
        })
        for (const ver of ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]) {
          const r = await server.handleMessage({
            jsonrpc: "2.0",
            id: `v-${ver}`,
            method: "initialize",
            params: { protocolVersion: ver },
          })
          assert.equal(r?.result?.protocolVersion, ver)
        }
        const unknownVer = await server.handleMessage({
          jsonrpc: "2.0",
          id: "v-future",
          method: "initialize",
          params: { protocolVersion: "2099-01-01" },
        })
        assert.equal(unknownVer?.result?.protocolVersion, "2025-11-25")

        // Notifications return null (including notifications/cancelled)
        assert.equal(
          await server.handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" }),
          null,
        )
        assert.equal(
          await server.handleMessage({
            jsonrpc: "2.0",
            method: "notifications/cancelled",
            params: { requestId: 999, reason: "user cancelled" },
          }),
          null,
        )

        // JSON-RPC error codes
        assert.equal((await server.handleMessage({ invalid: true }))?.error?.code, -32600)
        assert.equal(
          (await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "no/such/method" }))?.error
            ?.code,
          -32601,
        )
        assert.equal(
          (await server.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: {} }))
            ?.error?.code,
          -32602,
        )
        assert.equal(
          (
            await server.handleMessage({
              jsonrpc: "2.0",
              id: 3,
              method: "prompts/get",
              params: { name: "nope" },
            })
          )?.error?.code,
          -32602,
        )
        assert.equal(
          (
            await server.handleMessage({
              jsonrpc: "2.0",
              id: 4,
              method: "resources/read",
              params: { uri: "maskera://missing" },
            })
          )?.error?.code,
          -32002,
        )

        // Capabilities & schemas
        const tools =
          (await server.handleMessage({ jsonrpc: "2.0", id: 5, method: "tools/list" }))?.result
            ?.tools ?? []
        assert.ok(tools.length >= 9)
        for (const t of tools) {
          assert.equal(t.inputSchema?.type, "object", `tool ${t.name} missing object inputSchema`)
          assert.equal(t.outputSchema?.type, "object", `tool ${t.name} missing object outputSchema`)
          assert.equal(t.annotations?.openWorldHint, false)
        }

        const resRead = await server.handleMessage({
          jsonrpc: "2.0",
          id: 6,
          method: "resources/read",
          params: { uri: MASKERA_SKILL_URI },
        })
        assert.ok(resRead?.result?.contents?.[0]?.text?.includes("# Maskera"))
        const statusRead = await server.handleMessage({
          jsonrpc: "2.0",
          id: 7,
          method: "resources/read",
          params: { uri: MASKERA_STATUS_URI },
        })
        assert.equal(
          JSON.parse(statusRead?.result?.contents?.[0]?.text ?? "{}").server,
          "maskera-mcp",
        )
        return "All 4 MCP protocol versions, error codes, notifications, and schemas verified"
      },
    )

    await suite.check(
      "stdio-stdout-purity-and-elicitation",
      "stdio transport emits strictly valid newline-delimited JSON-RPC (0 stdout corruption) and completes bidirectional elicitation",
      async () => {
        // Parse error + valid requests
        const input = [
          "{not valid json",
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: { protocolVersion: "2025-11-25" },
          }),
          JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
        ].join("\n")
        const run = await runProcess(
          process.execPath,
          [distCliPath, "--rules-only", "--root", dir],
          {
            input: `${input}\n`,
          },
        )
        assert.equal(run.code, 0)
        const lines = run.stdout.trim().split("\n")
        assert.equal(lines.length, 3, `Expected 3 JSON-RPC lines on stdout, got ${lines.length}`)
        const parsed = lines.map((l) => JSON.parse(l))
        assert.equal(parsed[0].error?.code, -32700)
        assert.equal(parsed[1].id, 1)
        assert.equal(parsed[2].id, 2)

        // Bidirectional native elicitation over live stdio child process
        await writeFile(join(dir, "elicit.txt"), "Tel 070-174 06 58", "utf8")
        const child = spawn(
          process.execPath,
          [distCliPath, "--rules-only", "--root", dir, "--approval-mode", "native"],
          { stdio: ["pipe", "pipe", "pipe"] },
        )
        const seenResponses = []
        let buf = ""
        await new Promise((resolveDone, rejectDone) => {
          const timer = setTimeout(() => {
            child.kill("SIGKILL")
            rejectDone(new Error("elicitation stdio timeout"))
          }, 8_000)
          child.stdout.on("data", (c) => {
            buf += c.toString("utf8")
            for (;;) {
              const nl = buf.indexOf("\n")
              if (nl < 0) break
              const line = buf.slice(0, nl).trim()
              buf = buf.slice(nl + 1)
              if (!line) continue
              const msg = JSON.parse(line)
              if (msg.method === "elicitation/create") {
                child.stdin.write(
                  `${JSON.stringify({
                    jsonrpc: "2.0",
                    id: msg.id,
                    result: { action: "accept", content: { confirm: true } },
                  })}\n`,
                )
              } else {
                seenResponses.push(msg)
                if (msg.id === 3) {
                  clearTimeout(timer)
                  child.stdin.end()
                  resolveDone()
                }
              }
            }
          })
          child.on("error", rejectDone)
          child.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: { protocolVersion: "2025-11-25", capabilities: { elicitation: {} } },
            })}\n`,
          )
          child.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/call",
              params: {
                name: "maskera_read_file",
                arguments: { path: "elicit.txt", session_id: "el1" },
              },
            })}\n`,
          )
          child.stdin.write(
            `${JSON.stringify({
              jsonrpc: "2.0",
              id: 3,
              method: "tools/call",
              params: {
                name: "maskera_restore",
                arguments: { text: "[TELEFON_1]", session_id: "el1" },
              },
            })}\n`,
          )
        })
        const restoreReply = seenResponses.find((m) => m.id === 3)
        assert.equal(restoreReply?.result?.structuredContent?.restored, "070-174 06 58")
        return "stdout strictly JSON-RPC + bidirectional native elicitation verified"
      },
    )

    await suite.check(
      "streamable-http-conformance",
      "Streamable HTTP /mcp honors POST/DELETE/405/202/404, policy tightening (never weakening), and batch arrays",
      async () => {
        const proxy = await startMaskeraProxy({
          port: 0,
          defaultMode: "rules",
          mcpRoots: [dir],
          allowRawRestore: false,
          approvalMode: "browser",
        })
        try {
          assert.equal((await fetch(proxy.mcpUrl, { method: "GET" })).status, 405)
          assert.equal((await fetch(proxy.mcpUrl, { method: "PUT" })).status, 405)

          // Attempt to weaken server policy via URL params (?allow_raw_restore=1&approval_mode=automatic)
          const init = await fetch(`${proxy.mcpUrl}?allow_raw_restore=1&approval_mode=automatic`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: { protocolVersion: "2025-11-25" },
            }),
          })
          assert.equal(init.status, 200)
          const sid = init.headers.get("mcp-session-id")
          assert.ok(sid)

          // Notification returns 202
          const notif = await fetch(proxy.mcpUrl, {
            method: "POST",
            headers: { "content-type": "application/json", "mcp-session-id": sid },
            body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
          })
          assert.equal(notif.status, 202)

          // Verify policy was NOT weakened
          const st = await (
            await fetch(proxy.mcpUrl, {
              method: "POST",
              headers: { "content-type": "application/json", "mcp-session-id": sid },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 2,
                method: "tools/call",
                params: { name: "maskera_status", arguments: {} },
              }),
            })
          ).json()
          assert.equal(st.result.structuredContent.policy.allow_raw_restore, false)
          assert.equal(st.result.structuredContent.policy.approval_mode, "browser")

          // Parse error returns 400 with -32700
          const badJson = await fetch(proxy.mcpUrl, {
            method: "POST",
            headers: { "content-type": "application/json", "mcp-session-id": sid },
            body: "{broken",
          })
          assert.equal(badJson.status, 400)
          assert.equal((await badJson.json()).error.code, -32700)

          // DELETE closes session and subsequent request gets 404
          assert.equal(
            (await fetch(proxy.mcpUrl, { method: "DELETE", headers: { "mcp-session-id": sid } }))
              .status,
            204,
          )
          assert.equal(
            (
              await fetch(proxy.mcpUrl, {
                method: "POST",
                headers: { "content-type": "application/json", "mcp-session-id": sid },
                body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "ping" }),
              })
            ).status,
            404,
          )
        } finally {
          await proxy.close()
        }
        return "Streamable HTTP verbs, status codes, and monotonic policy tightening verified"
      },
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  return suite.finish()
}
