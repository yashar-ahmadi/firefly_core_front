'use client'

import { keepPreviousData, type QueryKey, type UseQueryResult } from '@tanstack/react-query'
import { READING_LIST_KEY } from '@/features/blog/reading-list'
import { bffFetch } from '@/lib/api/client'
import type { ReadingListPost } from '@/lib/api/types/blog'
import type { Paginated } from '@/lib/api/types/common'
import { useAccountQuery } from '../use-account-query'
import { readingListApiQuery, type ReadingListParams } from './reading-list-params'

// The reading list page's list through the BFF (blog digest §1.8), with the session only.

export type ReadingListPageData = Paginated<ReadingListPost>

/**
 * One page for these filters, under `['reading-list']` (SESSION_QUERIES: logout removes it; every
 * bookmark's write reads it again, wherever the bookmark was).
 */
export function readingListPageKey({ search, category, sort, page }: ReadingListParams): QueryKey {
  return [...READING_LIST_KEY, 'list', { search, category, sort, page }]
}

export async function fetchReadingListPage(
  params: ReadingListParams,
  signal?: AbortSignal,
): Promise<ReadingListPageData> {
  const query = readingListApiQuery(params)
  return (await bffFetch<ReadingListPageData>('blog/reading-list/list/', { query, signal })).data
}

/**
 * The list for the URL's filters (only while the blog is on: `enabled`); the page on screen stays
 * while the next one loads.
 */
export function useReadingListPage(
  params: ReadingListParams,
  enabled: boolean,
): UseQueryResult<ReadingListPageData> {
  return useAccountQuery({
    queryKey: readingListPageKey(params),
    queryFn: ({ signal }) => fetchReadingListPage(params, signal),
    placeholderData: keepPreviousData,
    enabled,
  })
}
