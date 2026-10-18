'use client'

import Link from 'next/link'
import type { MouseEvent } from 'react'
import { cn } from '@/components/ui/cn'
import { Skeleton } from '@/components/ui/skeleton'
import type { OrderStatusGroup } from '@/lib/api/types/dashboard'
import { formatNumber } from '@/lib/format'

// «سفارش‌های من»'s tabs (dashboard digest §3.4): «همه» (every order, the summary's `total`), then
// the summary's `orders.groups` in its order, labels as given, each with its count; a key the code
// does not know is a tab like the others (the page sends it). Links (each view has its URL, so
// Back and a shared link work), the current one `aria-current="page"`; a click only rewrites the
// URL (`onFollow`). While the summary is read, skeleton tabs; without it, «همه» alone.

const TAB = cn(
  'relative inline-flex h-12 shrink-0 items-center gap-2 px-3 text-base font-medium whitespace-nowrap text-ink-600 sm:px-4',
  'transition-colors duration-150 hover:text-ink-900 focus-visible:-outline-offset-2',
  'aria-[current=page]:text-brand-800',
  "after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:scale-x-0 after:rounded-full after:bg-brand after:content-['']",
  'motion-safe:after:transition-transform motion-safe:after:duration-200 aria-[current=page]:after:scale-x-100',
)
const COUNT =
  'inline-grid min-w-6 place-items-center rounded-pill bg-ink-100 px-1.5 text-sm leading-6 font-bold text-ink-700'

export interface OrdersTabsProps {
  /** null: the summary could not be read; undefined: it is being read. */
  groups: OrderStatusGroup[] | null | undefined
  total: number | undefined
  /** The tab on screen: a group key, or null for «همه». */
  current: string | null
  href: (group: string | null) => string
  onFollow: (event: MouseEvent<HTMLAnchorElement>) => void
}

function Tab({
  href,
  current,
  count,
  onFollow,
  children,
}: {
  href: string
  current: boolean
  count?: number
  onFollow: OrdersTabsProps['onFollow']
  children: string
}) {
  return (
    <li>
      <Link
        href={href}
        prefetch={false}
        scroll={false}
        onClick={onFollow}
        aria-current={current ? 'page' : undefined}
        className={TAB}
      >
        {children}
        {count !== undefined && <span className={COUNT}>{formatNumber(count)}</span>}
      </Link>
    </li>
  )
}

export function OrdersTabs({ groups, total, current, href, onFollow }: OrdersTabsProps) {
  return (
    <nav aria-label="گروه سفارش‌ها" className="mb-4 rounded-card bg-white shadow-card md:mb-5">
      <ul className="flex [scrollbar-width:none] overflow-x-auto px-1 shadow-[inset_0_-1px_0] shadow-ink-200 sm:gap-1 sm:px-2">
        <Tab href={href(null)} current={current === null} count={total} onFollow={onFollow}>
          همه
        </Tab>
        {groups === undefined
          ? Array.from({ length: 5 }, (_, index) => (
              <li key={index} aria-hidden className="flex h-12 items-center px-3">
                <Skeleton className="h-4 w-20" />
              </li>
            ))
          : (groups ?? []).map((group) => (
              <Tab
                key={group.key}
                href={href(group.key)}
                current={current === group.key}
                count={group.count}
                onFollow={onFollow}
              >
                {group.label}
              </Tab>
            ))}
      </ul>
    </nav>
  )
}
