import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { isCardProduct, toCardProduct, type CardProduct } from '@/features/catalog/card-product'
import { ensureHydrated, savedItems } from '@/lib/store/persisted'

/** How many recently viewed products are kept. */
export const RECENT_MAX = 20

/** Enough of the card to render a ProductCard without a request. */
export type RecentItem = CardProduct

export interface RecentlyViewedState {
  /** Most recent first, one per slug. */
  items: RecentItem[]
  /** Moves the product to the front (replacing an older copy) and keeps `RECENT_MAX`. */
  record: (item: RecentItem) => void
  clear: () => void
}

/**
 * Recently viewed products, saved in localStorage (`ff-recent`). Rehydrated after mount: render
 * the list through `usePersistHydration(useRecentlyViewed)`.
 */
export const useRecentlyViewed = create<RecentlyViewedState>()(
  persist(
    (set, get, api) => ({
      items: [],
      record: (item) => {
        ensureHydrated(api)
        const entry = toCardProduct(item)
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
        items: savedItems(saved, isCardProduct).map(toCardProduct).slice(0, RECENT_MAX),
      }),
      skipHydration: true,
    },
  ),
)
