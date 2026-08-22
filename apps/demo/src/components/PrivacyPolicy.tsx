import copy from "../i18n"
import { ArrowUpRightIcon } from "../icons"
import type { View } from "../routing"
import { TopBar } from "./TopBar"

export function PrivacyPolicy({ go }: { go: (view: View) => void }) {
  return (
    <>
      <header>
        <TopBar current="privacy" go={go} />
      </header>
      <main id="main-content">
        <article className="prose">
          <h1>{copy.privacy.title}</h1>
          <p className="prose-lede">{copy.privacy.lede}</p>
          <ul>
            {copy.privacy.items.map((item) => (
              <li key={item.title}>
                <strong>{item.title}:</strong> {item.body}
              </li>
            ))}
          </ul>
          <p className="prose-body">
            <a href="https://hagvall-labs.com" target="_blank" rel="noreferrer">
              {copy.privacy.contactCta}
              <ArrowUpRightIcon size={13} />
            </a>
          </p>
          <p className="prose-foot">{copy.privacy.updated}</p>
        </article>
      </main>
    </>
  )
}
