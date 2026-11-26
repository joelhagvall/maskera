import copy from "../i18n"

/**
 * The "On this page" navigation shared by every long page. The label is owned
 * here, not passed in, so no page can drift to its own wording; the placement
 * (a rail to the right of the content on wide screens) lives in styles.css
 * under `.toc-rail`.
 */
export function PageToc({ items }: { items: readonly { href: string; label: string }[] }) {
  const label = copy.pageToc.label
  return (
    <div className="toc-rail">
      <nav className="toc" aria-label={label}>
        <p>{label}</p>
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <a href={item.href}>{item.label}</a>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
