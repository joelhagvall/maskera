import { lstat, mkdir, readFile, readlink, realpath, stat, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, relative, resolve, sep } from "node:path"

const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MiB text ceiling
const MAX_SYMLINK_HOPS = 40
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true })

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
