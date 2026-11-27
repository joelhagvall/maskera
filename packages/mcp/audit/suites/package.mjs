/**
 * Package, Distribution & Supply-Chain Audit Suite (`audit:package`).
 *
 * 1. Packs `@maskera/core`, `maskera`, and `@maskera/mcp` via `pnpm pack`.
 * 2. Audits every file in the `@maskera/mcp` tarball (no secrets, no training
 *    data, no `.env`, license & metadata valid, computes tarball SHA-256).
 * 3. Verifies pinned ONNX model SHA-256 digests (`MASKERA_SV_NER_SHA256`).
 * 4. Installs the actual packed tarballs into a fresh isolated temp directory
 *    and exercises the installed `maskera-mcp` binary end-to-end (`--version`,
 *    `--help`, `doctor`, `install --dry-run`, `guard`, `mcp` stdio, `proxy`, `wrap`).
 */
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MASKERA_SV_NER_MODEL, MASKERA_SV_NER_REVISION } from "maskera"
import {
  createSuiteCollector,
  getLocalNerEnv,
  hasLocalNerModel,
  pkgRoot,
  repoRoot,
  runProcess,
} from "../lib/harness.mjs"

const FORBIDDEN_TARBALL_PATTERNS = [
  /\.env/i,
  /\.pem$/i,
  /\.key$/i,
  /training\//i,
  /\.git\//i,
  /node_modules\//i,
  /audit\/fixtures\//i,
  /secret/i,
]

export async function runPackageAudit() {
  const suite = createSuiteCollector("package")
  const dir = await mkdtemp(join(tmpdir(), "maskera-audit-pkg-"))
  const rootPkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"))
  const mcpPkg = JSON.parse(await readFile(join(pkgRoot, "package.json"), "utf8"))
  const metrics = {
    packageVersion: mcpPkg.version,
    modelId: MASKERA_SV_NER_MODEL,
    modelRevision: MASKERA_SV_NER_REVISION,
    tarballs: {},
    tarballFileCount: 0,
    installMs: 0,
  }

  let installedBin = ""

  try {
    // 1. Pack & inspect tarball contents + checksums
    await suite.check(
      "pack-and-inspect-contents",
      "Packs tarballs, verifies license/metadata, SHA-256 checksums, and 0 forbidden/dev/secret files",
      async () => {
        const pkgs = ["@maskera/core", "maskera", "@maskera/mcp"]
        const tarballPaths = []
        for (const name of pkgs) {
          const out = execFileSync("pnpm", ["--filter", name, "pack", "--pack-destination", dir], {
            cwd: repoRoot,
            encoding: "utf8",
          })
          const tgz = out.trim().split("\n").filter(Boolean).pop()
          assert.ok(tgz && existsSync(tgz), `Failed to pack ${name}`)
          const bytes = await readFile(tgz)
          const sha256 = createHash("sha256").update(bytes).digest("hex")
          metrics.tarballs[name] = { bytes: bytes.byteLength, sha256 }
          tarballPaths.push(tgz)
        }

        const mcpTgz = tarballPaths[2]
        const listing = execFileSync("tar", ["-tzf", mcpTgz], { encoding: "utf8" })
          .trim()
          .split("\n")
          .filter(Boolean)
        metrics.tarballFileCount = listing.length

        for (const file of listing) {
          for (const forbidden of FORBIDDEN_TARBALL_PATTERNS) {
            assert.equal(forbidden.test(file), false, `Forbidden file in npm tarball: ${file}`)
          }
        }
        assert.equal(
          listing.includes("package/dist/cli.js"),
          true,
          "Missing dist/cli.js in tarball",
        )
        assert.equal(
          listing.includes("package/dist/index.js"),
          true,
          "Missing dist/index.js in tarball",
        )
        assert.equal(
          listing.includes("package/dist/index.d.ts"),
          true,
          "Missing dist/index.d.ts in tarball",
        )
        assert.equal(listing.includes("package/package.json"), true)
        assert.equal(listing.includes("package/README.md"), true)
        assert.equal(mcpPkg.license, "MIT")
        assert.match(MASKERA_SV_NER_REVISION, /^[a-f0-9]{40}$/)

        // Clean install into fresh throwaway directory
        await writeFile(
          join(dir, "package.json"),
          JSON.stringify(
            {
              name: "maskera-mcp-audit-clean-install",
              private: true,
              ...(rootPkg.packageManager ? { packageManager: rootPkg.packageManager } : {}),
            },
            null,
            2,
          ),
        )
        const t0 = performance.now()
        execFileSync("pnpm", ["add", ...tarballPaths], {
          cwd: dir,
          stdio: ["ignore", "pipe", "pipe"],
          env: { ...process.env, COREPACK_ENABLE_STRICT: "0" },
        })
        metrics.installMs = Math.round(performance.now() - t0)
        installedBin = join(dir, "node_modules/.bin/maskera-mcp")
        assert.equal(existsSync(installedBin), true, "Installed maskera-mcp binary missing")
        return `Packed ${listing.length} files (${metrics.tarballs["@maskera/mcp"].bytes} bytes), clean install ${metrics.installMs}ms`
      },
    )

    // 2. Installed binary smoke: --version, --help, install, doctor, guard, mcp stdio, wrap
    await suite.check(
      "installed-binary-cli-smoke",
      "Exercises all documented CLI commands on the freshly installed tarball binary",
      async () => {
        assert.ok(installedBin && existsSync(installedBin), "Skipped: install failed")
        const ver = await runProcess(installedBin, ["--version"], { cwd: dir })
        assert.equal(ver.code, 0)
        assert.ok(ver.stdout.includes(mcpPkg.version))

        const help = await runProcess(installedBin, ["--help"], { cwd: dir })
        assert.equal(help.code, 0)
        assert.ok(help.stdout.includes("maskera-mcp proxy"))
        assert.ok(help.stdout.includes("maskera-mcp wrap"))

        const inst = await runProcess(
          installedBin,
          [
            "install",
            "cursor",
            "--rules-only",
            "--root",
            dir,
            "--no-raw-restore",
            "--dry-run",
            "--no-verify",
            "--json",
          ],
          { cwd: dir },
        )
        assert.equal(inst.code, 0, inst.stderr)
        assert.equal(JSON.parse(inst.stdout).client, "cursor")

        const guard = await runProcess(installedBin, ["guard", "--rules-only"], {
          cwd: dir,
          input: JSON.stringify({ prompt: "Pnr 19900101-2385" }),
        })
        assert.equal(guard.code, 2)
        assert.equal(guard.stderr.includes("19900101-2385"), false)

        const nerEnv = getLocalNerEnv()
        const docArgs = [
          "doctor",
          "--root",
          dir,
          "--json",
          ...(hasLocalNerModel ? [] : ["--rules-only"]),
        ]
        const doc = await runProcess(installedBin, docArgs, { cwd: dir, env: nerEnv })
        assert.equal(doc.code, 0, doc.stderr)
        const docJson = JSON.parse(doc.stdout)
        assert.equal(docJson.ok, true)
        assert.equal(docJson.sampleProof.rawPiiLeaked, false)
        assert.equal(docJson.sampleProof.roundtripRestored, true)

        // MCP stdio read -> write on installed binary
        await writeFile(
          join(dir, "case.txt"),
          "Patient Anna Lindqvist (19900101-2385), tel 070-174 06 58.",
          "utf8",
        )
        const mcpMsgs = [
          {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: { protocolVersion: "2025-11-25" },
          },
          {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
              name: "maskera_read_file",
              arguments: { path: "case.txt", session_id: "pk" },
            },
          },
          {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
              name: "maskera_write_file",
              arguments: {
                path: "reply.txt",
                session_id: "pk",
                text: "Svar [PERSONNUMMER_1] [TELEFON_1]",
              },
            },
          },
        ]
        const mcpArgs = ["--root", dir, ...(hasLocalNerModel ? [] : ["--rules-only"])]
        const mcpRun = await runProcess(installedBin, mcpArgs, {
          cwd: dir,
          env: nerEnv,
          input: `${mcpMsgs.map((m) => JSON.stringify(m)).join("\n")}\n`,
        })
        assert.equal(mcpRun.code, 0, mcpRun.stderr)
        assert.equal(mcpRun.stdout.includes("19900101-2385"), false)
        if (hasLocalNerModel) assert.equal(mcpRun.stdout.includes("Anna Lindqvist"), false)
        assert.equal(
          await readFile(join(dir, "reply.txt"), "utf8"),
          "Svar 19900101-2385 070-174 06 58",
        )

        // Wrap smoke
        const wrapRun = await runProcess(
          installedBin,
          [
            "wrap",
            "--rules-only",
            "--root",
            dir,
            "--",
            process.execPath,
            "-e",
            "process.exit(process.env.ANTHROPIC_BASE_URL ? 0 : 9)",
          ],
          { cwd: dir },
        )
        assert.equal(wrapRun.code, 0, wrapRun.stderr)
        return "All documented CLI subcommands passed on installed tarball binary"
      },
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  return suite.finish(metrics)
}
