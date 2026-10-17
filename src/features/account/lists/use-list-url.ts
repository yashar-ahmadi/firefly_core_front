'use client'

import { useSearchParams } from 'next/navigation'
import { useMemo, type MouseEvent } from 'react'
import { isModifiedClick } from '@/lib/navigation/modified-click'
import { useLeavingPage } from '@/lib/navigation/router-navigation'

// An account list's state in the URL (the wishlist, my comments): read on every render, so a
// reload, Back and a shared link show the same list. The page's server component never reads
// the query, so a change only rewrites the URL with the native history API, which Next keeps in
// step with `useSearchParams` (docs: Linking and Navigating, «Native History API»): no server
// round trip, and the scroll stays where it is.

export interface ListUrl<P> {
  /** The URL's state, parsed (unknown values already the defaults). */
  params: P
  /** The page's URL for `next` (a pager or filter link). */
  href: (next: P) => string
  /**
   * Shows `next` in place of this history entry (a sort, a switch, a page that went). Not while
   * the visitor is on the way to another page: Next would turn the rewrite into a restore of
   * this one, which drops that navigation.
   */
  replace: (next: P) => void
  /**
   * A filter link's click: its URL as a new history entry (Back returns to the filter before).
   * A click that opens a new tab or window is left to the browser, like the link without script.
   */
  follow: (event: MouseEvent<HTMLAnchorElement>) => void
}

const here = () => `${window.location.pathname}${window.location.search}`
const ignore = () => {}

/**
 * `parse` and `search` are a page's pure pair (module functions, so stable): the URL's query to
 * the state, and the state back to `?…` with its defaults left out.
 */
export function useListUrl<P>(
  basePath: string,
  parse: (search: URLSearchParams) => P,
  search: (params: P) => string,
): ListUrl<P> {
  const query = useSearchParams().toString()
  const leaving = useLeavingPage(ignore)
  return useMemo(() => {
    const params = parse(new URLSearchParams(query))
    const href = (next: P) => `${basePath}${search(next)}`
    return {
      params,
      href,
      replace: (next) => {
        if (leaving || search(next) === search(params)) return
        window.history.replaceState(null, '', href(next))
      },
      follow: (event) => {
        if (event.defaultPrevented || isModifiedClick(event)) return
        event.preventDefault()
        const target = event.currentTarget.getAttribute('href')
        if (target && target !== here()) window.history.pushState(null, '', target)
      },
    }
  }, [basePath, parse, search, query, leaving])
}
