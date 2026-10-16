'use client'

import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { Skeleton } from '@/components/ui/skeleton'
import { useT } from '@/lib/i18n/i18n-context'

const CARDS = 8

/**
 * While a shop page loads (client navigation and streaming): a light skeleton of a listing page
 * in the page body; the header and footer stay. Announced once as busy, the blocks are hidden.
 */
export default function ShopLoading() {
  const t = useT()
  return (
    <div role="status" aria-busy="true" className={cn(CONTAINER, 'py-6 md:py-10')}>
      <span className="sr-only">{t('loading')}</span>
      {/* On the grey page a darker fill keeps the bars visible; cards use the default. */}
      <Skeleton className="h-4 w-48 bg-ink-200/80" />
      <Skeleton className="mt-5 h-8 w-64 max-w-full bg-ink-200/80" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full bg-ink-200/80" />
      <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
        {Array.from({ length: CARDS }, (_, index) => (
          <div
            key={index}
            className={cn(
              'rounded-card bg-white p-3 shadow-card',
              // Phones show four cards, tablets six: enough to fill the first screen.
              index >= 4 && 'max-md:hidden',
              index >= 6 && 'max-lg:hidden',
            )}
          >
            <Skeleton className="aspect-square w-full rounded-card" />
            <Skeleton className="mt-3 h-4 w-11/12" />
            <Skeleton className="mt-2 h-4 w-2/3" />
            <Skeleton className="mt-4 h-5 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  )
}
