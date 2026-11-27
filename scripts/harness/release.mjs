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
 *   4. `changeset publish` (interactive npm 2FA).
 *   5. Verify that every release tag points at a package.json with its version,
 *      then push those tags.
 *   6. Wait until the registry serves each new version.
 *   7. Deliver each sibling through its own git hooks: maskera-extension's
 *      contract; maskera-cloud's dependency ranges, bun.lock and vendored
 *      contracts; hagvall-labs' maskeraVersion, then its Deploy workflow once
 *      CI passed on that commit.
 *
 * `--after-publish` resumes at step 5 when the publish itself already ran.
 * A sibling whose release files already hold someone else's uncommitted
 * changes is skipped with a message: this script never sweeps them up.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..")
const PARENT = resolve(ROOT, "..")
const PACKAGES = [
  { name: "@maskera/core", dir: "packages/core", key: "core" },
  { name: "maskera", dir: "packages/ner", key: "maskera" },
  { name: "@maskera/mcp", dir: "packages/mcp", key: "mcp" },
]
const CLOUD_DEPENDENCY_FILES = ["apps/gateway/package.json", "packages/runtime/package.json"]
const REGISTRY_WAIT_MS = 30 * 60 * 1000
const CI_WAIT_MS = 60 * 60 * 1000

/** Rewrites `"maskera": "^x.y.z"` dependency ranges to the released version. */
export function bumpMaskeraRange(packageJsonText, version) {
  return packageJsonText.replace(/("maskera":\s*")\^?[0-9][^"]*(")/g, `$1^${version}$2`)
}

/** Rewrites hagvall-labs' `export const maskeraVersion = '…'`. */
export function bumpHagvallVersion(seoText, version) {
  return seoText.replace(
    /(export const maskeraVersion = ['"])[^'"]+(['"])/,
    (_match, open, close) => `${open}${version}${close}`,
  )
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
  return capture ? result.stdout.trim() : result.status
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

/** Paths with uncommitted changes in a sibling, relative to its root. */
function dirtyPaths(cwd) {
  return git(cwd, "status", "--porcelain")
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3))
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
  const head = git(ROOT, "rev-parse", "HEAD")
  for (const { tag, dir } of tags) {
    const pkg = JSON.parse(git(ROOT, "show", `${tag}:${dir}/package.json`))
    const expected = tag.slice(tag.lastIndexOf("@") + 1)
    if (pkg.version !== expected) throw new Error(`${tag} points at version ${pkg.version}`)
    if (git(ROOT, "rev-list", "-n1", tag) !== head) throw new Error(`${tag} is not on HEAD ${head}`)
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
    deliver(
      "maskera-extension",
      ["docs/maskera-product-contract.json"],
      message,
      dirtyBefore["maskera-extension"],
    )
  }
  if (siblings.includes("maskera-cloud")) {
    step("maskera-cloud")
    const cwd = join(PARENT, "maskera-cloud")
    const paths = [
      ...CLOUD_DEPENDENCY_FILES,
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
        writeFileSync(path, bumpMaskeraRange(readFileSync(path, "utf8"), released.maskera))
      }
      run("bun", ["install"], cwd)
      run("bun", ["run", "sync:benchmarks"], cwd)
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
