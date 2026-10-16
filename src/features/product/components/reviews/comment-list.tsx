'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { focusInView } from '@/components/ui/focus-in-view'
import { Skeleton } from '@/components/ui/skeleton'
import { useSeenOnce } from '@/components/ui/use-in-view'
import { useFeature } from '@/features/settings/feature-context'
import type { CommentType } from '@/lib/api/types/catalog'
import { CommentThread } from './comment-thread'
import { useComments } from './use-comments'

const MORE_FAILED = 'ادامه\u{0654} فهرست بارگذاری نشد.'
const RETRY = 'تلاش دوباره'

const COPY: Record<CommentType, { list: string; empty: string; failed: string }> = {
  comment: {
    list: 'دیدگاه\u{200C}ها',
    empty: 'هنوز دیدگاهی ثبت نشده است. اولین نفری باشید که دیدگاه می\u{200C}نویسد.',
    failed: 'دیدگاه\u{200C}ها بارگذاری نشد.',
  },
  question: {
    list: 'پرسش\u{200C}ها',
    empty: 'هنوز پرسشی ثبت نشده است.',
    failed: 'پرسش\u{200C}ها بارگذاری نشد.',
  },
}
/** Placeholders while the first page loads: as many as will come, up to three. */
const MAX_PLACEHOLDERS = 3

function Placeholders({ count, label }: { count: number; label: string }) {
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

export interface CommentListProps {
  slug: string
  type: CommentType
  /** The product's count of visible root entries (`comment_count` / `question_count`). */
  count: number
}

/**
 * The approved reviews or questions, newest first (the API's only order), loaded in the
 * browser once the list comes near the viewport, then page by page with «نمایش بیشتر». With a
 * count of zero nothing is requested. Questions can be answered in place while comments are on.
 * A page that fails to load leaves the entries already shown, with its error and a retry
 * beside the button; a new page moves the focus to its first entry once it is rendered.
 */
export function CommentList({ slug, type, count }: CommentListProps) {
  const copy = COPY[type]
  const [ref, seen] = useSeenOnce<HTMLDivElement>()
  const listRef = useRef<HTMLOListElement>(null)
  const replies = useFeature('product_comments').enabled && type === 'question'
  const query = useComments(slug, type, { enabled: seen && count > 0 })
  const comments = query.data?.pages.flatMap((page) => page.results) ?? []
  // The index of the first entry of the page asked for, focused once it is rendered (the button
  // may be gone: the last page). `fetchNextPage` resolves before React renders the page.
  const focusIndex = useRef<number | null>(null)

  useEffect(() => {
    const index = focusIndex.current
    if (index === null || comments.length <= index) return
    focusIndex.current = null
    focusInView(listRef.current?.querySelectorAll<HTMLElement>(':scope > li > article')[index])
  }, [comments.length])

  const showMore = async () => {
    focusIndex.current = comments.length
    const result = await query.fetchNextPage()
    // Failed: the focus stays on the button (now the retry).
    if (result.isFetchNextPageError) focusIndex.current = null
  }

  if (count <= 0) return <p className="py-2 text-base text-ink-600">{copy.empty}</p>

  return (
    <div ref={ref} className="flex flex-col">
      {query.data ? (
        <ol ref={listRef} aria-label={copy.list} className="flex flex-col divide-y divide-ink-100">
          {comments.map((comment) => (
            <CommentThread key={comment.id} comment={comment} slug={slug} canReply={replies} />
          ))}
        </ol>
      ) : query.isError ? (
        <div className="flex flex-wrap items-center gap-3 py-2">
          <p className="text-base text-ink-700">{copy.failed}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            {RETRY}
          </Button>
        </div>
      ) : (
        <Placeholders count={count} label={`در حال بارگذاری ${copy.list}`} />
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
