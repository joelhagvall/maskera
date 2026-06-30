import { GITHUB } from "../constants"

export function Footer() {
  return (
    <footer className="footer">
      Drivs av <code>@maska/core</code> + en distillerad svensk NER-modell, båda i webbläsaren.
      Ingen data skickas någonstans.{" "}
      <a href={`${GITHUB}/blob/main/docs/TRANSPARENCY.md`} target="_blank" rel="noreferrer">
        Transparens
      </a>
    </footer>
  )
}
