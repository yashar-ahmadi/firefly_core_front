import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { ensureHydrated, savedItems } from '@/lib/store/persisted'
import { isSearchable, MAX_QUERY_LENGTH, normalizeQuery } from './query'

/** How many recent searches are kept. */
export const RECENT_SEARCHES_MAX = 8
export const RECENT_SEARCHES_KEY = 'ff-recent-searches'

/**
 * localStorage that never throws: a browser that refuses storage (blocked site data, a full
 * quota, some private modes, even a throwing `window.localStorage` getter) keeps the list for
 * the page only.
 */
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value)
    } catch {
      // Not saved: the list lasts until the page is left.
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name)
    } catch {
      // Nothing to do.
    }
  },
}

/** The term as shown: spaces collapsed, trimmed, at most the API's raw limit. */
function displayTerm(raw: string): string {
  return Array.from(raw.replace(/\s+/gu, ' ').trim()).slice(0, MAX_QUERY_LENGTH).join('')
}

/** Two terms are one entry when the API would read them alike (letters, digits, case). */
function identity(term: string): string {
  return normalizeQuery(term).toLowerCase()
}

/** Newest first, one per identity, only searchable terms, at most RECENT_SEARCHES_MAX. */
function tidy(terms: string[]): string[] {
  const seen = new Set<string>()
  const kept: string[] = []
  for (const raw of terms) {
    const term = displayTerm(raw)
    const key = identity(term)
    if (!isSearchable(key) || seen.has(key)) continue
    seen.add(key)
    kept.push(term)
  }
  return kept.slice(0, RECENT_SEARCHES_MAX)
}

export interface RecentSearchesState {
  /** Newest first, as last typed. */
  items: string[]
  /** Puts the term first (replacing an earlier spelling of it); terms the API would refuse are skipped. */
  add: (term: string) => void
  remove: (term: string) => void
  clear: () => void
}

/**
 * What this device searched lately, saved in localStorage (`ff-recent-searches`). Rehydrated
 * after mount: render the list through `usePersistHydration(useRecentSearches)`, so the server
 * render and hydration never show it.
 */
export const useRecentSearches = create<RecentSearchesState>()(
  persist(
    (set, get, api) => ({
      items: [],
      add: (term) => {
        ensureHydrated(api)
        set({ items: tidy([term, ...get().items]) })
      },
      remove: (term) => {
        ensureHydrated(api)
        const key = identity(term)
        set({ items: get().items.filter((item) => identity(item) !== key) })
      },
      clear: () => {
        ensureHydrated(api)
        set({ items: [] })
      },
    }),
    {
      name: RECENT_SEARCHES_KEY,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ items: state.items }),
      merge: (saved, current) => ({
        ...current,
        items: tidy(savedItems(saved, (value): value is string => typeof value === 'string')),
      }),
      skipHydration: true,
    },
  ),
)
