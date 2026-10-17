'use client'

import { Check } from 'lucide-react'
import Link from 'next/link'
import { useId, type MouseEvent, type ReactNode } from 'react'
import { HIT_AREA } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import type { CommentStatus, CommentSubjectType } from '@/lib/api/types/dashboard'
import { COMMENT_STATUSES, SUBJECT_TYPES, type CommentsParams } from './comment-params'

const TAB = cn(
  'relative inline-flex h-12 shrink-0 items-center px-3 text-base font-medium whitespace-nowrap text-ink-600 sm:px-4',
  'transition-colors duration-150 hover:text-ink-900 focus-visible:-outline-offset-2',
  'aria-[current=page]:text-brand-800',
  // A 3px brand bar under the current tab (as the Tabs primitive's `line` variant).
  "after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:scale-x-0 after:rounded-full after:bg-brand after:content-['']",
  'motion-safe:after:transition-transform motion-safe:after:duration-200 aria-[current=page]:after:scale-x-100',
)

const CHIP = cn(
  'relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-pill border px-4 text-sm font-medium whitespace-nowrap',
  'transition-[color,background-color,border-color] duration-150 [&_svg]:size-4 [&_svg]:shrink-0',
  HIT_AREA,
  'border-ink-500 bg-white text-ink-700 hover:border-ink-600 hover:bg-ink-50',
  'aria-[current=true]:border-brand aria-[current=true]:bg-brand-50 aria-[current=true]:text-brand-800',
)

function FilterLink({
  href,
  current,
  kind,
  onFollow,
  children,
}: {
  href: string
  current: boolean
  kind: 'tab' | 'chip'
  onFollow: (event: MouseEvent<HTMLAnchorElement>) => void
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      onClick={onFollow}
      aria-current={current ? (kind === 'tab' ? 'page' : 'true') : undefined}
      className={kind === 'tab' ? TAB : CHIP}
    >
      {kind === 'chip' && current && <Check aria-hidden strokeWidth={2.5} />}
      {children}
    </Link>
  )
}

export interface CommentFiltersProps {
  params: CommentsParams
  /** The page's URL for other filters (`useListUrl`). */
  href: (params: CommentsParams) => string
  /** A filter link's click (`useListUrl`'s `follow`): the URL changes, nothing is reloaded. */
  onFollow: (event: MouseEvent<HTMLAnchorElement>) => void
}

/**
 * «دیدگاه‌های من»'s filters, as links (each view has its own URL; every change goes back to page
 * 1): the subject tabs («همه» sends no `subject_type`; the view on screen is `aria-current`), then
 * the status chips. Both are kept when the other changes.
 */
export function CommentFilters({ params, href, onFollow }: CommentFiltersProps) {
  const statusLabel = useId()
  const only = params.types.length === 1 ? params.types[0] : undefined
  const withTypes = (types: CommentSubjectType[]) => href({ ...params, types, page: 1 })
  const withStatus = (status: CommentStatus | null) => href({ ...params, status, page: 1 })
  return (
    <div className="mb-4 rounded-card bg-white shadow-card md:mb-5">
      <nav aria-label="نوع دیدگاه">
        {/* The four fit a 360px phone; narrower, they scroll sideways. */}
        <ul className="flex [scrollbar-width:none] overflow-x-auto px-1 shadow-[inset_0_-1px_0] shadow-ink-200 sm:gap-1 sm:px-2">
          <li>
            <FilterLink
              kind="tab"
              href={withTypes([])}
              current={params.types.length === 0}
              onFollow={onFollow}
            >
              همه
            </FilterLink>
          </li>
          {SUBJECT_TYPES.map((type) => (
            <li key={type.value}>
              <FilterLink
                kind="tab"
                href={withTypes([type.value])}
                current={only === type.value}
                onFollow={onFollow}
              >
                {type.label}
              </FilterLink>
            </li>
          ))}
        </ul>
      </nav>
      <div
        role="group"
        aria-labelledby={statusLabel}
        className="flex flex-wrap items-center gap-2 px-4 py-3"
      >
        <span id={statusLabel} className="me-1 text-sm text-ink-600">
          وضعیت دیدگاه
        </span>
        <FilterLink
          kind="chip"
          href={withStatus(null)}
          current={params.status === null}
          onFollow={onFollow}
        >
          همه
        </FilterLink>
        {COMMENT_STATUSES.map((status) => (
          <FilterLink
            key={status.value}
            kind="chip"
            href={withStatus(status.value)}
            current={params.status === status.value}
            onFollow={onFollow}
          >
            {status.label}
          </FilterLink>
        ))}
      </div>
    </div>
  )
}
