'use client'

import {
  ChevronLeft,
  CircleX,
  CreditCard,
  Package,
  PackageCheck,
  Truck,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import { useId } from 'react'
import { cn } from '@/components/ui/cn'
import { Skeleton } from '@/components/ui/skeleton'
import type { OrderStatusGroup } from '@/lib/api/types/dashboard'
import { formatNumber } from '@/lib/format/number'
import { isLoadingSection } from '../use-account-query'
import { SectionError } from './section-error'
import { useSummary } from './use-summary'

/** The five groups the API has today; a key it adds later gets the plain parcel. */
const GROUP_LOOK: Record<string, { icon: LucideIcon; tone: string }> = {
  awaiting_payment: { icon: CreditCard, tone: 'bg-warning/10 text-warning' },
  in_progress: { icon: Truck, tone: 'bg-info/10 text-info' },
  delivered: { icon: PackageCheck, tone: 'bg-success/10 text-success' },
  returned: { icon: Undo2, tone: 'bg-ink-100 text-ink-600' },
  cancelled: { icon: CircleX, tone: 'bg-danger/10 text-danger' },
}
const OTHER_GROUP = { icon: Package, tone: 'bg-ink-100 text-ink-600' }

/** Each group's link: the tile (48px), the count (28px) and two lines of label (48px). */
const GROUP_BOX =
  'flex min-h-32 flex-col items-center gap-1 rounded-control px-1 pt-1 pb-2 text-center'
const SKELETON_COUNT = 5

const LINK = cn(
  'inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded-control px-1 text-sm font-medium text-brand-700 transition-colors hover:text-brand-800',
)

export function ordersHref(key: string): string {
  return `/account/orders/?group=${encodeURIComponent(key)}`
}

function GroupLink({ group }: { group: OrderStatusGroup }) {
  const { icon: Icon, tone } = GROUP_LOOK[group.key] ?? OTHER_GROUP
  return (
    <li>
      <Link
        href={ordersHref(group.key)}
        className={cn(GROUP_BOX, 'group transition-colors hover:bg-ink-50')}
      >
        <span
          aria-hidden
          className={cn(
            'grid size-12 place-items-center rounded-full transition-transform motion-safe:group-hover:scale-105 [&_svg]:size-6',
            tone,
          )}
        >
          <Icon />
        </span>
        <span
          aria-hidden
          className={cn(
            'text-lg leading-7 font-bold',
            group.count > 0 ? 'text-ink-900' : 'text-ink-400',
          )}
        >
          {formatNumber(group.count)}
        </span>
        <span data-group-label="" className="line-clamp-2 text-sm leading-6 text-ink-700">
          {group.label}
        </span>
        <span className="sr-only">، {formatNumber(group.count)} سفارش</span>
      </Link>
    </li>
  )
}

function GroupSkeleton() {
  return (
    <li data-testid="group-skeleton" aria-hidden className={GROUP_BOX}>
      <Skeleton className="size-12 rounded-full" />
      <span className="flex h-7 items-center">
        <Skeleton className="h-4 w-5" />
      </span>
      <Skeleton className="mt-1.5 h-3.5 w-12" />
    </li>
  )
}

/**
 * «سفارش‌های من»: one tile per order group of the summary (`orders.groups`), all of them, in the
 * API's order, each with its icon, the API's label as it is and the count, linking to that tab
 * of the orders page (`?group=<key>`). With no order yet every tile shows «۰», and a line under
 * them says so and offers «شروع خرید» (no «همه‌ی سفارش‌ها»). Skeleton tiles of the same size
 * while the summary loads; a failed read offers «تلاش دوباره» in their place.
 */
export function OrderStatusStrip() {
  const id = useId()
  const query = useSummary()
  const loading = isLoadingSection(query)
  const orders = query.data?.orders
  const empty = orders !== undefined && orders.total === 0

  let body
  if (loading) {
    body = (
      <ul aria-busy="true" className="grid grid-cols-5 gap-1 sm:gap-2">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <GroupSkeleton key={index} />
        ))}
      </ul>
    )
  } else if (!orders) {
    body = (
      <SectionError
        message="سفارش‌ها بارگذاری نشد."
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
        className="min-h-32"
      />
    )
  } else {
    body = (
      <ul
        className="grid gap-1 sm:gap-2"
        style={{ gridTemplateColumns: `repeat(${orders.groups.length}, minmax(0, 1fr))` }}
      >
        {orders.groups.map((group) => (
          <GroupLink key={group.key} group={group} />
        ))}
      </ul>
    )
  }

  return (
    <section aria-labelledby={id} className="rounded-card bg-white p-4 shadow-card md:p-5">
      <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
        <h2 id={id} className="text-lg leading-8 font-bold text-ink-900">
          سفارش‌های من
        </h2>
        {orders && !empty && (
          <Link href="/account/orders/" className={LINK}>
            {'همه\u{0654} سفارش‌ها'}
            <ChevronLeft aria-hidden className="size-4 ltr:rotate-180" />
          </Link>
        )}
      </div>
      {body}
      {empty && (
        <p className="mt-2 flex flex-wrap items-center justify-center gap-x-2 border-t border-ink-100 pt-2 text-sm text-ink-600">
          هنوز سفارشی ثبت نکرده‌اید.
          <Link href="/" className={LINK}>
            شروع خرید
            <ChevronLeft aria-hidden className="size-4 ltr:rotate-180" />
          </Link>
        </p>
      )}
    </section>
  )
}
