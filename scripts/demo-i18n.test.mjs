import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import test from "node:test"
import ts from "typescript"

const ROOT = join(process.cwd(), "apps/demo/src")
const VISIBLE_ATTRIBUTES = new Set(["alt", "aria-label", "placeholder", "title"])

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? files(path) : entry.name.endsWith(".tsx") ? [path] : []
  })
}

test("demo React copy comes from i18n", () => {
  const violations = []
  for (const file of files(ROOT)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    )
    const visit = (node) => {
      const line = source.getLineAndCharacterOfPosition(node.pos).line + 1
      if (ts.isJsxText(node) && /[A-Za-zÅÄÖåäö]/.test(node.text.trim())) {
        violations.push(`${relative(process.cwd(), file)}:${line} hardcoded JSX text`)
      }
      if (
        ts.isJsxAttribute(node) &&
        VISIBLE_ATTRIBUTES.has(node.name.text) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        node.initializer.text
      ) {
        violations.push(
          `${relative(process.cwd(), file)}:${line} hardcoded ${node.name.text} attribute`,
        )
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.deepEqual(violations, [])
})
