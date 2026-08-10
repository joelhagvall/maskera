// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it } from "vitest"
import { Header } from "../src/components/Header"
import { setActiveLocale } from "../src/i18n"
import en from "../src/i18n/en.json"
import sv from "../src/i18n/sv.json"
import { useRoute } from "../src/routing"

function LocalizedShell() {
  const { navigate } = useRoute()
  const [draft, setDraft] = useState("bevarad text")
  return (
    <>
      <Header go={navigate} />
      <input aria-label="draft" value={draft} onChange={(event) => setDraft(event.target.value)} />
    </>
  )
}

beforeEach(() => {
  window.history.replaceState(null, "", "/")
  setActiveLocale("sv")
})

describe("LanguageToggle", () => {
  it("switches locale and URL in place without losing component state", () => {
    render(<LocalizedShell />)
    const draft = screen.getByRole("textbox", { name: "draft" })
    fireEvent.change(draft, { target: { value: "ska vara kvar" } })

    const englishLink = screen.getByRole("link", { name: sv.language.switchLabel })
    expect(englishLink.textContent).toBe("English")
    fireEvent.click(englishLink)

    expect(window.location.pathname).toBe("/en")
    expect(document.documentElement.lang).toBe("en")
    expect(screen.getByRole("heading", { name: en.header.title })).toBeTruthy()
    expect(screen.getByRole("textbox", { name: "draft" })).toHaveProperty("value", "ska vara kvar")
    const swedishLink = screen.getByRole("link", { name: en.language.switchLabel })
    expect(swedishLink.textContent).toBe("Svenska")
    expect(swedishLink.getAttribute("href")).toBe("/")
  })
})
