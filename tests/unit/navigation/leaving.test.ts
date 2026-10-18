import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LEAVING_MS, releaseIfStillHere } from '@/lib/navigation/leaving'

// A press that started a full page load is given back when the browser did not leave after all:
// after a bounded wait, or at once when the page is restored from the back-forward cache.

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const pageshow = (persisted: boolean) =>
  window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }))

describe('releaseIfStillHere', () => {
  it('releases once, after the wait', () => {
    const release = vi.fn()
    releaseIfStillHere(release)
    vi.advanceTimersByTime(LEAVING_MS - 1)
    expect(release).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    pageshow(true)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('releases at once on a cache restore, never for an ordinary pageshow, and only once', () => {
    const release = vi.fn()
    releaseIfStillHere(release)
    pageshow(false)
    expect(release).not.toHaveBeenCalled()
    pageshow(true)
    vi.advanceTimersByTime(LEAVING_MS)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('cancelled (an unmount): never releases', () => {
    const release = vi.fn()
    const stop = releaseIfStillHere(release)
    stop()
    pageshow(true)
    vi.advanceTimersByTime(LEAVING_MS)
    expect(release).not.toHaveBeenCalled()
  })
})
