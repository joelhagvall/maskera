export function Footer({ onTransparency }: { onTransparency: () => void }) {
  return (
    <footer className="footer">
      Drivs av <code>@maska/core</code> + en distillerad svensk NER-modell, båda i webbläsaren.
      Ingen data skickas någonstans.{" "}
      <button type="button" className="footer-link" onClick={onTransparency}>
        Integritet & transparens
      </button>
    </footer>
  )
}
