'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { formatNumber } from '@/lib/format'
import { useListingPending } from './use-listing-url'

export interface ListingResultsProps {
  /** The listing's product count, from the server render. */
  count: number
  /** The server-rendered grid and what follows it. */
  children: ReactNode
}

/**
 * The results area. While new results for a URL change are on the way it is dimmed and busy
 * (opacity only, so nothing moves); when they arrive the count is announced politely.
 */
export function ListingResults({ count, children }: ListingResultsProps) {
  const pending = useListingPending()
  const [wasPending, setWasPending] = useState(pending)
  const [announcement, setAnnouncement] = useState('')
  if (pending !== wasPending) {
    setWasPending(pending)
    if (!pending) {
      setAnnouncement(count > 0 ? `${formatNumber(count)} کالا یافت شد` : 'کالایی یافت نشد')
    }
  }

  return (
    <>
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div
        aria-busy={pending || undefined}
        className={cn(
          'transition-opacity duration-200',
          pending && 'pointer-events-none opacity-50 motion-safe:delay-100',
        )}
      >
        {children}
      </div>
    </>
  )
}
