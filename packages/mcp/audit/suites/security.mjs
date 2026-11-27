/**
 * Security Invariants & Mutation Testing Audit Suite (`audit:security`).
 *
 * Verifies every deterministic security boundary (fail-closed proxy,
 * cross-session isolation, mode-downgrade prevention, SSRF/redirect blocking,
 * loopback enforcement, symlink/path traversal defense, 0600 file permissions)
 * AND runs 4 live negative-control mutation tests against temporary copies of
 * `dist/` to prove the audit suite actually catches sabotaged security controls.
 */
import assert from "node:assert/strict"
import { cp, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { createMaskeraEngine, createMaskeraMcpServer, startMaskeraProxy } from "../../dist/index.js"
import { startEgressAuditor } from "../lib/canary.mjs"
import {
  createSuiteCollector,
  distCliPath,
  getLocalNerOptions,
  hasLocalNerModel,
  pkgRoot,
  runProcess,
} from "../lib/harness.mjs"

function makeStubRecognizer() {
  return {
    ready: Promise.resolve(),
    async detect(text) {
      const names = ["Anna Lindqvist", "Erik Bergström"]
      const out = []
      for (const name of names) {
        let from = 0
        for (;;) {
          const idx = text.indexOf(name, from)
          if (idx < 0) break
          out.push({ start: idx, end: idx + name.length, value: name, label: "NAMN" })
          from = idx + name.length
        }
      }
      return out
    },
  }
}

/**
 * Reusable core security probe executed both against the real `dist/index.js`
 * (must PASS) and against each intentionally mutated copy of `dist/` (must FAIL
 * to prove the audit catches the planted vulnerability!).
 */
async function runSecurityInvariantProbe(mod, workDir) {
  const failures = []

  // Probe 1: Proxy must mask PII before upstream
  {
    const egress = await startEgressAuditor()
    const proxy = await mod.startMaskeraProxy({
      port: 0,
      upstream: egress.url,
      defaultMode: "rules",
    })
    try {
      await fetch(`${proxy.url}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Pnr 19900101-2385" }],
        }),
      })
      if (egress.captured.some((r) => r.body.includes("19900101-2385"))) {
        failures.push("PROXY_RAW_LEAK")
      }
    } finally {
      await proxy.close()
      await egress.close()
    }
  }

  // Probe 2: Fail-closed 502 when NER throws (0 bytes forwarded upstream)
  {
    const egress = await startEgressAuditor()
    const failingEngine = mod.createMaskeraEngine({
      defaultMode: "auto",
      recognizer: {
        get ready() {
          return Promise.reject(new Error("ner_crashed"))
        },
        async detect() {
          throw new Error("ner_crashed")
        },
      },
    })
    const proxy = await mod.startMaskeraProxy({
      port: 0,
      upstream: egress.url,
      engine: failingEngine,
    })
    try {
      const res = await fetch(`${proxy.url}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: "Anna Lindqvist 19900101-2385" }],
        }),
      })
      if (res.status !== 502 || egress.captured.length !== 0) {
        failures.push("FAIL_OPEN_ON_NER_ERROR")
      }
    } finally {
      await proxy.close()
      await egress.close()
    }
  }

  // Probe 3: Cross-session vault isolation on /mcp
  {
    const proxy = await mod.startMaskeraProxy({
      port: 0,
      defaultMode: "rules",
      mcpRoots: [workDir],
    })
    try {
      const initA = await fetch(proxy.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-11-25" },
        }),
      })
      const sidA = initA.headers.get("mcp-session-id")
      const initB = await fetch(proxy.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-11-25" },
        }),
      })
      const sidB = initB.headers.get("mcp-session-id")

      await fetch(proxy.mcpUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "mcp-session-id": sidA },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "maskera_redact",
            arguments: { text: "provnamn.maskera@example.com", session_id: "s-priv" },
          },
        }),
      })

      const stealRes = await (
        await fetch(proxy.mcpUrl, {
          method: "POST",
          headers: { "content-type": "application/json", "mcp-session-id": sidB },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
              name: "maskera_restore",
              arguments: { text: "[EPOST_1]", session_id: "s-priv" },
            },
          }),
        })
      ).text()
      if (stealRes.includes("provnamn.maskera@example.com")) {
        failures.push("CROSS_SESSION_LEAK")
      }
    } finally {
      await proxy.close()
    }
  }

  // Probe 4: Mode downgrade on maskera_read_file blocked in auto mode
  {
    const samplePath = join(workDir, "probe-file.txt")
    await writeFile(samplePath, "Patient Anna Lindqvist (19900101-2385).", "utf8")
    const engine = mod.createMaskeraEngine({
      defaultMode: "auto",
      recognizer: makeStubRecognizer(),
    })
    const server = mod.createMaskeraMcpServer({
      engine,
      allowedRoots: [workDir],
      allowRawRestore: false,
    })
    const res = await server.handleMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "maskera_read_file", arguments: { path: "probe-file.txt", mode: "rules" } },
    })
    if (JSON.stringify(res).includes("Anna Lindqvist") || !res?.result?.isError) {
      failures.push("MODE_DOWNGRADE_ALLOWED")
    }
  }

  return failures
}

export async function runSecurityAudit() {
  const suite = createSuiteCollector("security")
  const dir = await mkdtemp(join(tmpdir(), "maskera-audit-sec-"))
  let crossSessionLeaks = 0
  let failOpenIncidents = 0
  let mutationsTotal = 0
  let mutationsSurvived = 0

  try {
    // 1. Mode-downgrade prevention & vault exfiltration under --no-raw-restore
    await suite.check(
      "mode-downgrade-and-search-exfil",
      "Blocks mode='rules' downgrade on file tools, prevents placeholder search exfil under --no-raw-restore, redacts before truncating",
      async () => {
        const longLine = `${"a".repeat(495)}19900101-2385`
        await writeFile(
          join(dir, "secret.txt"),
          `Patient Anna Lindqvist (19900101-2385) i Uppsala.\n${longLine}\n`,
          "utf8",
        )
        const engine = createMaskeraEngine({
          defaultMode: "auto",
          recognizer: hasLocalNerModel ? undefined : makeStubRecognizer(),
          nerOptions: getLocalNerOptions(),
        })
        const mcp = createMaskeraMcpServer({
          engine,
          allowedRoots: [dir],
          allowRawRestore: false,
        })

        const readOk = await mcp.handleMessage({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "maskera_read_file",
            arguments: { path: "secret.txt", session_id: "s1" },
          },
        })
        assert.equal(JSON.stringify(readOk).includes("Anna Lindqvist"), false)

        const downgradeRead = await mcp.handleMessage({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "maskera_read_file", arguments: { path: "secret.txt", mode: "rules" } },
        })
        assert.equal(downgradeRead?.result?.isError, true)
        assert.equal(JSON.stringify(downgradeRead).includes("Anna Lindqvist"), false)

        const downgradeSearch = await mcp.handleMessage({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "maskera_search_files",
            arguments: { query: "[NAMN_1]", session_id: "s1", mode: "rules" },
          },
        })
        assert.equal(downgradeSearch?.result?.isError, true)
        assert.equal(JSON.stringify(downgradeSearch).includes("Anna Lindqvist"), false)

        const truncSearch = await mcp.handleMessage({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "maskera_search_files", arguments: { query: "aaaaa", session_id: "s1" } },
        })
        const truncJson = JSON.stringify(truncSearch)
        assert.equal(
          truncJson.includes("19900"),
          false,
          `Truncated line leaked partial PNR: ${truncJson}`,
        )

        // Session-existence oracle blocked under --no-raw-restore
        const restoreOracleA = await mcp.handleMessage({
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: { name: "maskera_restore", arguments: { text: "[NAMN_1]", session_id: "s1" } },
        })
        const restoreOracleB = await mcp.handleMessage({
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: {
            name: "maskera_restore",
            arguments: { text: "[NAMN_1]", session_id: "nonexistent" },
          },
        })
        assert.equal(restoreOracleA?.result?.isError, true)
        assert.equal(
          restoreOracleA?.result?.content?.[0]?.text,
          restoreOracleB?.result?.content?.[0]?.text,
          "maskera_restore leaked session existence under --no-raw-restore",
        )
        return "Mode downgrade, search exfil, truncation leak, and session oracle all blocked"
      },
    )

    // 2. Fail-closed proxy guarantees (URL encoding, Content-Type smuggling, non-object JSON, NER crash)
    await suite.check(
      "proxy-fail-closed",
      "Proxy blocks Content-Type smuggling (415), non-object JSON (400), malformed path (400), URL-encoded path redacts, NER crash fails closed (502)",
      async () => {
        const egress = await startEgressAuditor()
        const proxy = await startMaskeraProxy({
          port: 0,
          upstream: egress.url,
          defaultMode: "rules",
        })
        try {
          // Percent-encoded path must still be redacted
          const pctRes = await fetch(`${proxy.url}/v1/%6dessages`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ messages: [{ role: "user", content: "Pnr 19900101-2385" }] }),
          })
          assert.equal(pctRes.status, 200)
          if (egress.captured.some((c) => c.body.includes("19900101-2385"))) {
            failOpenIncidents += 1
            assert.fail("Percent-encoded path bypassed redaction")
          }

          // Non-JSON content-type on redaction endpoint must fail closed with 415
          const ctCountBefore = egress.captured.length
          const ctRes = await fetch(`${proxy.url}/v1/messages`, {
            method: "POST",
            headers: { "content-type": "application/octet-stream" },
            body: JSON.stringify({ messages: [{ role: "user", content: "19900101-2385" }] }),
          })
          if (ctRes.status !== 415 || egress.captured.length !== ctCountBefore) {
            failOpenIncidents += 1
            assert.fail(`Expected 415 fail-closed, got ${ctRes.status}`)
          }

          // JSON array on redaction endpoint must fail closed with 400
          const arrRes = await fetch(`${proxy.url}/v1/messages`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(["19900101-2385"]),
          })
          if (arrRes.status !== 400 || egress.captured.length !== ctCountBefore) {
            failOpenIncidents += 1
            assert.fail(`Expected 400 on JSON array, got ${arrRes.status}`)
          }

          // Malformed percent encoding fails closed with 400
          const badPct = await fetch(`${proxy.url}/v1/%ZZmessages`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ messages: [{ role: "user", content: "19900101-2385" }] }),
          })
          if (badPct.status !== 400 || egress.captured.length !== ctCountBefore) {
            failOpenIncidents += 1
            assert.fail(`Expected 400 on malformed percent encoding, got ${badPct.status}`)
          }
        } finally {
          await proxy.close()
          await egress.close()
        }
        return "All fail-closed proxy checks passed (0 fail-open incidents)"
      },
    )

    // 3. Cross-session isolation (/mcp A vs /mcp B vs proxy vault + approvals + DELETE cleanup)
    await suite.check(
      "cross-session-isolation",
      "Strict isolation between /mcp sessions, proxy vault, resolveSessionFor, and ApprovalBroker",
      async () => {
        const egress = await startEgressAuditor()
        const proxy = await startMaskeraProxy({
          port: 0,
          upstream: egress.url,
          defaultMode: "rules",
          mcpRoots: [dir],
          approvalMode: "browser",
        })
        try {
          // Seed proxy vault
          await fetch(`${proxy.url}/v1/messages`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              messages: [{ role: "user", content: "Proxy tel 070-174 06 58" }],
            }),
          })

          // Initialize two distinct HTTP MCP sessions
          const initA = await fetch(proxy.mcpUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: { protocolVersion: "2025-11-25" },
            }),
          })
          const sidA = initA.headers.get("mcp-session-id")
          const initB = await fetch(proxy.mcpUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "initialize",
              params: { protocolVersion: "2025-11-25" },
            }),
          })
          const sidB = initB.headers.get("mcp-session-id")

          // Client A redacts a secret and creates a browser approval request
          await fetch(proxy.mcpUrl, {
            method: "POST",
            headers: { "content-type": "application/json", "mcp-session-id": sidA },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/call",
              params: {
                name: "maskera_redact",
                arguments: { text: "A: provnamn.maskera@example.com", session_id: "shared-name" },
              },
            }),
          })
          const pausedA = await (
            await fetch(proxy.mcpUrl, {
              method: "POST",
              headers: { "content-type": "application/json", "mcp-session-id": sidA },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 3,
                method: "tools/call",
                params: {
                  name: "maskera_restore",
                  arguments: { text: "[EPOST_1]", session_id: "shared-name" },
                },
              }),
            })
          ).json()
          const aprId = pausedA.result.structuredContent.request_id
          await fetch(`${proxy.url}/_maskera/approvals/${aprId}/approve`, {
            method: "POST",
            headers: { "x-maskera-action": "decide" },
          })

          // Client B tries: list sessions, restore A's session, restore proxy session, write without session_id, resume A's approval
          const listB = await (
            await fetch(proxy.mcpUrl, {
              method: "POST",
              headers: { "content-type": "application/json", "mcp-session-id": sidB },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 10,
                method: "tools/call",
                params: { name: "maskera_list_sessions", arguments: {} },
              }),
            })
          ).json()
          if (listB.result.structuredContent.sessions.length !== 0) {
            crossSessionLeaks += 1
            assert.fail(
              `Client B saw other sessions: ${JSON.stringify(listB.result.structuredContent)}`,
            )
          }

          const writeWithoutSid = await (
            await fetch(proxy.mcpUrl, {
              method: "POST",
              headers: { "content-type": "application/json", "mcp-session-id": sidB },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 11,
                method: "tools/call",
                params: {
                  name: "maskera_write_file",
                  arguments: { path: "stolen.txt", text: "[TELEFON_1] [EPOST_1]" },
                },
              }),
            })
          ).json()
          if (!writeWithoutSid.result.isError) {
            crossSessionLeaks += 1
            assert.fail("Client B resolved another owner's session via resolveSessionFor")
          }

          const hijackResume = await (
            await fetch(proxy.mcpUrl, {
              method: "POST",
              headers: { "content-type": "application/json", "mcp-session-id": sidB },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 12,
                method: "tools/call",
                params: { name: "maskera_resume", arguments: { request_id: aprId } },
              }),
            })
          ).text()
          if (hijackResume.includes("provnamn.maskera@example.com")) {
            crossSessionLeaks += 1
            assert.fail("Client B hijacked Client A's approved raw PII export")
          }

          // Unknown Mcp-Session-Id must return 404
          const unknownSess = await fetch(proxy.mcpUrl, {
            method: "POST",
            headers: { "content-type": "application/json", "mcp-session-id": "mcp_fabricated" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 13, method: "ping" }),
          })
          assert.equal(unknownSess.status, 404)

          // DELETE /mcp wipes Client A's vault entries immediately
          const delA = await fetch(proxy.mcpUrl, {
            method: "DELETE",
            headers: { "mcp-session-id": sidA },
          })
          assert.equal(delA.status, 204)
          const remainingEntries = proxy.vault
            .entries()
            .filter((e) => e.value.includes("provnamn.maskera@example.com"))
          assert.equal(remainingEntries.length, 0, "DELETE /mcp did not wipe session vault entries")
        } finally {
          await proxy.close()
          await egress.close()
        }
        return "0 cross-session leaks across /mcp, proxy vault, approvals, and DELETE cleanup"
      },
    )

    // 4. SSRF, non-loopback refusal, redirect manual, path traversal, file permissions, resource limits
    await suite.check(
      "ssrf-loopback-perms-limits",
      "Refuses wildcard/non-loopback bind, does not follow 302 redirects with API keys, enforces 0o600 permissions and resource caps",
      async () => {
        // Non-loopback refused by default (both wildcard and RFC 5737 external test IP)
        const wildcardHost = [0, 0, 0, 0].join(".")
        for (const nonLoopbackHost of [wildcardHost, "192.0.2.1"]) {
          let refusedNonLoopback = false
          try {
            await startMaskeraProxy({ host: nonLoopbackHost, port: 0, defaultMode: "rules" })
          } catch {
            refusedNonLoopback = true
          }
          assert.equal(
            refusedNonLoopback,
            true,
            `Proxy allowed non-loopback ${nonLoopbackHost} bind without opt-in`,
          )
        }

        // Redirect must NOT be followed automatically (prevents API key exfil via 302)
        let sinkHit = false
        const sink = createServer((_req, res) => {
          sinkHit = true
          res.writeHead(200)
          res.end("stolen")
        })
        await new Promise((r) => sink.listen(0, "127.0.0.1", r))
        const sinkPort = sink.address().port

        const redirector = createServer((_req, res) => {
          res.writeHead(302, { location: `http://127.0.0.1:${sinkPort}/steal` })
          res.end()
        })
        await new Promise((r) => redirector.listen(0, "127.0.0.1", r))
        const redirPort = redirector.address().port

        const proxy = await startMaskeraProxy({
          port: 0,
          upstream: `http://127.0.0.1:${redirPort}`,
          defaultMode: "rules",
          auditLogPath: join(dir, "perm-audit.jsonl"),
        })
        try {
          const r = await fetch(`${proxy.url}/v1/messages`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-api-key": "sk-secret-canary" },
            body: JSON.stringify({ messages: [{ role: "user", content: "Hej" }] }),
            redirect: "manual",
          })
          assert.equal(r.status, 302)
          assert.equal(sinkHit, false, "Proxy followed 302 redirect and leaked headers!")
        } finally {
          await proxy.close()
          await new Promise((r) => redirector.close(r))
          await new Promise((r) => sink.close(r))
        }

        // File permissions (0o600) on restored PII files & audit logs + symlink escape
        const auditMode = (await stat(join(dir, "perm-audit.jsonl"))).mode & 0o777
        assert.equal(auditMode, 0o600, `Expected audit log mode 600, got ${auditMode.toString(8)}`)

        const outside = await mkdtemp(join(tmpdir(), "maskera-audit-out-"))
        try {
          const mcp = createMaskeraMcpServer({
            engine: createMaskeraEngine({ defaultMode: "rules" }),
            allowedRoots: [dir],
          })
          await mcp.handleMessage({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "maskera_redact",
              arguments: { text: "19900101-2385", session_id: "p" },
            },
          })
          await mcp.handleMessage({
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
              name: "maskera_write_file",
              arguments: { path: "mode-check.txt", session_id: "p", text: "[PERSONNUMMER_1]" },
            },
          })
          const outMode = (await stat(join(dir, "mode-check.txt"))).mode & 0o777
          assert.equal(
            outMode,
            0o600,
            `Expected restored file mode 600, got ${outMode.toString(8)}`,
          )

          // Symlink escape on write
          await symlink(join(outside, "escaped.txt"), join(dir, "sym-escape.txt"))
          const esc = await mcp.handleMessage({
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
              name: "maskera_write_file",
              arguments: {
                path: "sym-escape.txt",
                session_id: "p",
                text: "[PERSONNUMMER_1]",
                overwrite: true,
              },
            },
          })
          assert.equal(esc?.result?.isError, true)
        } finally {
          await rm(outside, { recursive: true, force: true })
        }

        // Guard rejects oversized input fail-closed (exit 2)
        const bigFile = join(dir, "oversized.txt")
        await writeFile(bigFile, "x".repeat(16 * 1024 * 1024 + 64))
        const guardBig = await runProcess(process.execPath, [
          distCliPath,
          "guard",
          "--rules-only",
          "--file",
          bigFile,
        ])
        assert.equal(
          guardBig.code,
          2,
          `Oversized guard file must fail closed with exit 2, got ${guardBig.code}`,
        )

        return "Loopback bind, no-redirect SSRF guard, 0600 perms, symlink defense, and size caps verified"
      },
    )

    // 5. NEGATIVE CONTROLS: Mutation Testing of Critical Security Controls
    await suite.check(
      "mutation-testing-controls",
      "Sabotaging 4 critical security controls in isolated dist/ copies is caught 4/4 times",
      async () => {
        // First confirm unmutated dist passes the probe with 0 failures
        const cleanMod = await import(pathToFileURL(join(pkgRoot, "dist/index.js")).href)
        const cleanFailures = await runSecurityInvariantProbe(cleanMod, dir)
        assert.deepEqual(
          cleanFailures,
          [],
          `Unmutated dist failed security probe: ${cleanFailures.join(", ")}`,
        )

        const originalSource = await readFile(join(pkgRoot, "dist/index.js"), "utf8")
        const mutations = [
          {
            id: "MUT-01-disable-proxy-redaction",
            expectedFailure: "PROXY_RAW_LEAK",
            apply: (src) => {
              const next = src.replace(
                "if (rawBody && rawBody.byteLength > 0 && needsRedaction) {",
                "if (false && rawBody && rawBody.byteLength > 0 && needsRedaction) {",
              )
              assert.notEqual(next, src, "MUT-01 anchor not found in dist/index.js")
              return next
            },
          },
          {
            id: "MUT-02-fail-open-on-ner-error",
            expectedFailure: "FAIL_OPEN_ON_NER_ERROR",
            apply: (src) => {
              const alt = src.replace(
                /throw new Error\(\s*`Hybrid NER failed to run \(\$\{message\}\)/,
                "return { result: { text, map: {}, redactions: [], restore: (s) => s }, modeUsed: 'rules' }; throw new Error(`",
              )
              assert.notEqual(alt, src, "MUT-02 anchor not found in dist/index.js")
              return alt
            },
          },
          {
            id: "MUT-03-break-session-isolation",
            expectedFailure: "CROSS_SESSION_LEAK",
            apply: (src) => {
              const next = src.replace(
                "function ownerStorageKey(owner, id) {",
                "function ownerStorageKey(_owner, id) { return id; //",
              )
              assert.notEqual(next, src, "MUT-03 anchor not found in dist/index.js")
              return next.replace(/return `\$\{owner\}\\0\$\{id\}`;?/, "")
            },
          },
          {
            id: "MUT-04-allow-mode-downgrade",
            expectedFailure: "MODE_DOWNGRADE_ALLOWED",
            apply: (src) => {
              const next = src.replace(
                'if (engine.status().defaultMode === "auto" && requestedMode === "rules") {',
                'if (false && engine.status().defaultMode === "auto" && requestedMode === "rules") {',
              )
              assert.notEqual(next, src, "MUT-04 anchor not found in dist/index.js")
              return next
            },
          },
        ]

        const mutRoot = join(dir, "mutations")
        const killed = []
        for (const mut of mutations) {
          mutationsTotal += 1
          const mutDir = join(mutRoot, mut.id)
          await cp(join(pkgRoot, "dist"), join(mutDir, "dist"), { recursive: true })
          // Symlink package.json & node_modules so relative imports (`../package.json`, `maskera`) resolve
          await cp(join(pkgRoot, "package.json"), join(mutDir, "package.json"))
          await symlink(join(pkgRoot, "node_modules"), join(mutDir, "node_modules"))
          const mutatedCode = mut.apply(originalSource)
          await writeFile(join(mutDir, "dist/index.js"), mutatedCode, "utf8")

          const mutMod = await import(
            `${pathToFileURL(join(mutDir, "dist/index.js")).href}?mut=${mut.id}`
          )
          const mutFailures = await runSecurityInvariantProbe(mutMod, dir)
          if (!mutFailures.includes(mut.expectedFailure)) {
            mutationsSurvived += 1
            assert.fail(
              `Mutation ${mut.id} SURVIVED undetected! Observed: ${JSON.stringify(mutFailures)}`,
            )
          }
          killed.push(`${mut.id}->${mut.expectedFailure}`)
        }
        return `4/4 mutations killed: ${killed.join(", ")}`
      },
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  return suite.finish({
    crossSessionLeaks,
    failOpenIncidents,
    mutationsTotal,
    mutationsSurvived,
  })
}
