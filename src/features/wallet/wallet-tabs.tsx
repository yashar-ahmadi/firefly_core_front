'use client'

import Link from 'next/link'
import type { MouseEvent } from 'react'
import { cn } from '@/components/ui/cn'
import type { Option } from './wallet-labels'
import type { WalletTab } from './wallet-params'

// The wallet page's views (the page is long on a phone): «تراکنش‌ها», «برداشت», «تاریخچهٔ پرداخت»,
// as links (each view has its URL: Back and a shared link work), the current one
// `aria-current="page"`, scrolled sideways on a narrow screen; a click only rewrites the URL.

const TAB = cn(
  'relative inline-flex h-12 shrink-0 items-center px-3 text-base font-medium whitespace-nowrap text-ink-600 sm:px-4',
  'transition-colors duration-150 hover:text-ink-900 focus-visible:-outline-offset-2',
  'aria-[current=page]:text-brand-800',
  "after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:scale-x-0 after:rounded-full after:bg-brand after:content-['']",
  'motion-safe:after:transition-transform motion-safe:after:duration-200 aria-[current=page]:after:scale-x-100',
)

export function WalletTabs({
  tabs,
  current,
  href,
  onFollow,
}: {
  tabs: readonly Option<WalletTab>[]
  current: WalletTab
  href: (tab: WalletTab) => string
  onFollow: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  return (
    <nav aria-label="بخش‌های کیف پول" className="rounded-card bg-white shadow-card">
      <ul className="flex [scrollbar-width:none] overflow-x-auto px-1 shadow-[inset_0_-1px_0] shadow-ink-200 sm:gap-1 sm:px-2">
        {tabs.map((tab) => (
          <li key={tab.value}>
            <Link
              href={href(tab.value)}
              prefetch={false}
              scroll={false}
              onClick={onFollow}
              aria-current={tab.value === current ? 'page' : undefined}
              className={TAB}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
