import { useCallback, useEffect, useRef } from 'react'

// A press that sent the browser to another page by a full load (`loadPage`, a bank's form) stays
// taken while the browser leaves: a second press would only meet what the first one opened. But
// the browser may not leave after all: the visitor pressed Esc, the load failed and they came
// Back, or this very page comes back from the back-forward cache with its old state. Nothing
// tells the page about an aborted load, so the press comes back after a bounded wait, and at
// once when the page is restored from the cache (`pageshow` with `persisted`).

/** How long a press that started a full page load stays taken, at most. */
export const LEAVING_MS = 4_000

/**
 * Calls `release` after `ms`, or at once on a back-forward cache restore, whichever comes first,
 * and only once. Returns a function that cancels it (without releasing), for an unmount.
 */
export function releaseIfStillHere(release: () => void, ms: number = LEAVING_MS): () => void {
  const onShow = (event: PageTransitionEvent) => {
    if (event.persisted) done()
  }
  const stop = () => {
    clearTimeout(timer)
    window.removeEventListener('pageshow', onShow)
  }
  const done = () => {
    stop()
    release()
  }
  const timer = setTimeout(done, ms)
  window.addEventListener('pageshow', onShow)
  return stop
}

/**
 * `releaseIfStillHere` for a component: `hold(release)` starts one (a new one replaces the last),
 * and an unmount cancels it.
 */
export function useReleaseIfStillHere(): (release: () => void) => void {
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])
  return useCallback((release: () => void) => {
    stop.current?.()
    stop.current = releaseIfStillHere(() => {
      stop.current = null
      release()
    })
  }, [])
}
