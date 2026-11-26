import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve } from "node:path"

const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MiB text ceiling

export interface FileGuard {
  readonly allowedRoots: readonly string[]
  readText(filePath: string): Promise<{ resolvedPath: string; content: string; bytes: number }>
  writeText(
    filePath: string,
    content: string,
    options?: { overwrite?: boolean },
  ): Promise<{ resolvedPath: string; bytes: number }>
}

function isWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target)
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

async function resolveExistingAncestor(
  target: string,
): Promise<{ ancestor: string; tail: string }> {
  let current = resolve(target)
  const segments: string[] = []
  for (;;) {
    try {
      const real = await realpath(current)
      return { ancestor: real, tail: segments.reverse().join("/") }
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
 * Confines file reads and writes to explicitly allowed local directories,
 * resolving symlinks to prevent path-traversal escapes and rejecting binary or
 * oversized files.
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
            return abs
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
      return {
        resolvedPath: real,
        content: buffer.toString("utf8"),
        bytes: buffer.byteLength,
      }
    },

    async writeText(filePath: string, content: string, options = {}) {
      const rootsList = await getCanonicalRoots()
      const candidate = resolveAgainstBase(filePath)
      const { ancestor, tail } = await resolveExistingAncestor(candidate)
      const targetReal = tail ? resolve(ancestor, tail) : ancestor
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
      await writeFile(targetReal, content, {
        encoding: "utf8",
        flag: options.overwrite ? "w" : "wx",
      }).catch((err: NodeJS.ErrnoException) => {
        if (err.code === "EEXIST") {
          throw new Error(`File already exists: "${filePath}". Pass overwrite=true to replace it.`)
        }
        throw err
      })
      return { resolvedPath: targetReal, bytes }
    },
  }
}
