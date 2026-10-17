import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCountdown } from '@/features/auth/use-countdown'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-17T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useCountdown', () => {
  it('counts down second by second to 0, then is done', () => {
    const { result } = renderHook(() => useCountdown(3))
    expect(result.current).toMatchObject({ remaining: 3, done: false })
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.remaining).toBe(2)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.remaining).toBe(1)
    act(() => vi.advanceTimersByTime(999))
    expect(result.current).toMatchObject({ remaining: 1, done: false })
    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toMatchObject({ remaining: 0, done: true })
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.remaining).toBe(0)
  })

  it('is done at once without a countdown (null) and for 0 or less', () => {
    expect(renderHook(() => useCountdown(null)).result.current).toMatchObject({
      remaining: 0,
      done: true,
    })
    expect(renderHook(() => useCountdown(0)).result.current.done).toBe(true)
    expect(renderHook(() => useCountdown(-5)).result.current.remaining).toBe(0)
    expect(renderHook(() => useCountdown(Number.NaN)).result.current.done).toBe(true)
  })

  it('keeps to the wall clock when timers are throttled (a background tab)', () => {
    const { result } = renderHook(() => useCountdown(120))
    // The tab sleeps: 90 s pass but no timer has fired yet.
    vi.setSystemTime(new Date('2026-10-17T10:01:30Z'))
    act(() => vi.advanceTimersByTime(1000))
    // 91 s after the start: no matter how few ticks there were.
    expect(result.current.remaining).toBe(29)
  })

  it('catches up as soon as the tab is visible again', () => {
    const { result } = renderHook(() => useCountdown(120))
    vi.setSystemTime(new Date('2026-10-17T10:01:40Z'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current.remaining).toBe(20)
  })

  it('restarts from the given seconds (a resend, a 429 retry_after)', () => {
    const { result } = renderHook(() => useCountdown(2))
    act(() => vi.advanceTimersByTime(2000))
    expect(result.current.done).toBe(true)
    act(() => result.current.restart(5))
    expect(result.current).toMatchObject({ remaining: 5, done: false })
    act(() => vi.advanceTimersByTime(5000))
    expect(result.current.done).toBe(true)
  })

  it('keeps restart the same function across renders', () => {
    const { result, rerender } = renderHook(() => useCountdown(10))
    const first = result.current.restart
    act(() => vi.advanceTimersByTime(1000))
    rerender()
    expect(result.current.restart).toBe(first)
  })

  it('starts again when the seconds it is given change (a new code was sent)', () => {
    const { result, rerender } = renderHook(({ seconds }) => useCountdown(seconds), {
      initialProps: { seconds: 300 as number | null },
    })
    act(() => vi.advanceTimersByTime(10_000))
    expect(result.current.remaining).toBe(290)
    rerender({ seconds: 120 })
    expect(result.current.remaining).toBe(120)
    rerender({ seconds: null })
    expect(result.current.done).toBe(true)
  })

  it('stops listening for a visible tab once done, and listens again on a restart', () => {
    const added = vi.spyOn(document, 'addEventListener')
    const removed = vi.spyOn(document, 'removeEventListener')
    const { result } = renderHook(() => useCountdown(2))
    const listener = added.mock.calls.find(([type]) => type === 'visibilitychange')?.[1]
    expect(listener).toBeTypeOf('function')
    act(() => vi.advanceTimersByTime(2000))
    expect(result.current.done).toBe(true)
    expect(removed).toHaveBeenCalledWith('visibilitychange', listener)
    expect(vi.getTimerCount()).toBe(0)
    added.mockClear()
    act(() => result.current.restart(3))
    expect(added).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    added.mockRestore()
    removed.mockRestore()
  })

  it('restarts on the same seconds as before (a resend that waits as long again)', () => {
    const { result } = renderHook(() => useCountdown(null))
    act(() => result.current.restart(120))
    act(() => vi.advanceTimersByTime(30_000))
    expect(result.current.remaining).toBe(90)
    act(() => result.current.restart(120))
    expect(result.current.remaining).toBe(120)
  })

  it('leaves no timer or listener behind once unmounted', () => {
    const removed = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => useCountdown(30))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
    expect(removed).toHaveBeenCalledWith('visibilitychange', expect.any(Function))
    removed.mockRestore()
  })
})
