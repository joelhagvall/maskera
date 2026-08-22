import type { ReactNode } from "react"

// Matches full URLs, e-mail addresses and bare domains (hagvall-labs.com,
// maskera.dev) inside copy strings so every address renders as a link.
const ADDRESS =
  /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b(?:[\w-]+\.)+(?:com|dev|se|org|net|io)\b(?:\/[^\s<>"']*[^\s<>"'.,;:!?)])?)/g

function hrefFor(address: string): string {
  if (/^https?:\/\//.test(address)) return address
  if (address.includes("@")) return `mailto:${address}`
  return `https://${address}`
}

export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(ADDRESS)) {
    const start = match.index ?? 0
    const address = match[0]
    if (start > last) out.push(text.slice(last, start))
    const href = hrefFor(address)
    const mail = href.startsWith("mailto:")
    out.push(
      <a
        key={`${start}-${address}`}
        href={href}
        {...(mail ? {} : { target: "_blank", rel: "noreferrer" })}
      >
        {address}
      </a>,
    )
    last = start + address.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
