'use client'

import { useQueryClient } from '@tanstack/react-query'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

// A logout clears the cache while the page it leaves is still on screen: that page's queries
// are still observed then, so a sweep of the unobserved ones cannot take them. They are swept
// once more when the navigation home has committed, whatever their key (the cleanup registry,
// `SESSION_QUERIES`, need not know them).

let pending = false

/** One more sweep of the queries nothing on screen reads, after the next navigation commits. */
export function sweepAfterNavigation(): void {
  pending = true
}

/**
 * Runs that sweep. Mounted once, under the QueryClient (the root providers). Its effect runs
 * with the commit that changes the pathname, and React runs a commit's unmount cleanups before
 * its other effects: by then the left page's queries have lost their observers.
 */
export function AfterLogoutSweep(): null {
  const pathname = usePathname()
  const client = useQueryClient()
  useEffect(() => {
    if (!pending) return
    pending = false
    client.removeQueries({ type: 'inactive' })
  }, [pathname, client])
  return null
}
