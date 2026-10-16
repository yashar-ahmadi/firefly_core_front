import { useCallback, useEffect, useSyncExternalStore } from 'react'

// Zustand stores saved in localStorage are created with `skipHydration`. The server and the
// hydrating client render both read the empty initial state (zustand serves `getInitialState()`
// as the server snapshot), and the saved state is read after mount: markup never mismatches.

/** The part of a zustand `persist` store's API used here. */
export interface PersistedStore {
  persist: {
    hasHydrated: () => boolean
    rehydrate: () => Promise<void> | void
    onFinishHydration: (listener: (state: unknown) => void) => () => void
    getOptions: () => { name?: string }
  }
}

/**
 * Keeps the store in step with the visitor's other tabs: when another tab writes (or clears)
 * the store's localStorage key, the saved state is read again. Call once, at module level, in
 * the browser. A store not yet hydrated reads the latest value at its own first read anyway.
 */
export function syncAcrossTabs(store: PersistedStore): void {
  if (typeof window === 'undefined') return
  window.addEventListener('storage', (event) => {
    if (event.storageArea !== window.localStorage) return
    // `key` is null when the other tab cleared the whole storage.
    if (event.key !== null && event.key !== store.persist.getOptions().name) return
    if (store.persist.hasHydrated()) void store.persist.rehydrate()
  })
}

/**
 * Reads the saved state now if it has not been read yet (localStorage answers synchronously).
 * Store actions call this first, so a change made before the mount effect (a recorder's own
 * effect, say) never overwrites what was saved. `persist` is missing on the server, where there
 * is no storage.
 */
export function ensureHydrated(store: Partial<PersistedStore>): void {
  if (store.persist && !store.persist.hasHydrated()) void store.persist.rehydrate()
}

/**
 * Rehydrates the store after mount and tells whether it has been: `false` during the server
 * render and hydration, then `true`. Use it to hold back UI that would show a wrong state.
 */
export function usePersistHydration(store: PersistedStore): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => store.persist.onFinishHydration(onChange),
    [store],
  )
  const hydrated = useSyncExternalStore(
    subscribe,
    () => store.persist.hasHydrated(),
    () => false,
  )
  useEffect(() => ensureHydrated(store), [store])
  return hydrated
}

/** The `items` array of a saved state, keeping only well-formed entries. */
export function savedItems<T>(saved: unknown, isItem: (value: unknown) => value is T): T[] {
  const items = typeof saved === 'object' && saved !== null && 'items' in saved ? saved.items : null
  return Array.isArray(items) ? items.filter(isItem) : []
}
