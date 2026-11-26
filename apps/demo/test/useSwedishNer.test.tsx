// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { NerWorkerMsg } from "../src/ner.worker"
import { useSwedishNer } from "../src/useSwedishNer"

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent<NerWorkerMsg>) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()

  constructor() {
    FakeWorker.instances.push(this)
  }

  emit(data: NerWorkerMsg) {
    this.onmessage?.({ data } as MessageEvent<NerWorkerMsg>)
  }
}

beforeEach(() => {
  FakeWorker.instances = []
  let frame = 0
  vi.stubGlobal("Worker", FakeWorker)
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frame += 1
    callback(0)
    return frame
  })
  vi.stubGlobal("cancelAnimationFrame", vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("useSwedishNer model activation", () => {
  it("keeps rules active without constructing a worker while the model is disabled", () => {
    const { result, unmount } = renderHook(() => useSwedishNer("19900101-2385", 0))

    expect(result.current.status).toBe("idle")
    expect(result.current.result.redactions).toHaveLength(1)
    expect(FakeWorker.instances).toHaveLength(0)
    unmount()
  })

  it("constructs the worker after activation and analyzes non-empty text", () => {
    vi.useFakeTimers()
    const { result, rerender, unmount } = renderHook(
      ({ activation }) => useSwedishNer("Anna Karlsson", activation),
      { initialProps: { activation: 0 } },
    )

    rerender({ activation: 1 })
    act(() => vi.advanceTimersByTime(40))
    expect(result.current.status).toBe("loading")
    expect(FakeWorker.instances).toHaveLength(1)

    act(() => FakeWorker.instances[0].emit({ type: "ready" }))
    expect(result.current.status).toBe("ready")
    expect(result.current.analyzing).toBe(true)

    act(() => vi.advanceTimersByTime(250))
    expect(FakeWorker.instances[0].postMessage).toHaveBeenCalledWith({
      id: expect.any(Number),
      text: "Anna Karlsson",
    })
    unmount()
  })

  it("never sends empty text for inference", () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useSwedishNer("", 1))

    act(() => vi.advanceTimersByTime(40))
    expect(FakeWorker.instances).toHaveLength(1)
    act(() => FakeWorker.instances[0].emit({ type: "ready" }))
    act(() => vi.advanceTimersByTime(300))

    expect(result.current.status).toBe("ready")
    expect(result.current.analyzing).toBe(false)
    expect(FakeWorker.instances[0].postMessage).not.toHaveBeenCalled()
    unmount()
  })

  it("replaces a failed worker when the user retries", () => {
    vi.useFakeTimers()
    const { result, rerender, unmount } = renderHook(
      ({ activation }) => useSwedishNer("Anna Karlsson", activation),
      { initialProps: { activation: 1 } },
    )

    act(() => vi.advanceTimersByTime(40))
    const failedWorker = FakeWorker.instances[0]
    act(() => failedWorker.emit({ type: "error" }))
    expect(result.current.status).toBe("error")

    rerender({ activation: 2 })
    act(() => vi.advanceTimersByTime(40))
    expect(failedWorker.terminate).toHaveBeenCalledOnce()
    expect(FakeWorker.instances).toHaveLength(2)

    act(() => FakeWorker.instances[1].emit({ type: "ready" }))
    expect(result.current.status).toBe("ready")
    unmount()
  })

  it("coalesces texts typed during a slow inference instead of queueing them", () => {
    vi.useFakeTimers()
    const { result, rerender, unmount } = renderHook(({ text }) => useSwedishNer(text, 1), {
      initialProps: { text: "Anna Karlsson" },
    })

    act(() => vi.advanceTimersByTime(40))
    const worker = FakeWorker.instances[0]
    act(() => worker.emit({ type: "ready" }))
    act(() => vi.advanceTimersByTime(250))
    expect(worker.postMessage).toHaveBeenCalledTimes(1)

    // Two edits while the first inference is still in flight: nothing queues.
    rerender({ text: "Anna Karlsson bor i Stockholm" })
    act(() => vi.advanceTimersByTime(250))
    rerender({ text: "Anna Karlsson bor i Stockholm sedan 1990" })
    act(() => vi.advanceTimersByTime(250))
    expect(worker.postMessage).toHaveBeenCalledTimes(1)

    // The stale result frees the worker: exactly one follow-up, with the
    // latest text only.
    const firstId = (worker.postMessage.mock.calls[0][0] as { id: number }).id
    act(() => worker.emit({ type: "result", id: firstId, failed: true }))
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      id: expect.any(Number),
      text: "Anna Karlsson bor i Stockholm sedan 1990",
    })
    expect(result.current.analyzing).toBe(true)
    unmount()
  })

  it("is pending from the first render of a new text until the model answers for it", () => {
    vi.useFakeTimers()
    const { result, rerender, unmount } = renderHook(({ text }) => useSwedishNer(text, 1), {
      initialProps: { text: "Bo ska bo i Boden." },
    })

    act(() => vi.advanceTimersByTime(40))
    const worker = FakeWorker.instances[0]
    expect(result.current.pending).toBe(false)
    act(() => worker.emit({ type: "ready" }))
    expect(result.current.pending).toBe(true)

    act(() => vi.advanceTimersByTime(250))
    const firstId = (worker.postMessage.mock.calls[0][0] as { id: number }).id
    act(() =>
      worker.emit({
        type: "result",
        id: firstId,
        text: "[NAMN_1] ska bo i Boden.",
        map: { "[NAMN_1]": "Bo" },
        redactions: [],
      }),
    )
    expect(result.current.pending).toBe(false)
    expect(result.current.result.map).toEqual({ "[NAMN_1]": "Bo" })

    rerender({ text: "Liv jobbar på Karolinska." })
    expect(result.current.pending).toBe(true)

    // A failed inference settles too: the rules stand and nothing stays pending.
    act(() => vi.advanceTimersByTime(250))
    const lastId = (worker.postMessage.mock.calls.at(-1)?.[0] as { id: number }).id
    act(() => worker.emit({ type: "result", id: lastId, failed: true }))
    expect(result.current.pending).toBe(false)
    unmount()
  })

  function answer(worker: FakeWorker, call: number, map: Record<string, string>) {
    const { id, text } = worker.postMessage.mock.calls[call][0] as { id: number; text: string }
    act(() => worker.emit({ type: "result", id, text: `masked ${text}`, map, redactions: [] }))
  }

  it("shows a text the model has answered for at once, without another request", () => {
    vi.useFakeTimers()
    const { result, rerender, unmount } = renderHook(({ text }) => useSwedishNer(text, 1), {
      initialProps: { text: "Bo ska bo i Boden." },
    })
    act(() => vi.advanceTimersByTime(40))
    const worker = FakeWorker.instances[0]
    act(() => worker.emit({ type: "ready" }))
    act(() => vi.advanceTimersByTime(250))
    answer(worker, 0, { "[NAMN_1]": "Bo" })

    rerender({ text: "Liv jobbar på Karolinska." })
    act(() => vi.advanceTimersByTime(250))
    answer(worker, 1, { "[NAMN_1]": "Liv" })
    expect(worker.postMessage).toHaveBeenCalledTimes(2)

    // Back to the first text: answered from memory, no wait and no request.
    rerender({ text: "Bo ska bo i Boden." })
    expect(result.current.pending).toBe(false)
    expect(result.current.result.map).toEqual({ "[NAMN_1]": "Bo" })
    act(() => vi.advanceTimersByTime(1000))
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
    unmount()
  })

  it("prewarms example texts after the visitor's own text, so a first pick needs no wait", () => {
    vi.useFakeTimers()
    const examples = ["Bo ska bo i Boden.", "Liv jobbar på Karolinska."]
    const { result, rerender, unmount } = renderHook(
      ({ text }) => useSwedishNer(text, 1, examples),
      { initialProps: { text: "Egen text om Dag." } },
    )
    act(() => vi.advanceTimersByTime(40))
    const worker = FakeWorker.instances[0]
    act(() => worker.emit({ type: "ready" }))

    // The visitor's text goes first, after the debounce.
    act(() => vi.advanceTimersByTime(250))
    expect(worker.postMessage).toHaveBeenNthCalledWith(1, {
      id: expect.any(Number),
      text: "Egen text om Dag.",
    })
    answer(worker, 0, { "[NAMN_1]": "Dag" })

    // Then the examples, one at a time.
    expect(worker.postMessage).toHaveBeenNthCalledWith(2, {
      id: expect.any(Number),
      text: examples[0],
    })
    answer(worker, 1, { "[NAMN_1]": "Bo" })
    expect(worker.postMessage).toHaveBeenNthCalledWith(3, {
      id: expect.any(Number),
      text: examples[1],
    })
    answer(worker, 2, { "[NAMN_1]": "Liv" })

    rerender({ text: examples[1] })
    expect(result.current.pending).toBe(false)
    expect(result.current.result.map).toEqual({ "[NAMN_1]": "Liv" })
    act(() => vi.advanceTimersByTime(1000))
    expect(worker.postMessage).toHaveBeenCalledTimes(3)
    unmount()
  })
})
