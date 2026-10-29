'use client'

import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'
import { Fragment, useEffect, useRef, type ReactNode, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import { focusInView } from '@/components/ui/focus-in-view'
import { Skeleton } from '@/components/ui/skeleton'
import type { Paginated } from '@/lib/api/types/common'

// A comment list read page by page (an infinite query over the API's root threads, replies
// nested): a product's reviews and questions, a blog post's comments and Q&A.

const MORE_FAILED = 'ادامه\u{0654} فهرست بارگذاری نشد.'
const RETRY = 'تلاش دوباره'
/** Placeholders while the first page loads: as many as will come, up to three. */
const MAX_PLACEHOLDERS = 3

/** What a list says: its name, with nothing in it, and when it cannot be read. */
export interface ThreadListCopy {
  list: string
  empty: string
  failed: string
}

/** The loading list: what shows while the first page is on its way (server or browser). */
export function ThreadPlaceholders({ count, label }: { count: number; label: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col">
      {Array.from({ length: Math.min(count, MAX_PLACEHOLDERS) }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 py-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  )
}

export interface ThreadListProps<T extends { id: number }> {
  query: UseInfiniteQueryResult<InfiniteData<Paginated<T>>>
  /**
   * The subject's own count of visible entries, replies included (above 0 exactly when a root
   * thread shows): with none, the empty sentence.
   */
  count: number
  copy: ThreadListCopy
  /** One root entry with its replies (a `<li>`). */
  renderThread: (thread: T) => ReactNode
  /** On the list's frame (the caller's "seen" observer, which enables the query). */
  frameRef?: Ref<HTMLDivElement>
  /** Said instead of `copy.failed` for this error (a subject that is gone). */
  failedMessage?: (error: unknown) => string | null
}

/**
 * The approved entries, newest first (the API's only order), then page by page with «نمایش
 * بیشتر». A page that fails to load leaves the entries already shown, with its error and a
 * retry beside the button; a new page moves the focus to its first entry once it is rendered.
 */
export function ThreadList<T extends { id: number }>({
  query,
  count,
  copy,
  renderThread,
  frameRef,
  failedMessage,
}: ThreadListProps<T>) {
  const listRef = useRef<HTMLOListElement>(null)
  const threads = query.data?.pages.flatMap((page) => page.results) ?? []
  // The index of the first entry of the page asked for, focused once it is rendered (the button
  // may be gone: the last page). `fetchNextPage` resolves before React renders the page.
  const focusIndex = useRef<number | null>(null)

  useEffect(() => {
    const index = focusIndex.current
    if (index === null || threads.length <= index) return
    focusIndex.current = null
    focusInView(listRef.current?.querySelectorAll<HTMLElement>(':scope > li > article')[index])
  }, [threads.length])

  const showMore = async () => {
    const index = threads.length
    focusIndex.current = index
    const result = await query.fetchNextPage()
    const loaded = result.data?.pages.reduce((sum, page) => sum + page.results.length, 0) ?? 0
    // Failed: the focus stays on the button (now the retry). Nothing new (the list shrank): no
    // entry will take the focus, so a later refresh must not either.
    if (result.isFetchNextPageError || loaded <= index) focusIndex.current = null
  }

  if (count <= 0) return <p className="py-2 text-base text-ink-600">{copy.empty}</p>

  return (
    <div ref={frameRef} className="flex flex-col">
      {query.data ? (
        <ol ref={listRef} aria-label={copy.list} className="flex flex-col divide-y divide-ink-100">
          {threads.map((thread) => (
            <Fragment key={thread.id}>{renderThread(thread)}</Fragment>
          ))}
        </ol>
      ) : query.isError ? (
        <div className="flex flex-wrap items-center gap-3 py-2">
          <p className="text-base text-ink-700">{failedMessage?.(query.error) ?? copy.failed}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {RETRY}
          </Button>
        </div>
      ) : (
        <ThreadPlaceholders count={count} label={`در حال بارگذاری ${copy.list}`} />
      )}
      {query.hasNextPage && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {query.isFetchNextPageError && (
            <p role="alert" className="text-base text-danger">
              {MORE_FAILED}
            </p>
          )}
          <Button
            variant="outline"
            loading={query.isFetchingNextPage}
            onClick={() => void showMore()}
          >
            {query.isFetchNextPageError ? RETRY : 'نمایش بیشتر'}
          </Button>
        </div>
      )}
    </div>
  )
}
