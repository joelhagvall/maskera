import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

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
