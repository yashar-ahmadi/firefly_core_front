'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import type { RefObject } from 'react'
import { productPath } from '@/features/catalog/listing-routes'
import { toggleWishlistOnce, WISHLIST_TOGGLE_KEY } from '@/features/wishlist/hooks'
import type { WishlistProductCard } from '@/lib/api/types/catalog'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { useListRemovals } from '../lists/use-list-removals'

/** The name link of `slug`'s card in the grid: what a card's focus moves to. */
function cardLink(grid: HTMLElement | null, slug: string): HTMLElement | null {
  return grid?.querySelector<HTMLElement>(`article h3 a[href="${productPath(slug)}"]`) ?? null
}

export interface WishlistRemovalsOptions {
  /** The page's list as read, in order. */
  results: readonly WishlistProductCard[]
  page: number
  grid: RefObject<HTMLElement | null>
  pageHeading: RefObject<HTMLElement | null>
  goToPage: (page: number) => void
  /** The list is being read (`isFetching`): a card «بازگردانی» brought back may be on its way. */
  reading: boolean
}

/**
 * Hearts pressed while the wishlist page is open (a card's, or quick view's: every heart's write
 * goes through the shared toggle, P3-R4): the shared `useListRemovals` (the card leaves once the
 * removal succeeded, with «بازگردانی», the focus kept in the grid). Returns the cards to show.
 */
export function useWishlistRemovals(options: WishlistRemovalsOptions): WishlistProductCard[] {
  const client = useQueryClient()
  const { hasSession } = useSession()
  const router = useRouter()
  const expire = useSessionExpired()
  return useListRemovals({
    ...options,
    mutationKey: WISHLIST_TOGGLE_KEY,
    cardLink,
    restore: (product) =>
      void toggleWishlistOnce(
        client,
        { hasSession, router, expire },
        { id: product.id, slug: product.slug, save: true },
      ),
    removedMessage: (product) => `«${product.name}» از علاقه\u{200C}مندی\u{200C}ها حذف شد.`,
  })
}
