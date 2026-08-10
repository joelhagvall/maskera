import { GITHUB, HF_MODEL } from "../constants"
import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { navClick, type View, viewPaths } from "../routing"
import { Coverage } from "./Coverage"
import { TopBar } from "./TopBar"

export function Transparency({ go }: { go: (view: View) => void }) {
  return (
    <>
      <header>
        <TopBar current="transparency" go={go} />
      </header>
      <main id="main-content">
        <article className="prose">
          <h1>{copy.transparency.title}</h1>
          <p className="prose-lede">{copy.transparency.lede}</p>

          <nav className="toc" aria-label={copy.transparency.tocLabel}>
            <p>{copy.transparency.tocLabel}</p>
            <ul>
              {copy.transparency.toc.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <TextList
            id="hur-fungerar"
            title={copy.transparency.howTitle}
            items={copy.transparency.how}
          />
          <Coverage />
          <TextList
            id="dataflode"
            title={copy.transparency.dataTitle}
            items={copy.transparency.data}
          />

          <section id="modelltraning" aria-labelledby="modelltraning-heading">
            <h2 id="modelltraning-heading">{copy.transparency.trainingTitle}</h2>
            <ul>
              <li>
                <strong>{copy.transparency.training.syntheticTitle}</strong>{" "}
                {copy.transparency.training.syntheticBody}{" "}
                <a
                  href={`${GITHUB}/blob/main/docs/TRAINING_DATA_PROTECTION.md`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.transparency.training.policyCta}
                </a>
                . {copy.transparency.training.attestationBody}{" "}
                <a href={HF_MODEL} target="_blank" rel="noreferrer">
                  {copy.transparency.training.modelCardCta}
                </a>
                .
              </li>
              <li>
                <strong>{copy.transparency.training.baseTitle}</strong>{" "}
                {copy.transparency.training.baseBody}{" "}
                <a
                  href="https://huggingface.co/KBLab/bert-base-swedish-cased"
                  target="_blank"
                  rel="noreferrer"
                >
                  {copy.transparency.training.baseCta}
                </a>
                . {copy.transparency.training.baseBoundary}
              </li>
              <li>
                <strong>{copy.transparency.training.reproTitle}</strong>{" "}
                {copy.transparency.training.reproBody}
              </li>
            </ul>
          </section>

          <h2 id="begransningar">{copy.transparency.limitsTitle}</h2>
          <ul>
            {copy.transparency.limits.map((item, index) => (
              <li key={item}>
                {item}{" "}
                {index === 0 ? (
                  <a href={viewPaths.accuracy} onClick={navClick(() => go("accuracy"))}>
                    {copy.transparency.accuracyCta}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>

          <p className="prose-foot">
            {copy.transparency.fullDocsPrefix}{" "}
            <a href={`${GITHUB}/blob/main/docs/TRANSPARENCY.md`} target="_blank" rel="noreferrer">
              {copy.transparency.fullDocsCta}
              <ArrowUpRightIcon size={13} />
            </a>
          </p>
        </article>
      </main>
    </>
  )
}

function TextList({ id, title, items }: { id: string; title: string; items: string[] }) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{title}</h2>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}
