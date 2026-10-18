import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BANK_LEAVING_MS,
  LEAVING_MS,
  releaseIfStillHere,
  useReleaseIfStillHere,
} from '@/lib/navigation/leaving'

// A press that started a full page load is given back when the browser did not leave after all:
// after a bounded wait, or at once when the page is restored from the back-forward cache. One of
// our own pages (the card page) loads within the short bound; a bank's page gets a longer one.

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

describe('a bank’s page', () => {
  it('waits longer than one of our pages', () => {
    expect(BANK_LEAVING_MS).toBeGreaterThanOrEqual(3 * LEAVING_MS)
    const release = vi.fn()
    const { result } = renderHook(() => useReleaseIfStillHere(BANK_LEAVING_MS))
    result.current(release)
    vi.advanceTimersByTime(BANK_LEAVING_MS - 1)
    expect(release).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('the hook’s default is the short bound', () => {
    const release = vi.fn()
    const { result } = renderHook(() => useReleaseIfStillHere())
    result.current(release)
    vi.advanceTimersByTime(LEAVING_MS)
    expect(release).toHaveBeenCalledTimes(1)
  })
})
