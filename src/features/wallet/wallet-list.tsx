'use client'

import type { UseQueryResult } from '@tanstack/react-query'
import { useId, type MouseEvent, type ReactNode } from 'react'
import { Pagination } from '@/components/ui/pagination'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { ListError } from '@/features/account/lists/list-error'
import { usePageFallback } from '@/features/account/lists/use-page-fallback'
import { isLoadingSection } from '@/features/account/use-account-query'
import type { Paginated } from '@/lib/api/types/common'
import type { Option } from './wallet-labels'

// The wallet's three lists share one frame (Plan 3's account lists): the rows of the page on
// screen (kept, busy, while the next is read), skeleton rows while the first is read, «تلاش
// دوباره» when it cannot be read (a 429 waits), a page past the end goes to the last one, an
// empty page said for what it is, and the pager.

export interface WalletListProps<T> {
  label: string
  query: UseQueryResult<Paginated<T>>
  page: number
  /** Reads page 1 (for its `total_pages`) when the page asked is past the end. */
  readFirst: () => Promise<{ total_pages: number }>
  goTo: (page: number) => void
  hrefFor: (page: number) => string
  onFollowPage: (event: MouseEvent<HTMLAnchorElement>) => void
  errorMessage: string
  /** What an empty page says (with filters: a way back to every row). */
  empty: ReactNode
  row: (item: T) => ReactNode
  rowKey: (item: T) => string
}

export function WalletList<T>(props: WalletListProps<T>) {
  const { query, page } = props
  const leaving = usePageFallback({
    error: query.error,
    page,
    readFirst: props.readFirst,
    goTo: props.goTo,
  })
  const data = query.data
  if (query.isError && !data && !leaving && !isLoadingSection(query)) {
    return (
      <ListError
        frame="inline"
        message={props.errorMessage}
        error={query.error}
        errorAt={query.errorUpdatedAt}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  }
  if (!data || leaving || (data.results.length === 0 && page > 1)) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 py-2">
        <VisuallyHidden role="status">در حال بارگذاری</VisuallyHidden>
        <Skeleton className="h-16 rounded-card" />
        <Skeleton className="h-16 rounded-card" />
        <Skeleton className="h-16 rounded-card" />
      </div>
    )
  }
  if (data.results.length === 0) return <div className="py-8 text-center">{props.empty}</div>
  return (
    <>
      <ul
        aria-label={props.label}
        aria-busy={query.isPlaceholderData || undefined}
        className="divide-y divide-ink-100 transition-opacity aria-busy:opacity-60"
      >
        {data.results.map((item) => (
          <li key={props.rowKey(item)} className="py-3 first:pt-0 last:pb-0">
            {props.row(item)}
          </li>
        ))}
      </ul>
      <Pagination
        page={data.current_page}
        totalPages={data.total_pages}
        hrefFor={props.hrefFor}
        onFollow={props.onFollowPage}
        className="mt-5"
      />
    </>
  )
}

/** One filter: a native select (best on phones and with assistive tech), «همه» first. */
export function FilterSelect<V extends string>({
  label,
  value,
  options,
  all,
  onChange,
}: {
  label: string
  value: V | null
  options: readonly Option<V>[]
  /** The «all» choice's words; none: one of the options is always chosen (the ordering). */
  all?: string
  onChange: (value: V | null) => void
}) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-base font-medium text-ink-800">
        {label}
      </label>
      <Select
        id={id}
        value={value ?? ''}
        onChange={(event) => {
          const next = options.find((option) => option.value === event.currentTarget.value)
          onChange(next?.value ?? null)
        }}
      >
        {all !== undefined && <option value="">{all}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </div>
  )
}

/** What a list with nothing to show says; with filters on, the way back to every row. */
export function ListEmpty({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-base leading-7 text-ink-700">{children}</p>
      {action}
    </div>
  )
}
