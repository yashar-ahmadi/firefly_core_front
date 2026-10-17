'use client'

import { ChevronLeft, ShoppingBag } from 'lucide-react'
import Link from 'next/link'
import { useId } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { bffFetch } from '@/lib/api/client'
import type { Paginated } from '@/lib/api/types/common'
import type { PurchasedProduct } from '@/lib/api/types/dashboard'
import { isLoadingSection, useAccountQuery } from '../use-account-query'
import { PurchaseCard, PurchaseCardSkeleton } from './purchase-card'
import { SectionError } from './section-error'

/** The dashboard shows the four latest (account guide §2, page 1). */
const LIMIT = 4

/** Under `['dashboard']`: the visitor's, dropped on login and logout (`SESSION_QUERIES`). */
export const PURCHASES_KEY = ['dashboard', 'purchased', LIMIT] as const

async function fetchPurchases({ signal }: { signal: AbortSignal }): Promise<PurchasedProduct[]> {
  const { data } = await bffFetch<Paginated<PurchasedProduct>>(
    'dashboard/purchased-product/list/',
    { query: { limit: LIMIT }, signal },
  )
  return data.results
}

const GRID = 'grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4'

/**
 * «آخرین خریدها»: the four products of the latest paid orders, newest first, as mini cards
 * (`PurchaseCard`). Four skeleton cards of the same box while the list loads; without a
 * purchase yet, an empty state with «شروع خرید»; a failed read offers «تلاش دوباره».
 */
export function RecentPurchases() {
  const id = useId()
  const query = useAccountQuery({ queryKey: PURCHASES_KEY, queryFn: fetchPurchases })
  const loading = isLoadingSection(query)

  let body
  if (loading || (query.data && query.data.length > 0)) {
    body = (
      <ul aria-busy={loading || undefined} className={GRID}>
        {loading
          ? Array.from({ length: LIMIT }, (_, index) => (
              <li key={index}>
                <PurchaseCardSkeleton />
              </li>
            ))
          : query.data?.map((product) => (
              <li key={product.id}>
                <PurchaseCard product={product} />
              </li>
            ))}
      </ul>
    )
  } else if (query.data) {
    body = (
      <EmptyState
        icon={<ShoppingBag />}
        title="هنوز خریدی نکرده‌اید"
        description="کالاهایی که می‌خرید اینجا می‌آیند تا دوباره آسان پیدایشان کنید."
        headingLevel={3}
        className="rounded-card bg-white py-8 shadow-card"
        action={
          <Link href="/" className={buttonClasses({ variant: 'outline' })}>
            شروع خرید
            <ChevronLeft aria-hidden className="ltr:rotate-180" />
          </Link>
        }
      />
    )
  } else {
    body = (
      <SectionError
        message="خریدهای اخیر بارگذاری نشد."
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        className="rounded-card bg-white shadow-card"
      />
    )
  }

  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="mb-3 flex min-h-11 items-center gap-2 text-lg leading-8 font-bold text-ink-900 md:mb-4"
      >
        <span aria-hidden className="h-5 w-1 shrink-0 rounded-pill bg-brand" />
        آخرین خریدها
      </h2>
      {body}
    </section>
  )
}
