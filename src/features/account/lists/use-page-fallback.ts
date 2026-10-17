'use client'

import { useEffect, useEffectEvent } from 'react'
import { isApiNotFound } from '@/lib/api/errors'

/**
 * A page past the end (`404 not_found`, digest §0.2: the list shrank, or an old link) goes to the
 * last page there is: page 1 is read (`readFirst`, into its cache entry) for `total_pages`, then
 * `goTo` that page (one before the asked page at most). Page 1 itself always exists: a 404 there
 * is an error like any other. Returns whether the page is on its way (show the skeleton).
 */
export function usePageFallback({
  error,
  page,
  readFirst,
  goTo,
}: {
  error: unknown
  page: number
  readFirst: () => Promise<{ total_pages: number }>
  goTo: (page: number) => void
}): boolean {
  const pastTheEnd = page > 1 && isApiNotFound(error)
  const read = useEffectEvent(readFirst)
  const go = useEffectEvent(goTo)
  useEffect(() => {
    if (!pastTheEnd) return
    let gone = false
    read().then(
      (first) => {
        if (!gone) go(Math.max(1, Math.min(first.total_pages, page - 1)))
      },
      () => {
        if (!gone) go(1)
      },
    )
    return () => {
      gone = true
    }
  }, [pastTheEnd, page])
  return pastTheEnd
}
