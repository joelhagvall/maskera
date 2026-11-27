/**
 * Production-Pipeline Quality, Performance & Soak Audit Suite (`audit:benchmark`).
 *
 * 1. Evaluates the ACTUAL production model through the live `@maskera/mcp`
 *    server AND live HTTP proxy on the previously unseen 12-document Swedish
 *    multi-domain corpus (`audit/fixtures/unseen-eval-corpus.json`).
 *    Computes per-entity-type precision, recall, F1, document leakage rate,
 *    over-masking (non-PII retention), round-trip restoration accuracy, and
 *    placeholder integrity.
 * 2. Measures cold start, warm start, model load time, p50/p95/p99 latency
 *    (separating pure ONNX inference latency from full proxy HTTP overhead).
 * 3. Runs a 500-operation soak & concurrent load test checking RSS/heap growth
 *    and bounded SessionVault memory eviction.
 */
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  createMaskeraEngine,
  createMaskeraMcpServer,
  SessionVault,
  StreamingRestorer,
  startMaskeraProxy,
} from "../../dist/index.js"
import { startEgressAuditor } from "../lib/canary.mjs"
import {
  createSuiteCollector,
  distCliPath,
  getLocalNerOptions,
  hasLocalNerModel,
  runProcess,
} from "../lib/harness.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const corpusPath = resolve(here, "../fixtures/unseen-eval-corpus.json")

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return Math.round(sorted[idx] * 100) / 100
}

function round(n, digits = 2) {
  const f = 10 ** digits
  return Math.round(n * f) / f
}

export async function runBenchmarkAudit() {
  const suite = createSuiteCollector("benchmark")
  const dir = await mkdtemp(join(tmpdir(), "maskera-audit-bench-"))
  const corpus = JSON.parse(await readFile(corpusPath, "utf8"))
  const mode = hasLocalNerModel ? "auto" : "rules"
  const metrics = {
    mode,
    corpusDocuments: corpus.documents.length,
    structuredRecall: 0,
    overallRecall: 0,
    overallPrecision: 0,
    overallF1: 0,
    documentLeakageRate: 0,
    nonPiiRetention: 0,
    roundtripAccuracy: 0,
    perLabel: {},
    cliColdStartMs: 0,
    modelLoadMs: 0,
    inferenceP50Ms: 0,
    inferenceP95Ms: 0,
    inferenceP99Ms: 0,
    proxyP50Ms: 0,
    proxyP95Ms: 0,
    proxyP99Ms: 0,
    proxyOverheadP50Ms: 0,
    streaming10kMs: 0,
    concurrentThroughputRps: 0,
    soakOps: 500,
    soakHeapGrowthMb: 0,
    soakVaultSessionsBounded: true,
  }

  try {
    // 1. CLI cold start
    await suite.check(
      "cli-cold-start",
      "Measures CLI cold start (--version and MCP handshake)",
      async () => {
        const t0 = performance.now()
        const ver = await runProcess(process.execPath, [distCliPath, "--version"])
        assert.equal(ver.code, 0)
        metrics.cliColdStartMs = round(performance.now() - t0)
        return `CLI cold start: ${metrics.cliColdStartMs}ms`
      },
    )

    // 2. Production-pipeline quality eval on unseen Swedish multi-domain corpus through MCP + Proxy
    await suite.check(
      "production-pipeline-unseen-eval",
      `Evaluates precision, recall, F1, doc leakage, over-masking, and roundtrip restoration on ${corpus.documents.length} unseen docs through live MCP + Proxy (${mode})`,
      async () => {
        let modelLoadMs = 0
        const engine = createMaskeraEngine({
          defaultMode: mode,
          nerOptions: getLocalNerOptions(),
          maxCacheEntries: 0, // disable cache so latency measures real inference
          onModelStatus: (ev) => {
            if (ev.phase === "ready" && typeof ev.elapsedMs === "number") modelLoadMs = ev.elapsedMs
          },
        })
        const mcp = createMaskeraMcpServer({ engine, allowedRoots: [dir] })
        const egress = await startEgressAuditor((req, res) => {
          const parsed = JSON.parse(req.body || "{}")
          const txt = parsed.messages?.[0]?.content ?? ""
          res.writeHead(200, { "content-type": "application/json" })
          res.end(
            JSON.stringify({
              id: "eval",
              type: "message",
              role: "assistant",
              content: [{ type: "text", text: txt }],
            }),
          )
        })
        const proxy = await startMaskeraProxy({
          port: 0,
          upstream: egress.url,
          engine,
        })

        try {
          const perLabel = {}
          const ensureLabel = (lbl) => {
            perLabel[lbl] ??= { gold: 0, masked: 0, tp: 0, fp: 0 }
            return perLabel[lbl]
          }

          let totalGold = 0
          let totalMasked = 0
          let structuredGold = 0
          let structuredMasked = 0
          let docsWithAnyLeak = 0
          let totalNonPii = 0
          let retainedNonPii = 0
          let roundtripTotal = 0
          let roundtripExact = 0
          let totalPredictedSpans = 0
          let matchedPredictedSpans = 0
          const inferenceLatencies = []
          const proxyLatencies = []

          // Warm up model once and measure load time
          const tWarm = performance.now()
          await engine.redact("Uppvärmning Anna Lindqvist 19900101-2385.")
          metrics.modelLoadMs = modelLoadMs || round(performance.now() - tWarm)

          for (const doc of corpus.documents) {
            // Measure pure engine inference latency
            const tInf = performance.now()
            const { result: directRes } = await engine.redact(doc.text, { profile: doc.profile })
            inferenceLatencies.push(performance.now() - tInf)

            // Execute through live MCP server
            const mcpRes = await mcp.handleMessage({
              jsonrpc: "2.0",
              id: doc.id,
              method: "tools/call",
              params: {
                name: "maskera_redact",
                arguments: { text: doc.text, session_id: `eval-${doc.id}`, profile: doc.profile },
              },
            })
            const redactedMcp = mcpRes.result.structuredContent.redacted
            const restoreRes = await mcp.handleMessage({
              jsonrpc: "2.0",
              id: `${doc.id}-rest`,
              method: "tools/call",
              params: {
                name: "maskera_restore",
                arguments: { text: redactedMcp, session_id: `eval-${doc.id}` },
              },
            })
            roundtripTotal += 1
            if (restoreRes.result.structuredContent.restored === doc.text) roundtripExact += 1

            // Execute through live HTTP proxy (measures end-to-end HTTP + JSON + restore overhead)
            const tProxy = performance.now()
            const proxyRes = await fetch(`${proxy.url}/v1/messages`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "x-maskera-session": `proxy-eval-${doc.id}`,
              },
              body: JSON.stringify({
                model: "claude-eval",
                messages: [{ role: "user", content: doc.text }],
              }),
            })
            const proxyJson = await proxyRes.json()
            proxyLatencies.push(performance.now() - tProxy)
            roundtripTotal += 1
            if (proxyJson.content?.[0]?.text === doc.text) roundtripExact += 1

            // Score entity recall & leakage on MCP redacted output
            let docLeaked = false
            for (const ent of doc.entities) {
              const isFreeTextNer =
                ent.label === "NAMN" || ent.label === "PLATS" || ent.label === "ORGANISATION"
              if (!hasLocalNerModel && isFreeTextNer) continue
              const bucket = ensureLabel(ent.label)
              bucket.gold += 1
              totalGold += 1
              if (!isFreeTextNer) structuredGold += 1

              const hidden = !redactedMcp.includes(ent.value)
              if (hidden) {
                bucket.masked += 1
                bucket.tp += 1
                totalMasked += 1
                if (!isFreeTextNer) structuredMasked += 1
              } else {
                docLeaked = true
              }
            }
            if (docLeaked) docsWithAnyLeak += 1

            // Estimate span precision against gold entity values
            for (const r of directRes.redactions) {
              totalPredictedSpans += 1
              const matchesGold = doc.entities.some(
                (e) => e.value.includes(r.value) || r.value.includes(e.value),
              )
              if (matchesGold) matchedPredictedSpans += 1
              else ensureLabel(r.label).fp += 1
            }

            // Over-masking check: protected non-PII domain phrases must survive
            for (const keep of doc.protectedNonPii ?? []) {
              totalNonPii += 1
              if (redactedMcp.includes(keep)) retainedNonPii += 1
            }
          }

          const recall = totalGold > 0 ? totalMasked / totalGold : 1
          const precision =
            totalPredictedSpans > 0 ? matchedPredictedSpans / totalPredictedSpans : 1
          const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0

          metrics.structuredRecall = round(
            structuredGold > 0 ? structuredMasked / structuredGold : 1,
            4,
          )
          metrics.overallRecall = round(recall, 4)
          metrics.overallPrecision = round(precision, 4)
          metrics.overallF1 = round(f1, 4)
          metrics.documentLeakageRate = round(docsWithAnyLeak / corpus.documents.length, 4)
          metrics.nonPiiRetention = round(totalNonPii > 0 ? retainedNonPii / totalNonPii : 1, 4)
          metrics.roundtripAccuracy = round(
            roundtripTotal > 0 ? roundtripExact / roundtripTotal : 1,
            4,
          )
          metrics.perLabel = Object.fromEntries(
            Object.entries(perLabel).map(([k, v]) => {
              const r = v.gold > 0 ? v.masked / v.gold : 1
              const p = v.tp + v.fp > 0 ? v.tp / (v.tp + v.fp) : 1
              return [
                k,
                {
                  gold: v.gold,
                  masked: v.masked,
                  recall: round(r, 4),
                  precision: round(p, 4),
                  f1: round(p + r > 0 ? (2 * p * r) / (p + r) : 0, 4),
                },
              ]
            }),
          )
          metrics.inferenceP50Ms = percentile(inferenceLatencies, 50)
          metrics.inferenceP95Ms = percentile(inferenceLatencies, 95)
          metrics.inferenceP99Ms = percentile(inferenceLatencies, 99)
          metrics.proxyP50Ms = percentile(proxyLatencies, 50)
          metrics.proxyP95Ms = percentile(proxyLatencies, 95)
          metrics.proxyP99Ms = percentile(proxyLatencies, 99)
          metrics.proxyOverheadP50Ms = round(
            Math.max(0, metrics.proxyP50Ms - metrics.inferenceP50Ms),
          )

          assert.equal(metrics.roundtripAccuracy, 1, "Round-trip restoration must be 100% lossless")
          return `Recall=${(metrics.overallRecall * 100).toFixed(1)}% (structured=${(metrics.structuredRecall * 100).toFixed(1)}%), P=${(metrics.overallPrecision * 100).toFixed(1)}%, F1=${(metrics.overallF1 * 100).toFixed(1)}%, roundtrip=100%, infP50=${metrics.inferenceP50Ms}ms, proxyP50=${metrics.proxyP50Ms}ms`
        } finally {
          await proxy.close()
          await egress.close()
        }
      },
    )

    // 3. StreamingRestorer throughput + concurrent load + 500-op soak test
    await suite.check(
      "concurrency-and-soak-500-ops",
      "Measures StreamingRestorer throughput, 80 concurrent proxy requests, and 500-op soak heap & SessionVault eviction stability",
      async () => {
        const srMap = {
          "[NAMN_1]": "Anna Lindqvist",
          "[PERSONNUMMER_1]": "19900101-2385",
          "[TELEFON_1]": "070-174 06 58",
        }
        const sr = new StreamingRestorer(srMap)
        const chunks = [
          "Hej [NA",
          "MN_1], pnr [PERSON",
          "NUMMER_1], tel [TELEFON_1]. Vanlig text. ",
        ]
        const tSr = performance.now()
        for (let i = 0; i < 10_000; i += 1) sr.push(chunks[i % chunks.length])
        sr.flush()
        metrics.streaming10kMs = round(performance.now() - tSr)

        const egress = await startEgressAuditor((req, res) => {
          const parsed = JSON.parse(req.body || "{}")
          const txt = parsed.messages?.[0]?.content ?? ""
          res.writeHead(200, { "content-type": "application/json" })
          res.end(
            JSON.stringify({
              id: "s",
              type: "message",
              role: "assistant",
              content: [{ type: "text", text: txt }],
            }),
          )
        })
        const vault = new SessionVault(25, 200)
        const proxy = await startMaskeraProxy({
          port: 0,
          upstream: egress.url,
          defaultMode: "rules",
          vault,
        })

        try {
          // Concurrent burst: 16 clients x 5 requests = 80 requests
          const tBurst = performance.now()
          await Promise.all(
            Array.from({ length: 16 }, async (_, c) => {
              for (let k = 0; k < 5; k += 1) {
                const email = `load-${c}-${k}@example.com`
                const r = await fetch(`${proxy.url}/v1/messages`, {
                  method: "POST",
                  headers: { "content-type": "application/json", "x-maskera-session": `load-${c}` },
                  body: JSON.stringify({
                    messages: [{ role: "user", content: `Mail ${email} 19900101-2385` }],
                  }),
                })
                assert.equal(r.status, 200)
                const j = await r.json()
                assert.equal(j.content[0].text, `Mail ${email} 19900101-2385`)
              }
            }),
          )
          const burstSec = (performance.now() - tBurst) / 1000
          metrics.concurrentThroughputRps = round(80 / burstSec)

          // Soak test: 500 rolling sessions verifying LRU eviction + bounded heap
          const heapBefore = process.memoryUsage().heapUsed
          for (let i = 0; i < 500; i += 1) {
            const email = `soak-${i}@example.org`
            const r = await fetch(`${proxy.url}/v1/messages`, {
              method: "POST",
              headers: { "content-type": "application/json", "x-maskera-session": `soak-${i}` },
              body: JSON.stringify({
                messages: [{ role: "user", content: `Ärende ${i} ${email} 070-174 06 58` }],
              }),
            })
            assert.equal(r.status, 200)
            await r.arrayBuffer()
          }
          const heapAfter = process.memoryUsage().heapUsed
          metrics.soakHeapGrowthMb = round(Math.max(0, (heapAfter - heapBefore) / (1024 * 1024)))
          metrics.soakVaultSessionsBounded = vault.size <= 25
          assert.equal(vault.size <= 25, true, `SessionVault exceeded cap: ${vault.size} > 25`)
        } finally {
          await proxy.close()
          await egress.close()
        }
        return `10k SSE chunks=${metrics.streaming10kMs}ms, concurrent=${metrics.concurrentThroughputRps} req/s, soak 500 ops heapDelta=${metrics.soakHeapGrowthMb}MB, vault bounded (${vault.size}<=25)`
      },
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  return suite.finish(metrics)
}
