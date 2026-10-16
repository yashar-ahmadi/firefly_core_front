import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { ensureHydrated, savedItems, syncAcrossTabs } from '@/lib/store/persisted'
import { isCompareItem, type CompareItem } from './compare-item'

export { compareItemFrom, deepestCategoryId, type CompareItem } from './compare-item'

/** The most products the compare page lays side by side. */
export const COMPARE_MAX = 4

export type CompareAddResult = 'added' | 'full' | 'exists'

export interface CompareState {
  /** In the order they were added. */
  items: CompareItem[]
  /** `exists` for a slug already listed, `full` at `COMPARE_MAX` items. */
  add: (item: CompareItem) => CompareAddResult
  remove: (slug: string) => void
  clear: () => void
}

/**
 * The compare list, saved in localStorage (`ff-compare`). Rehydrated after mount: render the
 * list through `usePersistHydration(useCompare)` to avoid showing the empty state as real. A
 * change made in another tab is read again here (`syncAcrossTabs`).
 */
export const useCompare = create<CompareState>()(
  persist(
    (set, get, api) => ({
      items: [],
      add: (item) => {
        ensureHydrated(api)
        const { items } = get()
        if (items.some((listed) => listed.slug === item.slug)) return 'exists'
        if (items.length >= COMPARE_MAX) return 'full'
        const { slug, name, image, categoryId } = item
        set({ items: [...items, { slug, name, image, categoryId }] })
        return 'added'
      },
      remove: (slug) => {
        ensureHydrated(api)
        set({ items: get().items.filter((item) => item.slug !== slug) })
      },
      clear: () => {
        ensureHydrated(api)
        set({ items: [] })
      },
    }),
    {
      name: 'ff-compare',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items }),
      merge: (saved, current) => ({
        ...current,
        items: savedItems(saved, isCompareItem).slice(0, COMPARE_MAX),
      }),
      skipHydration: true,
    },
  ),
)

syncAcrossTabs(useCompare)
