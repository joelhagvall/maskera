import type { ReactNode } from "react"

// Order matters: comments win over strings win over keywords/function names.
const TOKEN =
  /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*")|\b(import|from|type|const|await)\b|([A-Za-z_$][\w$]*)(?=\()/g

/**
 * Tiny syntax highlighter for the site's static snippets (Developers page and
 * the hero code scene): one source line in, text and `tok-*` spans out.
 */
export function highlight(line: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const m of line.matchAll(TOKEN)) {
    if (m.index > last) nodes.push(line.slice(last, m.index))
    const cls = m[1] ? "tok-c" : m[2] ? "tok-s" : m[3] ? "tok-k" : "tok-f"
    nodes.push(
      <span key={m.index} className={cls}>
        {m[0]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < line.length) nodes.push(line.slice(last))
  return nodes
}
