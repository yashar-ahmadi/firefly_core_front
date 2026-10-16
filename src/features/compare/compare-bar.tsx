'use client'

import { GitCompareArrows } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import { notify } from '@/components/ui/toaster'
import { formatNumber } from '@/lib/format'
import { usePersistHydration } from '@/lib/store/persisted'
import { useCompare } from './store'

/** The compare page lists the products itself; checkout is no place for it. */
const HIDDEN_ON = /^\/(?:compare|checkout)(?:\/|$)/
const WAITING = 'یک کالای دیگر برای مقایسه انتخاب کنید.'
const CLEARED = 'فهرست مقایسه پاک شد.'

/**
 * The compare list, floating at the bottom of every shop page once it holds a product: the
 * thumbnails, «مقایسه» (from two products: the compare page) and «پاک کردن».
 *
 * It stands above whatever bar the phone shows at the bottom (the navigation, or the product
 * page's buy bar): `--bottom-bar-room` (globals.css) is that bar's height plus the safe area,
 * and drops to the safe area alone when no bar is there or the navigation slid away. A spacer
 * at the end of the page keeps the last of the footer clear of it.
 *
 * It reads localStorage, so it renders nothing on the server and during hydration.
 */
export function CompareBar() {
  const pathname = usePathname() ?? '/'
  const hydrated = usePersistHydration(useCompare)
  const items = useCompare((state) => state.items)
  const clear = useCompare((state) => state.clear)
  const hintId = useId()
  if (!hydrated || items.length === 0 || HIDDEN_ON.test(pathname)) return null

  const ready = items.length >= 2
  const label = (
    <>
      <GitCompareArrows aria-hidden />
      مقایسه{' '}
      <span className="min-w-5 rounded-pill bg-white/20 px-1.5 text-center tabular-nums">
        {formatNumber(items.length)}
      </span>{' '}
      <span className="sr-only">کالا</span>
    </>
  )

  return (
    <>
      <div aria-hidden data-compare-bar-spacer="" className="h-20" />
      <section
        data-compare-bar=""
        aria-label="فهرست مقایسه"
        className={cn(
          'fixed inset-x-0 z-[35] px-3 transition-[bottom] duration-200 ease-out',
          'bottom-[calc(var(--bottom-bar-room)+0.5rem)] md:bottom-[calc(var(--bottom-bar-room)+1rem)]',
        )}
      >
        <div className="mx-auto flex max-w-xl items-center gap-2 rounded-card border border-ink-200 bg-white p-2 shadow-raised">
          <ul className="flex shrink-0 items-center ps-1">
            {items.map((item) => (
              <li key={item.slug} className="-ms-3 first:ms-0">
                <SmartImage
                  src={item.image}
                  alt={item.name}
                  ratio="1/1"
                  sizes="40px"
                  className="w-10 rounded-control border-2 border-white bg-ink-50 shadow-sm"
                />
              </li>
            ))}
          </ul>
          <p id={hintId} className="min-w-0 flex-1 truncate text-sm text-ink-700 max-sm:sr-only">
            {ready ? `${formatNumber(items.length)} کالا در فهرست مقایسه` : WAITING}
          </p>
          <div className="ms-auto flex shrink-0 items-center gap-1">
            {ready ? (
              <Button asChild size="sm">
                <Link href="/compare/" prefetch={false}>
                  {label}
                </Link>
              </Button>
            ) : (
              <Button size="sm" disabled aria-describedby={hintId}>
                {label}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clear()
                notify.success(CLEARED)
                // The bar and the pressed button are gone: the page keeps the focus.
                document.getElementById('main')?.focus({ preventScroll: true })
              }}
            >
              پاک کردن
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
