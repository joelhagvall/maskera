#!/usr/bin/env node
/**
 * Clean tarball pack smoke test for `@maskera/mcp`:
 *   1. Packs `@maskera/core`, `maskera`, and `@maskera/mcp` via `pnpm pack`
 *   2. Installs the tarballs into a fresh throwaway project
 *   3. Verifies the installed `maskera-mcp` binary (`--version`, `guard`, and
 *      MCP stdio `maskera_read_file` -> `maskera_write_file` with ONNX NER)
 *
 * Usage:
 *   node scripts/pack-smoke.mjs            # uses local ONNX model if present
 *   node scripts/pack-smoke.mjs --cold-hf  # downloads pinned model cold from Hugging Face
 */

import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  hasLocalNerModel,
  installPackedTarballs,
  localModelId,
  localModelsDir,
  packWorkspaceTarballs,
  pkgRoot,
} from "../audit/lib/harness.mjs"

const coldHf = process.argv.includes("--cold-hf")

const mcpPkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"))

const dir = mkdtempSync(join(tmpdir(), "maskera-mcp-pack-"))
try {
  const packed = packWorkspaceTarballs(dir)
  const { installMs, binPath } = installPackedTarballs(dir, packed, {
    packageName: "maskera-mcp-pack-smoke",
  })

  const ver = spawnSync(binPath, ["--version"], { cwd: dir, encoding: "utf8" })
  assert.equal(ver.status, 0, `--version failed: ${ver.stderr}`)
  assert.equal(ver.stdout.includes(mcpPkg.version), true, `unexpected --version: ${ver.stdout}`)

  const grd = spawnSync(binPath, ["guard", "--rules-only"], {
    cwd: dir,
    input: JSON.stringify({ prompt: "Ring 070-174 06 58 om 19900101-2385" }),
    encoding: "utf8",
  })
  assert.equal(grd.status, 2, `expected guard exit 2, got ${grd.status}`)
  assert.equal(grd.stderr.includes("070-174 06 58"), false, "guard leaked phone to stderr")

  writeFileSync(
    join(dir, "case.txt"),
    "Patient Anna Lindqvist (19900101-2385) i Uppsala, tel 070-174 06 58.",
    "utf8",
  )
  const msgs = `${[
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "maskera_read_file", arguments: { path: "case.txt", session_id: "pk1" } },
    },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "maskera_write_file",
        arguments: {
          path: "out.txt",
          session_id: "pk1",
          text: "Svar till [NAMN_1] i [PLATS_1]: [PERSONNUMMER_1], [TELEFON_1].",
        },
      },
    },
  ]
    .map((m) => JSON.stringify(m))
    .join("\n")}\n`

  const useLocalModel = !coldHf && hasLocalNerModel
  const mcpEnv = useLocalModel
    ? {
        ...process.env,
        MASKERA_MODEL_PATH: localModelsDir,
        MASKERA_MODEL_ID: localModelId,
        MASKERA_ALLOW_REMOTE_MODELS: "0",
      }
    : {
        ...process.env,
        MASKERA_CACHE_DIR: join(dir, ".hf-cache"),
      }

  const tMcp = Date.now()
  const mcp = spawnSync(binPath, ["--root", dir], {
    cwd: dir,
    input: msgs,
    encoding: "utf8",
    env: mcpEnv,
    timeout: 90_000,
  })
  const mcpMs = Date.now() - tMcp
  assert.equal(mcp.status, 0, `MCP run failed (${mcp.status}):\n${mcp.stderr}\n${mcp.stdout}`)
  assert.equal(mcp.stdout.includes("Anna Lindqvist"), false, "name leaked to MCP stdout")
  assert.equal(mcp.stdout.includes("19900101-2385"), false, "personnummer leaked to MCP stdout")

  const disk = readFileSync(join(dir, "out.txt"), "utf8")
  assert.equal(
    disk,
    "Svar till Anna Lindqvist i Uppsala: 19900101-2385, 070-174 06 58.",
    `unexpected restored file: ${disk}`,
  )

  const receiptFile = join(dir, "setup-receipt.json")
  const doc = spawnSync(binPath, ["doctor", "--root", dir, "--receipt", receiptFile, "--json"], {
    cwd: dir,
    encoding: "utf8",
    env: mcpEnv,
    timeout: 90_000,
  })
  assert.equal(doc.status, 0, `doctor failed (${doc.status}):\n${doc.stderr}\n${doc.stdout}`)
  const receiptRaw = readFileSync(receiptFile, "utf8")
  assert.equal(receiptRaw.includes("Anna Lindqvist"), false, "receipt leaked name")
  assert.equal(receiptRaw.includes("19900101-2385"), false, "receipt leaked personnummer")
  const receipt = JSON.parse(receiptRaw)
  assert.equal(receipt.schema, "maskera-setup-receipt/v1")
  assert.equal(receipt.ok, true)
  assert.equal(receipt.sampleProof?.modeUsed, "hybrid")
  assert.equal(receipt.sampleProof?.rawPiiLeaked, false)
  assert.equal(receipt.sampleProof?.roundtripRestored, true)

  console.log(
    `@maskera/mcp pack-smoke PASS: v${mcpPkg.version} (install=${installMs}ms, mcp=${mcpMs}ms, model=${useLocalModel ? "local-onnx" : "cold-hf"})`,
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}
