#!/usr/bin/env node
/**
 * `pnpm release`: the whole npm release, from the version-bump commit to every
 * sibling that pins Maskera's versions, so nothing after the 2FA prompt is a
 * manual step.
 *
 *   1. Refuse an uncommitted version bump (a tag must point at the bump).
 *   2. Sync the sibling product contracts and hagvall-labs' maskeraVersion into
 *      their working trees, so `check:product` passes before anything exists
 *      on npm (it reads the working trees).
 *   3. `pnpm build` (benchmark and product checks included).
 *   4. `pnpm audit:full -- --release`: the @maskera/mcp release gates, where
 *      every gate must PASS on this machine with the real CLI agents, and the
 *      committed audit evidence (`pnpm audit:evidence`) must name the
 *      @maskera/mcp version and model revision being released.
 *   5. `changeset publish` (interactive npm 2FA).
 *   5. Verify that every release tag points at a package.json with its version,
 *      then push those tags.
 *   6. Wait until the registry serves each new version.
 *   7. Deliver each sibling through its own git hooks: maskera-extension's
 *      contract; maskera-cloud's dependency ranges, bun.lock and vendored
 *      contracts; hagvall-labs' maskeraVersion, then its Deploy workflow once
 *      CI passed on that commit.
 *
 * `--after-publish` resumes at step 6 when the publish itself already ran.
 * A sibling whose release files already hold someone else's uncommitted
 * changes is skipped with a message: this script never sweeps them up.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  AUDIT_FILES,
  auditSummaryIsCurrent,
  contractMatchesReport,
} from "../../packages/mcp/audit/summary.mjs"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const PARENT = resolve(ROOT, "..")
const PACKAGES = [
  { name: "@maskera/core", dir: "packages/core", key: "core" },
  { name: "maskera", dir: "packages/ner", key: "maskera" },
  { name: "@maskera/mcp", dir: "packages/mcp", key: "mcp" },
]
const CLOUD_DEPENDENCY_FILES = ["apps/gateway/package.json", "packages/runtime/package.json"]
const CLOUD_MODEL_FILES = [
  "apps/gateway/model-manifest.json",
  "apps/gateway/Dockerfile",
  "docs/gateway/benchmark.md",
]
const EXTENSION_SYNC_FILES = [
  "package.json",
  "bun.lock",
  "src/manifest.json",
  "src/shared/model-config.ts",
  "scripts/prepare-store-model.ts",
  "docs/maskera-product-contract.json",
]
const REGISTRY_WAIT_MS = 30 * 60 * 1000
const CI_WAIT_MS = 60 * 60 * 1000

/** Rewrites `"maskera": "^x.y.z"` dependency ranges to the released version. */
export function bumpMaskeraRange(packageJsonText, version) {
  return packageJsonText.replace(/("maskera":\s*")\^?[0-9][^"]*(")/g, `$1^${version}$2`)
}

/** Rewrites `"@maskera/core": "^x.y.z"` dependency ranges to the released version. */
export function bumpCoreRange(packageJsonText, version) {
  return packageJsonText.replace(/("@maskera\/core":\s*")\^?[0-9][^"]*(")/g, `$1^${version}$2`)
}

/** Rewrites hagvall-labs' `export const maskeraVersion = '…'`. */
export function bumpHagvallVersion(seoText, version) {
  return seoText.replace(
    /(export const maskeraVersion = ['"])[^'"]+(['"])/,
    (_match, open, close) => `${open}${version}${close}`,
  )
}

/** Rewrites `export const EXTENSION_ZIP_VERSION = "…"` in apps/demo/src/extensionBrowsers.ts. */
export function bumpExtensionZipVersion(browsersText, version) {
  return browsersText.replace(
    /(export const EXTENSION_ZIP_VERSION = ["'])[^"']+(["'])/,
    (_match, open, close) => `${open}${version}${close}`,
  )
}

/**
 * Checks whether any package whose current version already has a published git
 * tag modified its README.md without bumping package.json. Catching this before
 * `changeset publish` prevents Vercel's `check-benchmark-live` from failing on
 * stale npm READMEs.
 */
export function findUnbumpedReadmeChanges(tags, { tagExists, readTagFile, readHeadFile }) {
  const problems = []
  for (const { name, dir, tag } of tags) {
    if (!tagExists(tag)) continue
    const readmePath = `${dir}/README.md`
    const taggedReadme = readTagFile(tag, readmePath)
    const currentReadme = readHeadFile(readmePath)
    if (taggedReadme !== currentReadme) {
      problems.push(
        `${readmePath} changed since ${tag}; bump ${name} before releasing so npm README stays synchronized`,
      )
    }
  }
  return problems
}

/** Parses the trailing JSON object emitted by `maskera-extension`'s `bun run sync:model --json`. */
export function parseSyncModelResult(stdout) {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith("{") && lines[i].endsWith("}")) {
      return JSON.parse(lines[i])
    }
  }
  throw new Error(`sync:model --json produced no JSON payload:\n${stdout}`)
}

const RELEASE_AUDIT_REPORT = "tmp/mcp-release-audit.json"

/** `MASKERA_SV_NER_REVISION` in `packages/ner/src/index.ts`: the Hub sha npm users get. */
export function parseModelRevision(nerIndexText) {
  const match = nerIndexText.match(/MASKERA_SV_NER_REVISION\s*=\s*"([0-9a-f]{40})"/)
  if (!match) throw new Error("MASKERA_SV_NER_REVISION not found in packages/ner/src/index.ts")
  return match[1]
}

/**
 * Problems with the committed audit evidence for a release: audit-results.json
 * must come from a passing `--release` run of the full lane on the
 * @maskera/mcp version and model revision being published, and AUDIT.md's
 * generated block must match it.
 */
export function findAuditEvidenceProblems(
  report,
  auditMd,
  contract,
  { mcpVersion, modelRevision },
) {
  const problems = []
  const where = "packages/mcp/audit-results.json"
  if (report.lane !== "full") problems.push(`${where} is from the ${report.lane} lane, not full`)
  if (report.releaseGates?.release !== true || report.releaseGates?.passed !== true) {
    problems.push(`${where} is not a passing --release run`)
  }
  if (report.packageVersion !== mcpVersion) {
    problems.push(`${where} audited @maskera/mcp@${report.packageVersion}, releasing ${mcpVersion}`)
  }
  if (report.model?.revision !== modelRevision) {
    problems.push(`${where} audited model ${report.model?.revision}, releasing ${modelRevision}`)
  }
  if (!contractMatchesReport(report, contract)) {
    problems.push(
      `docs/benchmark-release.json pins model ${contract.artifact?.revision}, ${where} audited ${report.model?.revision}`,
    )
  }
  if (!auditSummaryIsCurrent(auditMd, report, contract)) {
    problems.push("packages/mcp/AUDIT.md's generated block does not match audit-results.json")
  }
  return problems
}

/** The release tags changesets creates for the given package versions. */
export function releaseTags(versions) {
  return PACKAGES.map((pkg) => ({ ...pkg, tag: `${pkg.name}@${versions[pkg.key]}` }))
}

function run(command, args, cwd = ROOT, { capture = false, allowFail = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  })
  if (result.error) throw result.error
  if (result.status !== 0 && !allowFail) {
    const detail = capture ? `\n${result.stderr || result.stdout}` : ""
    throw new Error(
      `${command} ${args.join(" ")} failed in ${cwd} (status ${result.status})${detail}`,
    )
  }
  return capture ? result.stdout.trimEnd() : result.status
}

const git = (cwd, ...args) => run("git", args, cwd, { capture: true })
const step = (title) => console.log(`\n=== release: ${title} ===`)
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

function versions() {
  return Object.fromEntries(
    PACKAGES.map((pkg) => [
      pkg.key,
      JSON.parse(readFileSync(join(ROOT, pkg.dir, "package.json"), "utf8")).version,
    ]),
  )
}

/**
 * Paths in `git status --porcelain` output. The two status columns can start
 * with a space (" M path"), so the text must not be trimmed before parsing.
 */
export function parsePorcelain(text) {
  return text
    .split("\n")
    .filter((line) => line.length > 3)
    .map((line) => line.slice(3))
}

/** Paths with uncommitted changes in a sibling, relative to its root. */
function dirtyPaths(cwd) {
  return parsePorcelain(git(cwd, "status", "--porcelain"))
}

function syncSiblingWorkingTrees(version) {
  for (const sibling of ["maskera-cloud", "maskera-extension"]) {
    const cwd = join(PARENT, sibling)
    if (existsSync(cwd)) run("bun", ["run", "sync:product"], cwd)
  }
  const seo = join(PARENT, "hagvall-labs", "src", "seo.ts")
  if (existsSync(seo)) writeFileSync(seo, bumpHagvallVersion(readFileSync(seo, "utf8"), version))
}

function verifyAndPushTags(tags) {
  for (const { tag, dir } of tags) {
    const pkg = JSON.parse(git(ROOT, "show", `${tag}:${dir}/package.json`))
    const expected = tag.slice(tag.lastIndexOf("@") + 1)
    if (pkg.version !== expected) throw new Error(`${tag} points at version ${pkg.version}`)
    // An ancestor, not HEAD itself: --after-publish may run after later commits.
    if (run("git", ["merge-base", "--is-ancestor", tag, "HEAD"], ROOT, { allowFail: true }) !== 0) {
      throw new Error(`${tag} is not in the history of HEAD`)
    }
  }
  run("git", ["push", "origin", ...tags.map(({ tag }) => tag)])
}

async function waitForRegistry(tags) {
  const deadline = Date.now() + REGISTRY_WAIT_MS
  for (const { tag } of tags) {
    const at = tag.lastIndexOf("@")
    const url = `https://registry.npmjs.org/${tag.slice(0, at).replace("/", "%2f")}/${tag.slice(at + 1)}`
    while ((await fetch(url)).status !== 200) {
      if (Date.now() > deadline) throw new Error(`${tag} is still not on npm after 30 minutes`)
      await sleep(20_000)
    }
    console.log(`${tag} is on npm`)
  }
}

/** Commits exactly `paths` in a sibling, refusing paths that were dirty before. */
function deliver(sibling, paths, message, dirtyBefore) {
  const cwd = join(PARENT, sibling)
  const foreign = paths.filter((path) => dirtyBefore.includes(path))
  if (foreign.length > 0) {
    console.log(`${sibling}: skipped, uncommitted changes from elsewhere in ${foreign.join(", ")}`)
    return false
  }
  const changed = paths.filter((path) => dirtyPaths(cwd).includes(path))
  if (changed.length === 0) {
    console.log(`${sibling}: already in sync`)
    return true
  }
  run("git", ["add", "--", ...changed], cwd)
  run("git", ["commit", "-m", message, "--", ...changed], cwd)
  run("git", ["push", "origin", "HEAD"], cwd)
  return true
}

async function deployHagvallLabs() {
  const cwd = join(PARENT, "hagvall-labs")
  const sha = git(cwd, "rev-parse", "HEAD")
  const repo = "joelhagvall/hagvall-labs"
  const deadline = Date.now() + CI_WAIT_MS
  for (;;) {
    const runs = JSON.parse(
      run(
        "gh",
        [
          "run",
          "list",
          "-R",
          repo,
          "--workflow",
          "ci.yml",
          "--commit",
          sha,
          "--json",
          "status,conclusion",
        ],
        cwd,
        {
          capture: true,
        },
      ) || "[]",
    )
    const done = runs.find((entry) => entry.status === "completed")
    if (done?.conclusion === "success") break
    if (done) throw new Error(`hagvall-labs CI ${done.conclusion} on ${sha}; not deploying`)
    if (Date.now() > deadline)
      throw new Error(`hagvall-labs CI did not finish on ${sha} within an hour`)
    await sleep(30_000)
  }
  run(
    "gh",
    ["workflow", "run", "deploy.yml", "-R", repo, "--ref", "master", "-f", `release_sha=${sha}`],
    cwd,
  )
  console.log(`hagvall-labs: Deploy dispatched for ${sha}`)
}

async function main() {
  const afterPublish = process.argv.includes("--after-publish")
  const released = versions()
  const tags = releaseTags(released)
  const label = tags.map(({ tag }) => tag).join(", ")

  if (
    git(ROOT, "status", "--porcelain", "--", ...PACKAGES.map((pkg) => `${pkg.dir}/package.json`))
  ) {
    throw new Error("commit the version bump before releasing: a tag must point at it")
  }
  if (git(ROOT, "status", "--porcelain", "--", AUDIT_FILES.report, AUDIT_FILES.summary)) {
    throw new Error(
      "commit packages/mcp/audit-results.json and AUDIT.md before releasing: the audit evidence must be in the released commit",
    )
  }

  if (!afterPublish) {
    const readmeDrift = findUnbumpedReadmeChanges(tags, {
      tagExists: (tag) =>
        run("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], ROOT, {
          allowFail: true,
        }) === 0,
      readTagFile: (tag, filePath) => git(ROOT, "show", `${tag}:${filePath}`),
      readHeadFile: (filePath) => readFileSync(join(ROOT, filePath), "utf8").trimEnd(),
    })
    if (readmeDrift.length > 0) {
      throw new Error(`unbumped README drift:\n- ${readmeDrift.join("\n- ")}`)
    }

    const auditProblems = findAuditEvidenceProblems(
      JSON.parse(readFileSync(AUDIT_FILES.report, "utf8")),
      readFileSync(AUDIT_FILES.summary, "utf8"),
      JSON.parse(readFileSync(AUDIT_FILES.contract, "utf8")),
      {
        mcpVersion: released.mcp,
        modelRevision: parseModelRevision(
          readFileSync(join(ROOT, "packages/ner/src/index.ts"), "utf8"),
        ),
      },
    )
    if (auditProblems.length > 0) {
      throw new Error(
        `stale @maskera/mcp audit evidence:\n- ${auditProblems.join("\n- ")}\n` +
          "run `pnpm build && pnpm audit:evidence` and commit packages/mcp/audit-results.json " +
          "and packages/mcp/AUDIT.md before releasing",
      )
    }
  }

  const siblings = ["maskera-cloud", "maskera-extension", "hagvall-labs"].filter((name) =>
    existsSync(join(PARENT, name)),
  )
  const dirtyBefore = Object.fromEntries(
    siblings.map((name) => [name, dirtyPaths(join(PARENT, name))]),
  )

  if (!afterPublish) {
    step("sync sibling working trees")
    syncSiblingWorkingTrees(released.maskera)
    step("build")
    run("pnpm", ["build"])
    step("@maskera/mcp release gates")
    run("pnpm", ["audit:full", "--", "--release", "--out", RELEASE_AUDIT_REPORT])
    step("publish (npm 2FA)")
    run("pnpm", ["exec", "changeset", "publish"])
  } else {
    syncSiblingWorkingTrees(released.maskera)
  }

  step(`verify and push tags ${label}`)
  verifyAndPushTags(tags)
  step("wait for npm")
  await waitForRegistry(tags)

  const message = `Follow Maskera ${label}`
  if (siblings.includes("maskera-extension")) {
    step("maskera-extension")
    const cwd = join(PARENT, "maskera-extension")
    const foreign = EXTENSION_SYNC_FILES.filter((path) =>
      dirtyBefore["maskera-extension"].includes(path),
    )
    const ownContract = foreign.length === 1 && foreign[0] === "docs/maskera-product-contract.json"
    let syncResult = { changed: false, version: null, changedFiles: [] }
    if (foreign.length === 0 || ownContract) {
      const syncOut = run(
        "bun",
        [
          "run",
          "sync:model",
          "--json",
          "--core-version",
          released.core,
          "--maskera-version",
          released.maskera,
        ],
        cwd,
        { capture: true },
      )
      syncResult = parseSyncModelResult(syncOut)
      if (syncResult.changed) {
        run("bun", ["install"], cwd)
        run("bun", ["run", "check"], cwd)
      }
    }
    const before = dirtyBefore["maskera-extension"].filter(
      (path) => path !== "docs/maskera-product-contract.json",
    )
    const delivered = deliver("maskera-extension", EXTENSION_SYNC_FILES, message, before)
    if (delivered && syncResult.changed && syncResult.version) {
      step(`maskera-extension release --upload (${syncResult.version})`)
      run("bun", ["run", "release", "--upload"], cwd)
      const browsersFile = join(ROOT, "apps/demo/src/extensionBrowsers.ts")
      const beforeBrowsers = readFileSync(browsersFile, "utf8")
      const afterBrowsers = bumpExtensionZipVersion(beforeBrowsers, syncResult.version)
      if (afterBrowsers !== beforeBrowsers) {
        writeFileSync(browsersFile, afterBrowsers)
        console.log(
          `maskera: updated apps/demo/src/extensionBrowsers.ts to EXTENSION_ZIP_VERSION = "${syncResult.version}" (run \`pnpm run prova\` then commit & push)`,
        )
      }
    }
  }
  if (siblings.includes("maskera-cloud")) {
    step("maskera-cloud")
    const cwd = join(PARENT, "maskera-cloud")
    const paths = [
      ...CLOUD_DEPENDENCY_FILES,
      ...CLOUD_MODEL_FILES,
      "bun.lock",
      "docs/maskera-product-contract.json",
      "docs/maskera-benchmark-release.json",
      "apps/web/public/maskera-benchmark-release.json",
    ]
    const foreign = paths.filter((path) => dirtyBefore["maskera-cloud"].includes(path))
    const ownContract = foreign.length === 1 && foreign[0] === "docs/maskera-product-contract.json"
    if (foreign.length === 0 || ownContract) {
      for (const file of CLOUD_DEPENDENCY_FILES) {
        const path = join(cwd, file)
        const updated = bumpCoreRange(
          bumpMaskeraRange(readFileSync(path, "utf8"), released.maskera),
          released.core,
        )
        writeFileSync(path, updated)
      }
      run("bun", ["install"], cwd)
      run("bun", ["run", "sync:benchmarks"], cwd)
      run("bun", ["run", "sync:model"], cwd)
      run("bun", ["run", "check:benchmarks"], cwd)
      run("bun", ["run", "check:product"], cwd)
    }
    // The contract this script synced in step 2 is its own change, not foreign.
    const before = dirtyBefore["maskera-cloud"].filter(
      (path) => path !== "docs/maskera-product-contract.json",
    )
    deliver("maskera-cloud", paths, message, before)
  }
  if (siblings.includes("hagvall-labs")) {
    step("hagvall-labs")
    const before = dirtyBefore["hagvall-labs"].filter((path) => path !== "src/seo.ts")
    if (deliver("hagvall-labs", ["src/seo.ts"], message, before)) await deployHagvallLabs()
  }
  step(`done: ${label}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`release FAILED: ${error.message}`)
    process.exit(1)
  })
}
