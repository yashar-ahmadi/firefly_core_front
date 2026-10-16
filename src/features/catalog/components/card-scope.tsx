'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useHydrated } from '@/components/ui/use-media-query'
import { addToCartOnce } from '@/features/cart/hooks'
import { useCompare } from '@/features/compare/store'
import { toggleWishlistOnce, useWishlistIds } from '@/features/wishlist/hooks'
import { usePersistHydration } from '@/lib/store/persisted'
import { useSession } from '@/lib/session/session-context'

/** What every card of a grid or rail reads, from one set of subscriptions. */
export interface CardScopeValue {
  /** False during the server render and hydration. */
  hydrated: boolean
  /** Saved product ids (empty for guests); `loading` while a signed-in visitor's are read. */
  saved: ReadonlySet<number>
  savedLoading: boolean
  /** Compared product slugs, and whether the saved compare list has been read. */
  compared: ReadonlySet<string>
  compareReady: boolean
  /** One wishlist toggle; the mutation is created by the call. Never rejects. */
  toggleWishlist: (product: { id: number; slug: string }) => Promise<void>
  /** One add to the cart; the mutation is created by the call. Resolves true once added. */
  addToCart: (
    variant: number,
    quantity: number,
    meta: { name: string; image: string },
  ) => Promise<boolean>
}

const CardScopeContext = createContext<CardScopeValue | null>(null)

/** The scope of the nearest grid or rail, or null outside one. */
export function useCardScope(): CardScopeValue | null {
  return useContext(CardScopeContext)
}

/**
 * One scope per grid or rail of product cards: the hydration flag, the wishlist ids query and
 * the compare list are subscribed to once here instead of in every card, and the cards' writes
 * (heart, add to cart) create their mutation only when pressed. CardActions reads it.
 */
export function CardScope({ children }: { children: ReactNode }) {
  const hydrated = useHydrated()
  const { ids, isLoading } = useWishlistIds()
  const compareReady = usePersistHydration(useCompare)
  const items = useCompare((state) => state.items)
  const { hasSession } = useSession()
  const router = useRouter()
  const client = useQueryClient()

  const value = useMemo<CardScopeValue>(
    () => ({
      hydrated,
      saved: ids,
      savedLoading: isLoading,
      compared: new Set(items.map((item) => item.slug)),
      compareReady,
      toggleWishlist: (product) => toggleWishlistOnce(client, router, hasSession, product),
      addToCart: (variant, quantity, meta) =>
        addToCartOnce(client, { variant, quantity, meta, toast: true }),
    }),
    [hydrated, ids, isLoading, items, compareReady, client, router, hasSession],
  )
  return <CardScopeContext value={value}>{children}</CardScopeContext>
}
