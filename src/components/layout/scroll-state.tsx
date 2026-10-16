'use client'

import { useEffect } from 'react'

// The shell's scroll state, written to <html> as `data-compact` (scrolling down: the header
// shows its essential row only and the mobile bottom bar hides) and `data-scrolled` (the page is
// not at the top: the header casts a shadow). CSS reacts through the `compact:` and `scrolled:`
// variants (src/styles/globals.css), so scrolling never re-renders React.

export interface ScrollState {
  /** Where the last direction change was decided. */
  anchorY: number
  compact: boolean
}

/** Smaller movements (jitter, rubber-banding) do not change direction. */
const THRESHOLD = 8
/** Above this the header is always shown in full: roughly the announcement plus the header. */
const TOP_ZONE = 160

/**
 * The next state for scroll position `y`. Movements accumulate from the anchor until they pass
 * the threshold, so slow scrolling counts too.
 */
export function nextScrollState(state: ScrollState, y: number): ScrollState {
  const position = Math.max(0, y)
  if (position <= TOP_ZONE) return { anchorY: position, compact: false }
  const delta = position - state.anchorY
  if (Math.abs(delta) <= THRESHOLD) return state
  return { anchorY: position, compact: delta > 0 }
}

/** Mount once in the shop layout. Renders nothing. */
export function ScrollWatcher() {
  useEffect(() => {
    const root = document.documentElement
    let state: ScrollState = { anchorY: Math.max(0, window.scrollY), compact: false }
    let frame = 0
    const update = () => {
      frame = 0
      state = nextScrollState(state, window.scrollY)
      root.toggleAttribute('data-compact', state.compact)
      root.toggleAttribute('data-scrolled', window.scrollY > 0)
    }
    const onScroll = () => {
      frame ||= window.requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.cancelAnimationFrame(frame)
      root.removeAttribute('data-compact')
      root.removeAttribute('data-scrolled')
    }
  }, [])
  return null
}
