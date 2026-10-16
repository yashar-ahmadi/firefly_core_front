'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { focusInView } from '@/components/ui/focus-in-view'
import { Skeleton } from '@/components/ui/skeleton'
import { useSeenOnce } from '@/components/ui/use-in-view'
import { useFeature } from '@/features/settings/feature-context'
import type { CommentType } from '@/lib/api/types/catalog'
import { CommentThread } from './comment-thread'
import { useComments } from './use-comments'

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
 */
export function CommentList({ slug, type, count }: CommentListProps) {
  const copy = COPY[type]
  const [ref, seen] = useSeenOnce<HTMLDivElement>()
  const listRef = useRef<HTMLOListElement>(null)
  const replies = useFeature('product_comments').enabled && type === 'question'
  const query = useComments(slug, type, { enabled: seen && count > 0 })
  const comments = query.data?.pages.flatMap((page) => page.results) ?? []

  const showMore = async () => {
    const shown = comments.length
    await query.fetchNextPage()
    // The first new entry takes the focus: the button may be gone (last page).
    focusInView(listRef.current?.querySelectorAll<HTMLElement>(':scope > li > article')[shown])
  }

  if (count <= 0) return <p className="py-2 text-base text-ink-600">{copy.empty}</p>

  return (
    <div ref={ref} className="flex flex-col">
      {query.isSuccess ? (
        <ol ref={listRef} aria-label={copy.list} className="flex flex-col divide-y divide-ink-100">
          {comments.map((comment) => (
            <CommentThread key={comment.id} comment={comment} slug={slug} canReply={replies} />
          ))}
        </ol>
      ) : query.isError ? (
        <div className="flex flex-wrap items-center gap-3 py-2">
          <p className="text-base text-ink-700">{copy.failed}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            تلاش دوباره
          </Button>
        </div>
      ) : (
        <Placeholders count={count} label={`در حال بارگذاری ${copy.list}`} />
      )}
      {query.hasNextPage && (
        <Button
          variant="outline"
          loading={query.isFetchingNextPage}
          onClick={() => void showMore()}
          className="mt-2 self-center"
        >
          نمایش بیشتر
        </Button>
      )}
    </div>
  )
}
