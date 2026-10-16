'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { bffFetch } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import type { SearchSuggestion, SearchSuggestions } from '@/lib/api/types/search'
import { isSearchable, normalizeQuery } from './query'

/** The pause in typing that sends a request. */
export const SUGGEST_DEBOUNCE_MS = 250
/** How long an answer is reused for the same term (the plan's suggestion cache). */
export const SUGGEST_STALE_MS = 60_000
/** A 429 without `Retry-After` pauses suggestions this long. */
const DEFAULT_PAUSE_S = 60

export interface SuggestionsState {
  /** The suggestions for the term, or the last term's while the next is on its way; null for none. */
  data: SearchSuggestions | null
  /** A request for the current term is still to come or on its way. */
  isLoading: boolean
}

interface Settled {
  term: string
  data: SearchSuggestions | null
}

function list(value: unknown): SearchSuggestion[] {
  return Array.isArray(value) ? value : []
}

async function fetchSuggestions(term: string, signal: AbortSignal): Promise<SearchSuggestions> {
  const { data } = await bffFetch<SearchSuggestions>('search/suggest/', {
    query: { q: term },
    signal,
  })
  return {
    query: typeof data?.query === 'string' ? data.query : term,
    products: list(data?.products),
    product_categories: list(data?.product_categories),
    brands: list(data?.brands),
  }
}

/**
 * Type-ahead suggestions for `q` (content digest §7.2), read through the BFF.
 * - The term is normalised as the API does it (digits, Arabic letters, kashida, ZWNJ…), so a
 *   term under two characters sends nothing and spelling variants share one cache entry.
 * - A request leaves after a 250 ms pause in typing. Each keystroke aborts the request on its
 *   way (one AbortController per term), and an answer for a term the input has left is never
 *   applied: older answers cannot overwrite newer ones.
 * - Answers are kept 60 s in the TanStack cache (`staleTime`): the same term again within
 *   them is answered at once, without a request. Nothing is cached on the server: the BFF
 *   forwards every call `no-store`, and the API's suggest throttle counts per visitor anyway.
 * - Any failure (400, 429, 5xx, network) means "no suggestions": `data` is null, nothing is
 *   thrown or shown. A 429 pauses requests for its `Retry-After`.
 * While a new term loads, the last term's suggestions stay up, so the list does not flicker.
 */
export function useSuggestions(q: string): SuggestionsState {
  const client = useQueryClient()
  const term = normalizeQuery(q)
  const searchable = isSearchable(term)
  const [settled, setSettled] = useState<Settled | null>(null)
  const pausedUntil = useRef(0)

  // Under two characters there is nothing to suggest: forget the last answer, so a new term
  // never shows it (adjusting state during render, as React recommends for changed inputs).
  if (!searchable && settled !== null) setSettled(null)

  useEffect(() => {
    if (!searchable) return
    const controller = new AbortController()
    const settle = (data: SearchSuggestions | null) => {
      if (!controller.signal.aborted) setSettled({ term, data })
    }
    const load = () => {
      if (Date.now() < pausedUntil.current) return settle(null)
      client
        .fetchQuery({
          queryKey: ['search-suggest', term],
          queryFn: () => fetchSuggestions(term, controller.signal),
          staleTime: SUGGEST_STALE_MS,
          retry: false,
        })
        .then(settle, (error: unknown) => {
          if (error instanceof ApiError && error.status === 429) {
            pausedUntil.current = Date.now() + (error.retryAfter ?? DEFAULT_PAUSE_S) * 1000
          }
          settle(null)
        })
    }
    const cached = client.getQueryState(['search-suggest', term])
    const fresh = cached?.data !== undefined && Date.now() - cached.dataUpdatedAt < SUGGEST_STALE_MS
    // A fresh answer needs no pause: nothing is sent.
    const timer = window.setTimeout(load, fresh ? 0 : SUGGEST_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [client, term, searchable])

  if (!searchable) return { data: null, isLoading: false }
  return { data: settled?.data ?? null, isLoading: settled?.term !== term }
}
