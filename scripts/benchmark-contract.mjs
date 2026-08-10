import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"

export const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))
export const contractPath = resolve(repoRoot, "docs/benchmark-release.json")

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"))
}

export async function sha256File(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex")
}

export async function sha256FileSet(paths, root = repoRoot) {
  const hash = createHash("sha256")
  for (const path of [...paths].sort()) {
    hash.update(path)
    hash.update("\0")
    hash.update(await readFile(resolve(root, path)))
    hash.update("\0")
  }
  return hash.digest("hex")
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    )
  }
  return value
}

export function sha256Json(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex")
}

function resolvedDependency(importer, dependencyName) {
  for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const dependency = importer?.[section]?.[dependencyName]
    if (dependency) return { section, ...dependency }
  }
  return undefined
}

function npmAlias(version) {
  if (!version.startsWith("npm:")) return undefined
  const target = version.slice(4)
  const separator = target.lastIndexOf("@")
  if (separator <= 0) throw new Error(`invalid npm alias resolution ${version}`)
  return { name: target.slice(0, separator), version: target.slice(separator + 1) }
}

function baseVersion(version) {
  const peerSuffix = version.indexOf("(")
  return peerSuffix < 0 ? version : version.slice(0, peerSuffix)
}

function canonicalVersion(version, ignoredPeers) {
  if (typeof version !== "string") return version
  const firstSuffix = version.indexOf("(")
  if (firstSuffix < 0) return version
  const base = version.slice(0, firstSuffix)
  const suffixes = [...version.slice(firstSuffix).matchAll(/\(([^()]*)\)/g)]
    .map((match) => match[1])
    .filter((suffix) => !ignoredPeers.some((peer) => suffix.startsWith(`${peer}@`)))
    .map((suffix) => `(${suffix})`)
    .join("")
  return `${base}${suffixes}`
}

function canonicalSnapshot(snapshot, ignoredPeers) {
  const canonical = structuredClone(snapshot)
  for (const section of ["dependencies", "optionalDependencies"]) {
    if (!canonical[section]) continue
    canonical[section] = Object.fromEntries(
      Object.entries(canonical[section])
        .filter(([name]) => !ignoredPeers.includes(name))
        .map(([name, version]) => [name, canonicalVersion(version, ignoredPeers)]),
    )
  }
  if (canonical.transitivePeerDependencies) {
    canonical.transitivePeerDependencies = canonical.transitivePeerDependencies.filter(
      (peer) => !ignoredPeers.includes(peer),
    )
    if (canonical.transitivePeerDependencies.length === 0) {
      delete canonical.transitivePeerDependencies
    }
  }
  return canonical
}

function matchingOverrides(overrides, dependencyNames) {
  return Object.fromEntries(
    Object.entries(overrides ?? {}).filter(([selector]) =>
      [...dependencyNames].some((name) => selector === name || selector.startsWith(`${name}@`)),
    ),
  )
}

/**
 * Return the exact resolved dependency closure used to build and execute the
 * published evaluation. The contract selects importer roots deliberately, so
 * unrelated monorepo tooling can move without pretending that the measured
 * model, scorer or runtime environment changed.
 */
export async function evaluationEnvironmentSnapshot(
  environment,
  { root = repoRoot, lockfilePath } = {},
) {
  const packageManifest = await readJson(resolve(root, "package.json"))
  const absoluteLockfile = lockfilePath ?? resolve(root, environment.lockfile)
  const lockfile = YAML.parse(await readFile(absoluteLockfile, "utf8"))
  const ignoredPeers = environment.ignoredPeers ?? []
  const selectedImporters = {}
  const resolvedPackages = {}
  const dependencyNames = new Set()
  const packageKeys = new Set()
  const queued = new Set()
  const queue = []

  function enqueue(name, version) {
    if (
      typeof version !== "string" ||
      version.startsWith("link:") ||
      version.startsWith("workspace:")
    ) {
      return
    }
    const alias = npmAlias(version)
    const resolvedName = alias?.name ?? name
    const resolvedVersion = alias?.version ?? version
    const key = `${resolvedName}@${resolvedVersion}`
    if (queued.has(key)) return
    queued.add(key)
    queue.push({ key, name: resolvedName, version: resolvedVersion })
  }

  for (const [importerName, dependencyList] of Object.entries(environment.selectors).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const importer = lockfile.importers?.[importerName]
    if (!importer)
      throw new Error(`evaluation importer ${importerName} is missing from the lockfile`)
    const selected = {}
    for (const dependencyName of [...dependencyList].sort()) {
      const dependency = resolvedDependency(importer, dependencyName)
      if (!dependency) {
        throw new Error(
          `evaluation dependency ${dependencyName} is missing from importer ${importerName}`,
        )
      }
      selected[dependencyName] = {
        ...dependency,
        version: canonicalVersion(dependency.version, ignoredPeers),
      }
      enqueue(dependencyName, dependency.version)
    }
    selectedImporters[importerName] = selected
  }

  while (queue.length > 0) {
    const { key, name, version } = queue.shift()
    const snapshot = lockfile.snapshots?.[key]
    if (!snapshot) throw new Error(`evaluation dependency snapshot ${key} is missing`)
    const packageKey = `${name}@${baseVersion(version)}`
    const packageRecord = lockfile.packages?.[packageKey]
    if (!packageRecord) throw new Error(`evaluation package resolution ${packageKey} is missing`)

    dependencyNames.add(name)
    packageKeys.add(packageKey)
    const canonicalKey = `${name}@${canonicalVersion(version, ignoredPeers)}`
    resolvedPackages[canonicalKey] = {
      package: packageRecord,
      snapshot: canonicalSnapshot(snapshot, ignoredPeers),
    }
    for (const section of ["dependencies", "optionalDependencies"]) {
      for (const [dependencyName, dependencyVersion] of Object.entries(
        snapshot[section] ?? {},
      ).sort(([left], [right]) => left.localeCompare(right))) {
        if (ignoredPeers.includes(dependencyName)) continue
        enqueue(dependencyName, dependencyVersion)
      }
    }
  }

  const patchedDependencies = Object.fromEntries(
    Object.entries(lockfile.patchedDependencies ?? {}).filter(([key]) => packageKeys.has(key)),
  )

  if (packageManifest.packageManager !== environment.packageManager) {
    throw new Error(
      `evaluation package manager is ${packageManifest.packageManager}, expected ${environment.packageManager}`,
    )
  }
  if (packageManifest.engines?.node !== environment.node) {
    throw new Error(
      `evaluation Node range is ${packageManifest.engines?.node}, expected ${environment.node}`,
    )
  }

  return {
    node: environment.node,
    packageManager: environment.packageManager,
    lockfileVersion: String(lockfile.lockfileVersion),
    settings: lockfile.settings ?? {},
    selectors: environment.selectors,
    ignoredPeers,
    importers: selectedImporters,
    overrides: matchingOverrides(lockfile.overrides, dependencyNames),
    patchedDependencies,
    packages: resolvedPackages,
  }
}

export async function evaluationEnvironmentSha256(environment, options) {
  return sha256Json(await evaluationEnvironmentSnapshot(environment, options))
}

export function firstDifference(expected, actual, path = "$") {
  if (Object.is(expected, actual)) return undefined
  if (typeof expected !== typeof actual || expected === null || actual === null) {
    return { path, expected, actual }
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) return { path, expected, actual }
    if (expected.length !== actual.length) {
      return { path: `${path}.length`, expected: expected.length, actual: actual.length }
    }
    for (let index = 0; index < expected.length; index++) {
      const difference = firstDifference(expected[index], actual[index], `${path}[${index}]`)
      if (difference) return difference
    }
    return undefined
  }
  if (typeof expected === "object") {
    const expectedKeys = Object.keys(expected).sort()
    const actualKeys = Object.keys(actual).sort()
    const keyDifference = firstDifference(expectedKeys, actualKeys, `${path} keys`)
    if (keyDifference) return keyDifference
    for (const key of expectedKeys) {
      const difference = firstDifference(expected[key], actual[key], `${path}.${key}`)
      if (difference) return difference
    }
    return undefined
  }
  return { path, expected, actual }
}

export async function fetchWithRetry(url, options = {}) {
  const attempts = options.attempts ?? 3
  const timeoutMs = options.timeoutMs ?? 15_000
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`)
      return response
    } catch (error) {
      lastError = error
      if (attempt < attempts)
        await new Promise((resolveWait) => setTimeout(resolveWait, attempt * 1500))
    }
  }
  throw new Error(`${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

export function formatBytes(bytes) {
  return new Intl.NumberFormat("en-US").format(bytes)
}
