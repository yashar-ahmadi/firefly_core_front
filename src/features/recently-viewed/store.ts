import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { ensureHydrated, savedItems, syncAcrossTabs } from '@/lib/store/persisted'

/** How many recently viewed products are kept. */
export const RECENT_MAX = 20

/**
 * What the strip shows of a viewed product: picture, name and link. No price, stock or rating:
 * kept on the device they would go stale, and prices come only from the API.
 */
export interface RecentItem {
  id: number
  slug: string
  name: string
  image: string
}

/** A copy with only those fields (drops whatever else a caller or an older version saved). */
export function toRecentItem({ id, slug, name, image }: RecentItem): RecentItem {
  return { id, slug, name, image }
}

export function isRecentItem(value: unknown): value is RecentItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'number' &&
    typeof item.slug === 'string' &&
    typeof item.name === 'string' &&
    typeof item.image === 'string'
  )
}

export interface RecentlyViewedState {
  /** Most recent first, one per slug. */
  items: RecentItem[]
  /** Moves the product to the front (replacing an older copy) and keeps `RECENT_MAX`. */
  record: (item: RecentItem) => void
  clear: () => void
}

/**
 * Recently viewed products, saved in localStorage (`ff-recent`). Rehydrated after mount: render
 * the list through `usePersistHydration(useRecentlyViewed)`. A product viewed in another tab is
 * read again here (`syncAcrossTabs`).
 */
export const useRecentlyViewed = create<RecentlyViewedState>()(
  persist(
    (set, get, api) => ({
      items: [],
      record: (item) => {
        ensureHydrated(api)
        const entry = toRecentItem(item)
        const others = get().items.filter((listed) => listed.slug !== entry.slug)
        set({ items: [entry, ...others].slice(0, RECENT_MAX) })
      },
      clear: () => {
        ensureHydrated(api)
        set({ items: [] })
      },
    }),
    {
      name: 'ff-recent',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
      merge: (saved, current) => ({
        ...current,
        items: savedItems(saved, isRecentItem).map(toRecentItem).slice(0, RECENT_MAX),
      }),
      skipHydration: true,
    },
  ),
)

syncAcrossTabs(useRecentlyViewed)
