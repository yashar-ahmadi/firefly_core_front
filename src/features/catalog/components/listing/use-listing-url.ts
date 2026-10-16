'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  createContext,
  createElement,
  useContext,
  useMemo,
  useOptimistic,
  useTransition,
  type ReactNode,
} from 'react'
import { clearFilters } from '@/features/catalog/listing-filters'
import {
  listingHref,
  parseListingParams,
  toSearchParams,
  withoutContext,
  type ListingApiQuery,
  type ListingContext,
} from '@/features/catalog/listing-params'

/**
 * The browser URL is the single source of truth of a listing's filters, sort and page. Every
 * filter control reads and writes it through `useListingUrl()`; `ListingUrlProvider` (rendered
 * by `ProductListing`) shares one transition, so the grid can show that results are on the way.
 */

interface ListingUrlState {
  query: ListingApiQuery
  pending: boolean
  navigate: (next: ListingApiQuery) => void
}

const ListingUrlContext = createContext<ListingUrlState | null>(null)

/** The URL's listing query, parsed as the server parses it, without the route context's keys. */
function readUrl(params: URLSearchParams, context: ListingContext): ListingApiQuery {
  const raw = new Map<string, string[]>()
  for (const [key, value] of params) raw.set(key, [...(raw.get(key) ?? []), value])
  return withoutContext(parseListingParams(Object.fromEntries(raw)), context)
}

export interface ListingUrlProviderProps {
  /** The route's entity slugs: their keys are never read from or written to the URL. */
  context: ListingContext
  /** The route's path with its trailing slash; the query is appended to it. */
  basePath: string
  children: ReactNode
}

/**
 * Holds the listing's URL state. A change is shown at once (`useOptimistic`, so quick clicks
 * build on each other) while `router.replace` fetches the new results in a transition; the
 * scroll position is kept. Back and forward restore whatever the URL says.
 */
export function ListingUrlProvider({ context, basePath, children }: ListingUrlProviderProps) {
  const router = useRouter()
  const params = useSearchParams()
  const { category, brand, list } = context
  const fromUrl = useMemo(
    () => readUrl(params, { category, brand, list }),
    [params, category, brand, list],
  )
  const [query, setOptimisticQuery] = useOptimistic(fromUrl)
  const [pending, startTransition] = useTransition()

  const value = useMemo<ListingUrlState>(
    () => ({
      query,
      pending,
      navigate(next) {
        if (toSearchParams(next).toString() === toSearchParams(query).toString()) return
        startTransition(() => {
          setOptimisticQuery(next)
          router.replace(listingHref(basePath, next), { scroll: false })
        })
      },
    }),
    [query, pending, basePath, router, setOptimisticQuery],
  )
  return createElement(ListingUrlContext, { value }, children)
}

function useListingState(): ListingUrlState {
  const state = useContext(ListingUrlContext)
  if (state === null) throw new Error('useListingUrl() needs a ListingUrlProvider above it')
  return state
}

export interface ListingUrl {
  /** The URL's filters, sort and page (never the route context's keys). */
  query: ListingApiQuery
  /** Applies `patch` (an `undefined` or empty value removes a key) and goes back to page 1. */
  set(patch: Partial<ListingApiQuery>): void
  /** Removes every filter; the sort and `special_first` stay. */
  clear(): void
}

/**
 * Read and change the listing URL. Writes go through `toSearchParams`: sorted keys, unknown
 * params dropped, `page` reset on every change.
 */
export function useListingUrl(): ListingUrl {
  const { query, navigate } = useListingState()
  return useMemo(
    () => ({
      query,
      set: (patch) => navigate({ ...query, ...patch, page: undefined }),
      clear: () => navigate(clearFilters(query)),
    }),
    [query, navigate],
  )
}

/** Whether new results for a URL change are still on the way. */
export function useListingPending(): boolean {
  return useListingState().pending
}
