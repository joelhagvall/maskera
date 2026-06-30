import { GITHUB } from "../constants"
import { ArrowUpRightIcon, MaskaMark } from "../icons"

export function Transparency({ onBack }: { onBack: () => void }) {
  return (
    <div className="app">
      <div className="topbar">
        <button type="button" className="back" onClick={onBack}>
          ← Tillbaka till demon
        </button>
        <span className="wordmark">
          <MaskaMark size={20} />
          maska
        </span>
      </div>

      <article className="prose">
        <h1>Integritet & transparens</h1>
        <p className="prose-lede">
          maska är ett integritetsverktyg, så det bör vara ärligt om sig självt. Här är vad det gör,
          hur det funkar, hur modellen tränats, och var gränserna går.
        </p>

        <h2>Hur funkar det?</h2>
        <ul>
          <li>
            maska läser texten och ersätter personuppgifter med platshållare, t.ex.{" "}
            <code>[NAMN_1]</code> eller <code>[PERSONNUMMER_1]</code>. AI-tjänsten får bara
            platshållarna — du kan sätta tillbaka originalen lokalt efteråt.
          </li>
          <li>
            <strong>Två lager jobbar tillsammans.</strong> <strong>Regler</strong> fångar sådant som
            har ett exakt format — personnummer, organisationsnummer, telefonnummer, e-post — med
            matematisk säkerhet (t.ex. kontrollsiffran i ett personnummer).
          </li>
          <li>
            <strong>En liten AI-modell</strong> fångar resten — fria namn, platser och
            organisationer. Tekniken kallas <strong>NER</strong> (“named entity recognition”):
            modellen har lärt sig att känna igen <em>att</em> ett ord är ett namn eller en plats av
            sammanhanget, även namn den aldrig sett förut. Det är därför regex inte räcker — man kan
            inte lista alla namn som finns.
          </li>
          <li>
            Modellen är liten nog att <strong>köra direkt i webbläsaren</strong> (samma teknik som
            kör AI lokalt på din enhet), så texten aldrig behöver skickas iväg för att analyseras.
          </li>
        </ul>

        <h2>Var din data tar vägen: ingenstans</h2>
        <ul>
          <li>
            <strong>All maskning sker på din enhet</strong> — i webbläsaren (WASM/WebGPU) eller i
            din Node-process. Din text skickas <strong>aldrig</strong> någonstans för att maskas.
          </li>
          <li>
            <strong>Ingen telemetri, ingen analytics, ingen phone-home.</strong> Du kan verifiera
            det själv i webbläsarens DevTools → Network: skriv i demon och se — din text utlöser
            noll requests.
          </li>
          <li>
            <strong>De anrop som faktiskt finns</strong> (full ärlighet): modellfilen hämtas en gång
            (från Hugging Face eller din egen host), och WASM-runtimen laddas från ett CDN. Båda är
            kod/vikter, hämtade en gång och cachade — <strong>aldrig din text</strong>. Vill du ha
            noll externa anrop? Self-hosta modellen och runtimen.
          </li>
          <li>
            Regel-lagret (<code>@maska/core</code>) har <strong>inga nätverksberoenden alls</strong>{" "}
            och ingen modell — rena funktioner.
          </li>
        </ul>

        <h2>Hur modellen tränats</h2>
        <ul>
          <li>
            <strong>100% syntetisk träningsdata.</strong> Modellen tränades på mall-genererade
            meningar — <strong>ingen riktig persondata, ingen skrapad text</strong>. Vi skördade
            inte någons data för att bygga ett integritetsverktyg. Generatorn ligger i repot.
          </li>
          <li>
            <strong>Basmodell:</strong> KB-BERT (Kungliga biblioteket), public domain (CC0).
            Fine-tunad och sedan distillerad till en mindre modell.
          </li>
          <li>
            <strong>Hela pipelinen är reproducerbar</strong> — data, träning, distillering, export
            och utvärdering är skript i repot. Inget är gömt.
          </li>
        </ul>

        <h2>Hur bra den är, ärligt</h2>
        <ul>
          <li>
            Öppet benchmarkad mot Rampart på både en handgjord uppsättning och ett oberoende publikt
            dataset. Siffror och brasklappar finns i repot — inklusive att kvaliteten sjunker på
            text utanför domänen.
          </li>
          <li>
            <strong>Det är defense in depth, inte en garanti.</strong> Strukturerad PII
            (personnummer, org-nr…) fångas deterministiskt av regler och är väldigt pålitligt. Fria
            namn/platser bygger på en modell och <strong>kommer missa saker</strong>. Behåll
            server-side-kontroller.
          </li>
          <li>
            maska är ett <strong>data-minimerings­verktyg</strong> som stödjer GDPR-mål, men det är{" "}
            <strong>ingen efterlevnadsgaranti</strong> och gör inga juridiska påståenden — du är
            fortsatt personuppgiftsansvarig.
          </li>
        </ul>

        <p className="prose-foot">
          Fullständig version (med FAQ) och all källkod finns på GitHub.{" "}
          <a href={`${GITHUB}/blob/main/docs/TRANSPARENCY.md`} target="_blank" rel="noreferrer">
            Läs hela dokumentet
            <ArrowUpRightIcon size={13} />
          </a>
        </p>
      </article>
    </div>
  )
}
