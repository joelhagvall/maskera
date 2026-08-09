// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PrivacyPolicy } from "../src/components/PrivacyPolicy"
import { TestData } from "../src/components/TestData"
import { Transparency } from "../src/components/Transparency"
import copy from "../src/i18n/sv.json"

describe("public documentation pages", () => {
  it("keeps transparency focused on operation, data flow, training and limitations", () => {
    render(<Transparency go={vi.fn()} />)

    expect(screen.getByRole("heading", { name: copy.transparency.title })).toBeTruthy()
    for (const item of copy.transparency.toc) {
      expect(document.querySelector(item.href)).toBeTruthy()
    }
    expect(screen.queryByRole("heading", { name: copy.testData.title })).toBeNull()
    expect(screen.queryByRole("heading", { name: copy.privacy.title })).toBeNull()
  })

  it("publishes test-data provenance on its own page", () => {
    const { container } = render(<TestData go={vi.fn()} />)

    expect(screen.getByRole("heading", { name: copy.testData.title })).toBeTruthy()
    const labels = [...container.querySelectorAll("article strong")].map((node) => node.textContent)
    for (const item of copy.testData.items) {
      expect(labels).toContain(`${item.title}:`)
    }
  })

  it("publishes the privacy policy on its own page", () => {
    const { container } = render(<PrivacyPolicy go={vi.fn()} />)

    expect(screen.getByRole("heading", { name: copy.privacy.title })).toBeTruthy()
    const labels = [...container.querySelectorAll("article strong")].map((node) => node.textContent)
    for (const item of copy.privacy.items) {
      expect(labels).toContain(`${item.title}:`)
    }
  })
})
