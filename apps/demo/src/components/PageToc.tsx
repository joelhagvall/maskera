export function PageToc({
  label,
  items,
}: {
  label: string
  items: readonly { href: string; label: string }[]
}) {
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
