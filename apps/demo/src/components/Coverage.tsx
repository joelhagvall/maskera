import copy from "../i18n/sv.json"

export function Coverage() {
  return (
    <section className="coverage" id="vad-maskeras" aria-labelledby="vad-maskeras-heading">
      <h2 id="vad-maskeras-heading">{copy.coverage.heading}</h2>
      <p className="coverage-lede">{copy.coverage.lede}</p>

      <div className="coverage-grid">
        {copy.coverage.groups.map((group) => (
          <div className="coverage-group" key={group.id} data-id={group.id}>
            <h3>{group.title}</h3>
            <p>{group.description}</p>
            <ul className="coverage-labels">
              {group.items.map((item) => (
                <li key={item.label}>
                  {item.name} <span className="coverage-tag">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="coverage-notes">
        {copy.coverage.notes.map((note) => (
          <p key={note.title}>
            <strong>{note.title}:</strong> {note.text}
          </p>
        ))}
      </div>
    </section>
  )
}
