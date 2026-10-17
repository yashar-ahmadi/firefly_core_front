'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useMemo } from 'react'

// An account list's state in the URL (the wishlist, my comments): read on every render, so a
// reload, Back and a shared link show the same list.

export interface ListUrl<P> {
  /** The URL's state, parsed (unknown values already the defaults). */
  params: P
  /** The page's URL for `next` (a pager or tab link). */
  href: (next: P) => string
  /** Shows `next` in place of this history entry, keeping the scroll (a sort, a switch). */
  replace: (next: P) => void
}

/**
 * `parse` and `search` are a page's pure pair (module functions, so stable): the URL's query to
 * the state, and the state back to `?…` with its defaults left out.
 */
export function useListUrl<P>(
  basePath: string,
  parse: (search: URLSearchParams) => P,
  search: (params: P) => string,
): ListUrl<P> {
  const router = useRouter()
  const query = useSearchParams().toString()
  return useMemo(() => {
    const params = parse(new URLSearchParams(query))
    const href = (next: P) => `${basePath}${search(next)}`
    return {
      params,
      href,
      replace: (next) => {
        if (search(next) !== search(params)) router.replace(href(next), { scroll: false })
      },
    }
  }, [basePath, parse, search, query, router])
}
