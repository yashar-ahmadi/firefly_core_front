import type { ComponentType } from 'react'
import type { SearchOverlayProps } from './search-overlay'

// The phone search overlay's code, loaded once per page: on idle after hydration on touch phones,
// on a press of the header field, or on the first opening. Kept out of mobile-search.tsx so the
// header field knows synchronously whether the overlay can open within the tap (iOS raises the
// keyboard only for a focus moved inside the user's gesture).

export type OverlayComponent = ComponentType<SearchOverlayProps>

/** Touch phones: the header row with the overlay's trigger shows below md (48rem). */
export const PHONE_TOUCH_QUERY = '(pointer: coarse) and (max-width: 47.98rem)'
/** Where requestIdleCallback is missing (Safari before 18), the preload waits this long. */
export const IDLE_FALLBACK_MS = 1_500

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
 * On a touch phone, load the overlay's code once the page is idle after hydration (with a
 * setTimeout fallback), so the first tap can open it inside the gesture. Returns a cleanup.
 */
export function preloadOverlayWhenIdle(onLoaded: (overlay: OverlayComponent) => void): () => void {
  if (loaded || typeof window.matchMedia !== 'function') return () => {}
  if (!window.matchMedia(PHONE_TOUCH_QUERY).matches) return () => {}
  let cancelled = false
  const load = () => {
    void loadOverlay().then((overlay) => {
      if (overlay && !cancelled) onLoaded(overlay)
    })
  }
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(load, { timeout: 4_000 })
    return () => {
      cancelled = true
      window.cancelIdleCallback(id)
    }
  }
  const timer = setTimeout(load, IDLE_FALLBACK_MS)
  return () => {
    cancelled = true
    clearTimeout(timer)
  }
}

/** Test hook: forget the loaded code. */
export function resetOverlayLoader(): void {
  loaded = null
  loading = null
}
