import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import { navClick, type View, viewPaths } from "../routing"
import { TopBar } from "./TopBar"

export function TestData({ go }: { go: (view: View) => void }) {
  return (
    <>
      <header>
        <TopBar current="testdata" go={go} />
      </header>
      <main id="main-content">
        <article className="prose">
          <h1>{copy.testData.title}</h1>
          <p className="prose-lede">{copy.testData.lede}</p>
          <p className="prose-body">{copy.testData.intro}</p>
          <ul>
            {copy.testData.items.map((item) => (
              <li key={item.title}>
                <strong>{item.title}:</strong> {item.body}{" "}
                <a href={item.href} target="_blank" rel="noreferrer">
                  {item.cta}
                  <ArrowUpRightIcon size={13} />
                </a>
              </li>
            ))}
          </ul>
          <p className="prose-foot">
            <a href={viewPaths.demo} onClick={navClick(() => go("demo"))}>
              {copy.testData.demoCta}
            </a>
          </p>
        </article>
      </main>
    </>
  )
}
