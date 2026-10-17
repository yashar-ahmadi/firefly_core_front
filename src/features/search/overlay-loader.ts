import type { ComponentType } from 'react'
import type { SearchOverlayProps } from './search-overlay'

// The phone search overlay's code, loaded once per page: on touch phones at the visitor's first
// interaction (a touch, a scroll or a key anywhere), on the header field's focus or press, or on
// the first opening. Not on idle: a page nobody touches does not pay for it (the phone routes'
// JavaScript budget, P2-R4). Kept out of mobile-search.tsx so the header field knows
// synchronously whether the overlay can open within the tap (iOS raises the keyboard only for a
// focus moved inside the user's gesture).

export type OverlayComponent = ComponentType<SearchOverlayProps>

/** Touch phones: the header row with the overlay's trigger shows below md (48rem). */
export const PHONE_TOUCH_QUERY = '(pointer: coarse) and (max-width: 47.98rem)'

/** The first of these anywhere on the page starts the preload (capture: scroll does not bubble). */
const FIRST_INTERACTIONS = ['touchstart', 'scroll', 'keydown'] as const
const LISTENER = { capture: true, passive: true } as const

let loaded: OverlayComponent | null = null
let loading: Promise<OverlayComponent | null> | null = null

/** The overlay component when its code is already in, else null. */
export function loadedOverlay(): OverlayComponent | null {
  return loaded
}

/**
 * Load the overlay's code (once). Resolves to null when the download fails (a stale chunk after
 * a deploy, a dropped connection); the next call tries again.
 */
export function loadOverlay(): Promise<OverlayComponent | null> {
  loading ??= import('./search-overlay')
    .then((module) => (loaded = module.SearchOverlay))
    .catch(() => {
      loading = null
      return null
    })
  return loading
}

/**
 * On a touch phone, load the overlay's code at the visitor's first touch, scroll or key press
 * anywhere on the page, so the tap on the header field that usually follows can open it inside
 * the gesture. (The field's own focus and press load it too, see MobileSearch.) Returns a cleanup.
 */
export function preloadOverlayOnFirstInteraction(
  onLoaded: (overlay: OverlayComponent) => void,
): () => void {
  if (loaded || typeof window.matchMedia !== 'function') return () => {}
  if (!window.matchMedia(PHONE_TOUCH_QUERY).matches) return () => {}
  let cancelled = false
  const stop = () => {
    for (const type of FIRST_INTERACTIONS) window.removeEventListener(type, load, LISTENER)
  }
  function load() {
    stop()
    void loadOverlay().then((overlay) => {
      if (overlay && !cancelled) onLoaded(overlay)
    })
  }
  for (const type of FIRST_INTERACTIONS) window.addEventListener(type, load, LISTENER)
  return () => {
    cancelled = true
    stop()
  }
}

/** Test hook: forget the loaded code. */
export function resetOverlayLoader(): void {
  loaded = null
  loading = null
}
