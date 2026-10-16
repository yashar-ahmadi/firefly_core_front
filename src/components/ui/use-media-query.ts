import { useCallback, useSyncExternalStore } from 'react'

// Media-query hooks built on useSyncExternalStore: the server render and hydration use the
// fallback, then React re-renders with the real value, so hydration never mismatches.

/**
 * The viewport width from which a sheet becomes a side drawer (Tailwind `md`, 48rem). Here, not
 * in sheet.tsx, so a trigger can test it without loading the sheet's code.
 */
export const SHEET_SIDE_QUERY = '(min-width: 48rem)'

function canMatch(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

/**
 * Whether `query` matches, e.g. `useMediaQuery('(min-width: 768px)')`. Returns
 * `serverFallback` on the server, during hydration and where matchMedia is missing.
 */
export function useMediaQuery(query: string, serverFallback = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canMatch()) return () => {}
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => (canMatch() ? window.matchMedia(query).matches : serverFallback),
    () => serverFallback,
  )
}

/** Whether the visitor asked the system for less motion. False on the server. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}

const subscribeNever = () => () => {}

/** False during the server render and hydration, true from the first client render after. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  )
}
