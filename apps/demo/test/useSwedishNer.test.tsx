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
})
