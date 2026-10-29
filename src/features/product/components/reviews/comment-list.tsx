'use client'

import { useEffect, useRef } from 'react'
import { useSeenOnce } from '@/components/ui/use-in-view'
import { ThreadList, ThreadPlaceholders } from '@/features/comments/thread-list'
import { useFeature } from '@/features/settings/feature-context'
import type { CommentType, ProductComment } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'
import { useSession } from '@/lib/session/session-context'
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

/** The loading list: what shows while the first page is on its way (server or browser). */
export function CommentPlaceholders({ type, count }: { type: CommentType; count: number }) {
  return <ThreadPlaceholders count={count} label={`در حال بارگذاری ${COPY[type].list}`} />
}

export interface CommentListProps {
  slug: string
  type: CommentType
  /**
   * The product's count of visible entries, replies included (`comment_count` /
   * `question_count`): above 0 exactly when a root thread shows.
   */
  count: number
  /** Page 1 as the server rendered it (anonymous); without it the list loads when in view. */
  initialPage?: Paginated<ProductComment> | null
}

/**
 * The approved reviews or questions (ThreadList: newest first, then page by page with «نمایش
 * بیشتر»). Page 1 comes server-rendered (`initialPage`, spec §8.13); a signed-in visitor's copy
 * is fetched again through the BFF once the list comes near the viewport, so their own entries
 * get «شما». Without `initialPage` (the server read failed) page 1 loads in the browser when the
 * list comes near. With a count of zero nothing is requested. Questions can be answered in place
 * while comments are on.
 */
export function CommentList({ slug, type, count, initialPage }: CommentListProps) {
  const [ref, seen] = useSeenOnce<HTMLDivElement>()
  const replies = useFeature('product_comments').enabled && type === 'question'
  const { hasSession } = useSession()
  const seeded = initialPage ?? undefined
  const query = useComments(slug, type, { enabled: seen && count > 0, initialPage: seeded })
  const { refetch } = query
  // The server's page 1 is anonymous: a signed-in visitor's own entries are marked only by the
  // BFF's answer. Once, when the list first comes near.
  const personalised = useRef(false)
  useEffect(() => {
    if (!seen || !hasSession || !seeded || personalised.current) return
    personalised.current = true
    void refetch()
  }, [seen, hasSession, seeded, refetch])

  return (
    <ThreadList
      query={query}
      count={count}
      copy={COPY[type]}
      frameRef={ref}
      renderThread={(comment) => <CommentThread comment={comment} slug={slug} canReply={replies} />}
    />
  )
}
