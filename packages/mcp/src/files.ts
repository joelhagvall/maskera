import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"

const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MiB text ceiling
const MAX_SYMLINK_HOPS = 40
const DEFAULT_LIST_MAX_ENTRIES = 200
const HARD_LIST_MAX_ENTRIES = 1_000
const DEFAULT_LIST_MAX_DEPTH = 6
const HARD_LIST_MAX_DEPTH = 12
const DEFAULT_SEARCH_MAX_MATCHES = 50
const HARD_SEARCH_MAX_MATCHES = 200
const DEFAULT_SEARCH_MAX_FILES = 500
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true })

const SKIP_DIRS = new Set([".git", "node_modules", "dist", "dist-ssr", ".next", ".turbo"])

export interface ListedFile {
  path: string
  bytes: number
}

export interface SearchMatch {
  path: string
  line: number
  lineText: string
}

export interface FileGuard {
  readonly allowedRoots: readonly string[]
  readText(filePath: string): Promise<{ resolvedPath: string; content: string; bytes: number }>
  writeText(
    filePath: string,
    content: string,
    options?: { overwrite?: boolean },
  ): Promise<{ resolvedPath: string; bytes: number }>
  listFiles(
    dirPath?: string,
    options?: { maxEntries?: number; maxDepth?: number },
  ): Promise<{ root: string; files: ListedFile[]; truncated: boolean }>
  searchFiles(
    query: string,
    options?: { path?: string; caseSensitive?: boolean; maxMatches?: number; maxFiles?: number },
  ): Promise<{ root: string; scannedFiles: number; matches: SearchMatch[]; truncated: boolean }>
}

function isWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

async function resolveExistingAncestor(
  target: string,
): Promise<{ ancestor: string; tail: string }> {
  let current = resolve(target)
  const segments: string[] = []
  for (;;) {
    try {
      const real = await realpath(current)
      return { ancestor: real, tail: segments.reverse().join(sep) }
    } catch {
      const parent = dirname(current)
      if (parent === current) {
        throw new Error(`Cannot resolve path "${target}".`)
      }
      segments.push(relative(parent, current))
      current = parent
    }
  }
}

/**
 * Resolves a destination path while following any dangling or live symlinks
 * step by step so a dangling symlink inside an allowed root pointing outside
 * can never bypass the root boundary on write.
 */
async function resolveCanonicalTarget(target: string): Promise<string> {
  let current = resolve(target)
  for (let hop = 0; hop < MAX_SYMLINK_HOPS; hop++) {
    const { ancestor, tail } = await resolveExistingAncestor(current)
    const candidate = tail ? resolve(ancestor, tail) : ancestor
    try {
      const info = await lstat(candidate)
      if (!info.isSymbolicLink()) {
        return candidate
      }
      const linkTarget = await readlink(candidate)
      current = resolve(dirname(candidate), linkTarget)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return candidate
      }
      throw err
    }
  }
  throw new Error(`Too many symlink hops while resolving "${target}".`)
}

function clampInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

/**
 * Confines file reads, writes, directory listings, and searches to explicitly
 * allowed local directories, resolving symlinks to prevent path-traversal
 * escapes and rejecting binary or oversized files.
 */
export function createFileGuard(roots: readonly string[] = [process.cwd()]): FileGuard {
  const rawRoots = roots.length > 0 ? roots : [process.cwd()]
  let canonicalRootsPromise: Promise<string[]> | null = null

  function getCanonicalRoots(): Promise<string[]> {
    if (!canonicalRootsPromise) {
      canonicalRootsPromise = Promise.all(
        rawRoots.map(async (root) => {
          const abs = resolve(root)
          try {
            return await realpath(abs)
          } catch {
            // Canonicalize through the nearest existing ancestor so a root
            // created after startup under a symlinked parent (e.g. /tmp ->
            // /private/tmp on macOS) matches realpath() once created.
            try {
              const { ancestor, tail } = await resolveExistingAncestor(abs)
              return tail ? resolve(ancestor, tail) : ancestor
            } catch {
              return abs
            }
          }
        }),
      )
    }
    return canonicalRootsPromise
  }

  function resolveAgainstBase(filePath: string): string {
    const trimmed = filePath.trim()
    if (!trimmed) throw new Error("Path must not be empty.")
    return isAbsolute(trimmed) ? resolve(trimmed) : resolve(rawRoots[0] ?? process.cwd(), trimmed)
  }

  async function resolveAllowedDirectory(dirPath?: string): Promise<{
    rootsList: string[]
    baseDir: string
  }> {
    const rootsList = await getCanonicalRoots()
    const targetRaw = dirPath?.trim()
      ? resolveAgainstBase(dirPath)
      : resolve(rawRoots[0] ?? process.cwd())
    const { ancestor, tail } = await resolveExistingAncestor(targetRaw)
    const candidateReal = tail ? resolve(ancestor, tail) : ancestor
    if (!rootsList.some((root) => isWithinRoot(root, candidateReal))) {
      throw new Error(
        `Access denied: "${dirPath ?? targetRaw}" is outside allowed workspace roots (${rootsList.join(", ")}).`,
      )
    }
    const real = await realpath(targetRaw).catch(() => {
      throw new Error(`Directory not found: "${dirPath ?? targetRaw}".`)
    })
    if (!rootsList.some((root) => isWithinRoot(root, real))) {
      throw new Error(
        `Access denied: "${dirPath ?? targetRaw}" is outside allowed workspace roots (${rootsList.join(", ")}).`,
      )
    }
    const info = await stat(real)
    if (!info.isDirectory()) {
      throw new Error(`"${dirPath ?? targetRaw}" is not a directory.`)
    }
    return { rootsList, baseDir: real }
  }

  async function walkFiles(
    baseDir: string,
    rootsList: readonly string[],
    maxEntries: number,
    maxDepth: number,
  ): Promise<{
    files: Array<{ relPath: string; realPath: string; bytes: number }>
    truncated: boolean
  }> {
    const files: Array<{ relPath: string; realPath: string; bytes: number }> = []
    const visitedDirs = new Set<string>([baseDir])
    let truncated = false

    async function visit(dir: string, depth: number): Promise<void> {
      if (truncated) return
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
      entries.sort((a, b) => a.name.localeCompare(b.name))

      for (const entry of entries) {
        if (truncated) return
        if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue

        const full = join(dir, entry.name)
        let real: string
        try {
          real = await realpath(full)
        } catch {
          continue
        }
        if (!rootsList.some((root) => isWithinRoot(root, real))) continue

        let info
        try {
          info = await stat(real)
        } catch {
          continue
        }

        if (info.isDirectory()) {
          if (depth < maxDepth && !visitedDirs.has(real)) {
            visitedDirs.add(real)
            await visit(real, depth + 1)
          }
          continue
        }

        if (!info.isFile()) continue
        if (files.length >= maxEntries) {
          truncated = true
          return
        }
        const relPath = relative(baseDir, full).split(sep).join("/")
        files.push({ relPath, realPath: real, bytes: info.size })
      }
    }

    await visit(baseDir, 0)
    return { files, truncated }
  }

  return {
    allowedRoots: rawRoots.map((r) => resolve(r)),

    async readText(filePath: string) {
      const rootsList = await getCanonicalRoots()
      const candidate = resolveAgainstBase(filePath)
      const { ancestor, tail } = await resolveExistingAncestor(candidate)
      const candidateReal = tail ? resolve(ancestor, tail) : ancestor
      if (!rootsList.some((root) => isWithinRoot(root, candidateReal))) {
        throw new Error(
          `Access denied: "${filePath}" is outside allowed workspace roots (${rootsList.join(", ")}).`,
        )
      }
      const real = await realpath(candidate).catch(() => {
        throw new Error(`File not found: "${filePath}".`)
      })
      if (!rootsList.some((root) => isWithinRoot(root, real))) {
        throw new Error(
          `Access denied: "${filePath}" is outside allowed workspace roots (${rootsList.join(", ")}).`,
        )
      }
      const info = await stat(real)
      if (!info.isFile()) {
        throw new Error(`"${filePath}" is not a regular file.`)
      }
      if (info.size > MAX_FILE_BYTES) {
        throw new Error(
          `File "${filePath}" is ${info.size} bytes (max ${MAX_FILE_BYTES} bytes for local redaction).`,
        )
      }
      const buffer = await readFile(real)
      if (buffer.includes(0)) {
        throw new Error(`"${filePath}" appears to be a binary file; only UTF-8 text is supported.`)
      }
      let content: string
      try {
        content = UTF8_DECODER.decode(buffer)
      } catch {
        throw new Error(
          `"${filePath}" is not valid UTF-8 text; convert it to UTF-8 before redacting.`,
        )
      }
      return {
        resolvedPath: real,
        content,
        bytes: buffer.byteLength,
      }
    },

    async writeText(filePath: string, content: string, options = {}) {
      const rootsList = await getCanonicalRoots()
      const candidate = resolveAgainstBase(filePath)
      const targetReal = await resolveCanonicalTarget(candidate)
      if (!rootsList.some((root) => isWithinRoot(root, targetReal))) {
        throw new Error(
          `Access denied: "${filePath}" is outside allowed workspace roots (${rootsList.join(", ")}).`,
        )
      }
      const bytes = Buffer.byteLength(content, "utf8")
      if (bytes > MAX_FILE_BYTES) {
        throw new Error(`Output exceeds max allowed size (${MAX_FILE_BYTES} bytes).`)
      }
      await mkdir(dirname(targetReal), { recursive: true })
      const parentReal = await realpath(dirname(targetReal))
      if (!rootsList.some((root) => isWithinRoot(root, parentReal))) {
        throw new Error(
          `Access denied: "${filePath}" is outside allowed workspace roots (${rootsList.join(", ")}).`,
        )
      }
      await writeFile(targetReal, content, {
        encoding: "utf8",
        flag: options.overwrite ? "w" : "wx",
        mode: 0o600,
      }).catch((err: NodeJS.ErrnoException) => {
        if (err.code === "EEXIST") {
          throw new Error(`File already exists: "${filePath}". Pass overwrite=true to replace it.`)
        }
        throw err
      })
      return { resolvedPath: targetReal, bytes }
    },

    async listFiles(dirPath, options = {}) {
      const { rootsList, baseDir } = await resolveAllowedDirectory(dirPath)
      const maxEntries = clampInt(
        options.maxEntries,
        DEFAULT_LIST_MAX_ENTRIES,
        1,
        HARD_LIST_MAX_ENTRIES,
      )
      const maxDepth = clampInt(options.maxDepth, DEFAULT_LIST_MAX_DEPTH, 0, HARD_LIST_MAX_DEPTH)
      const { files, truncated } = await walkFiles(baseDir, rootsList, maxEntries, maxDepth)
      return {
        root: baseDir,
        files: files.map((f) => ({ path: f.relPath, bytes: f.bytes })),
        truncated,
      }
    },

    async searchFiles(query, options = {}) {
      const trimmedQuery = query.trim()
      if (!trimmedQuery) throw new Error("Search query must not be empty.")
      const { rootsList, baseDir } = await resolveAllowedDirectory(options.path)
      const maxMatches = clampInt(
        options.maxMatches,
        DEFAULT_SEARCH_MAX_MATCHES,
        1,
        HARD_SEARCH_MAX_MATCHES,
      )
      const maxFiles = clampInt(
        options.maxFiles,
        DEFAULT_SEARCH_MAX_FILES,
        1,
        HARD_LIST_MAX_ENTRIES,
      )
      const caseSensitive = options.caseSensitive === true
      const needle = caseSensitive ? trimmedQuery : trimmedQuery.toLowerCase()

      const { files, truncated: walkTruncated } = await walkFiles(
        baseDir,
        rootsList,
        maxFiles,
        DEFAULT_LIST_MAX_DEPTH,
      )

      const matches: SearchMatch[] = []
      let scannedFiles = 0
      let truncated = walkTruncated

      for (const file of files) {
        if (file.bytes > MAX_FILE_BYTES) continue
        let buffer: Buffer
        try {
          buffer = await readFile(file.realPath)
        } catch {
          continue
        }
        if (buffer.includes(0)) continue
        let text: string
        try {
          text = UTF8_DECODER.decode(buffer)
        } catch {
          continue
        }
        scannedFiles += 1
        const lines = text.split(/\r?\n/)
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i] ?? ""
          const haystack = caseSensitive ? lineText : lineText.toLowerCase()
          if (haystack.includes(needle)) {
            // Keep the full line (up to a safe ceiling) so callers redact
            // BEFORE truncating and never slice a PII token in half.
            matches.push({
              path: file.relPath,
              line: i + 1,
              lineText: lineText.length > 16_384 ? lineText.slice(0, 16_384) : lineText,
            })
            if (matches.length >= maxMatches) {
              truncated = true
              return { root: baseDir, scannedFiles, matches, truncated }
            }
          }
        }
      }

      return { root: baseDir, scannedFiles, matches, truncated }
    },
  }
}
