'use client'

import { keepPreviousData, type QueryKey, type UseQueryResult } from '@tanstack/react-query'
import { bffFetch } from '@/lib/api/client'
import type { WishlistProductCard } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'
import { useAccountQuery } from '../use-account-query'
import { wishlistApiQuery, type WishlistParams } from './wishlist-params'

// The wishlist page's list through the BFF (product digest §3.15), with the session only.

export type WishlistPageData = Paginated<WishlistProductCard>

/**
 * One page for these filters, under `['wishlist']` (P3-R4: logout removes it; every heart's
 * write reads it again, wherever the heart was).
 */
export function wishlistListKey({ sort, inStock, page }: WishlistParams): QueryKey {
  return ['wishlist', 'list', { sort, inStock, page }]
}

export async function fetchWishlistPage(
  params: WishlistParams,
  signal?: AbortSignal,
): Promise<WishlistPageData> {
  const query = wishlistApiQuery(params)
  return (await bffFetch<WishlistPageData>('product/wishlist/list/', { query, signal })).data
}

/** The list for the URL's filters; the page on screen stays while the next one loads. */
export function useWishlistList(params: WishlistParams): UseQueryResult<WishlistPageData> {
  return useAccountQuery({
    queryKey: wishlistListKey(params),
    queryFn: ({ signal }) => fetchWishlistPage(params, signal),
    placeholderData: keepPreviousData,
  })
}
