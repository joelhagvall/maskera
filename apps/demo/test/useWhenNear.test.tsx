// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { useWhenNear } from "../src/useWhenNear"

type Callback = (entries: { isIntersecting: boolean }[]) => void

/** A controllable IntersectionObserver: `fire` delivers one entry. */
function stubObserver() {
  const observers: { callback: Callback; options: unknown; disconnected: boolean }[] = []
  class FakeObserver {
    record: (typeof observers)[number]
    constructor(callback: Callback, options: unknown) {
      this.record = { callback, options, disconnected: false }
      observers.push(this.record)
    }
    observe() {}
    disconnect() {
      this.record.disconnected = true
    }
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver)
  return {
    observers,
    fire: (isIntersecting: boolean) =>
      act(() => {
        for (const o of observers) o.callback([{ isIntersecting }])
      }),
  }
}

function Probe({ onNear }: { onNear: () => void }) {
  const ref = useWhenNear(onNear, "600px 0px")
  return <div ref={ref} />
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("useWhenNear", () => {
  it("waits until the element comes near the viewport, then fires once", () => {
    const { observers, fire } = stubObserver()
    const onNear = vi.fn()
    render(<Probe onNear={onNear} />)

    expect(observers[0].options).toEqual({ rootMargin: "600px 0px" })
    fire(false)
    expect(onNear).not.toHaveBeenCalled()
    fire(true)
    expect(onNear).toHaveBeenCalledTimes(1)
    expect(observers[0].disconnected).toBe(true)
  })

  it("stops watching when the element unmounts", () => {
    const { observers } = stubObserver()
    const { unmount } = render(<Probe onNear={vi.fn()} />)
    unmount()
    expect(observers[0].disconnected).toBe(true)
  })

  it("fires right away where IntersectionObserver is missing", () => {
    vi.stubGlobal("IntersectionObserver", undefined)
    const onNear = vi.fn()
    render(<Probe onNear={onNear} />)
    expect(onNear).toHaveBeenCalledTimes(1)
  })
})
