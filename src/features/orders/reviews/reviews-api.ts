'use client'

import { keepPreviousData, type QueryKey, type UseQueryResult } from '@tanstack/react-query'
import { useAccountQuery } from '@/features/account/use-account-query'
import { bffFetch } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types/common'
import type { AwaitingReviewOrder, PurchaseReviewRequest } from '@/lib/api/types/order-review'
import { ORDERS_KEY } from '@/lib/session/viewer-queries'

// The purchases awaiting a review and a review's submission, through the BFF with the session
// (order digest §3.1.6–3.1.7). The list is not gated by `product_comments` (only the submission
// is); its key is under `ORDERS_KEY` (SESSION_QUERIES: a logout removes it).

export type AwaitingPage = Paginated<AwaitingReviewOrder>

export const AWAITING_REVIEWS_KEY = [...ORDERS_KEY, 'awaiting-reviews'] as const
export const awaitingReviewsKey = (page: number): QueryKey => [...AWAITING_REVIEWS_KEY, page]

export async function fetchAwaitingReviews(page: number, signal?: AbortSignal) {
  const query = page > 1 ? { page } : {}
  return (await bffFetch<AwaitingPage>('order/review/awaiting/list/', { query, signal })).data
}

/** One page, newest delivery first; the page on screen stays while the next loads. */
export function useAwaitingReviews(page: number): UseQueryResult<AwaitingPage> {
  return useAccountQuery({
    queryKey: awaitingReviewsKey(page),
    queryFn: ({ signal }) => fetchAwaitingReviews(page, signal),
    placeholderData: keepPreviousData,
  })
}

/** `POST order/<code>/review/` (30/h, success only). Resolves with the API's sentence. */
export async function submitReview(code: string, body: PurchaseReviewRequest): Promise<string> {
  return (await bffFetch<Record<string, never>>(`order/${code}/review/`, { method: 'POST', body }))
    .msg
}
