import { ChevronLeft, ChevronRight, Ellipsis } from 'lucide-react'
import Link from 'next/link'
import type { MouseEvent } from 'react'
import { toPersianDigits } from '@/lib/format'
import { cn } from './cn'

export type PageItem = number | 'ellipsis'

/**
 * Pages to show: the first, the last and the current one with its neighbours. A gap of one
 * page shows that page; longer gaps become an ellipsis.
 */
export function pageItems(page: number, totalPages: number): PageItem[] {
  const shown = new Set([1, totalPages, page - 1, page, page + 1])
  const pages = [...shown].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b)
  const items: PageItem[] = []
  let previous = 0
  for (const p of pages) {
    if (p - previous === 2) items.push(previous + 1)
    else if (p - previous > 2) items.push('ellipsis')
    items.push(p)
    previous = p
  }
  return items
}

export interface PaginationProps {
  page: number
  totalPages: number
  hrefFor: (page: number) => string
  /**
   * A page link's click, for a page that changes only its URL (an account list: `useListUrl`'s
   * `followPage`). Without it the links navigate as links do.
   */
  onFollow?: (event: MouseEvent<HTMLAnchorElement>) => void
  className?: string
}

const STEP = cn(
  'inline-flex h-11 items-center gap-1 rounded-control border px-3.5 text-base font-medium',
  '[&_svg]:size-5 [&_svg]:shrink-0',
)
const STEP_ENABLED =
  'border-ink-300 bg-white text-ink-800 transition-colors hover:border-ink-400 hover:bg-ink-50'
const STEP_DISABLED = 'border-ink-200 text-ink-300'

/**
 * Real links (crawlable, work without JavaScript). Phones see «قبلی · صفحه ۲ از ۵ · بعدی»;
 * from `md` up every nearby page is listed. In RTL «قبلی» is on the right.
 */
export function Pagination({ page, totalPages, hrefFor, onFollow, className }: PaginationProps) {
  if (totalPages <= 1) return null
  const current = Math.min(Math.max(1, Math.trunc(page)), totalPages)
  const prev = current > 1 ? current - 1 : null
  const next = current < totalPages ? current + 1 : null

  const prevContent = (
    <>
      <ChevronRight aria-hidden />
      <span>قبلی</span>
    </>
  )
  const nextContent = (
    <>
      <span>بعدی</span>
      <ChevronLeft aria-hidden />
    </>
  )

  return (
    <nav
      aria-label="صفحه‌بندی"
      className={cn('flex items-center justify-between gap-2 md:justify-center', className)}
    >
      {prev !== null ? (
        <Link
          href={hrefFor(prev)}
          onClick={onFollow}
          rel="prev"
          aria-label="صفحه قبلی"
          className={cn(STEP, STEP_ENABLED)}
        >
          {prevContent}
        </Link>
      ) : (
        <span aria-hidden className={cn(STEP, STEP_DISABLED)}>
          {prevContent}
        </span>
      )}

      <p className="text-base text-ink-700 md:hidden">
        صفحه <span className="font-bold text-ink-900">{toPersianDigits(current)}</span> از{' '}
        {toPersianDigits(totalPages)}
      </p>

      <ul className="hidden items-center gap-1 md:flex">
        {pageItems(current, totalPages).map((item, i) =>
          item === 'ellipsis' ? (
            <li
              key={`gap-${i}`}
              aria-hidden
              className="grid size-11 place-items-center text-ink-500"
            >
              <Ellipsis className="size-5" />
            </li>
          ) : (
            <li key={item}>
              <Link
                href={hrefFor(item)}
                onClick={onFollow}
                aria-label={`صفحه ${toPersianDigits(item)}`}
                aria-current={item === current ? 'page' : undefined}
                className={cn(
                  'grid h-11 min-w-11 place-items-center rounded-control px-2 text-base font-medium transition-colors',
                  item === current
                    ? 'bg-brand text-brand-fg shadow-sm'
                    : 'text-ink-700 hover:bg-ink-100',
                )}
              >
                {toPersianDigits(item)}
              </Link>
            </li>
          ),
        )}
      </ul>

      {next !== null ? (
        <Link
          href={hrefFor(next)}
          onClick={onFollow}
          rel="next"
          aria-label="صفحه بعدی"
          className={cn(STEP, STEP_ENABLED)}
        >
          {nextContent}
        </Link>
      ) : (
        <span aria-hidden className={cn(STEP, STEP_DISABLED)}>
          {nextContent}
        </span>
      )}
    </nav>
  )
}
