'use client'

import { useEffect, useRef } from 'react'
import { useSeenOnce } from '@/components/ui/use-in-view'
import { usePostComments } from '@/features/blog/post-comments-api'
import {
  ThreadList,
  ThreadPlaceholders,
  type ThreadListCopy,
} from '@/features/comments/thread-list'
import { useFeature } from '@/features/settings/feature-context'
import { isApiNotFound } from '@/lib/api/errors'
import type { BlogComment, BlogCommentType } from '@/lib/api/types/blog-post'
import type { Paginated } from '@/lib/api/types/common'
import { useSession } from '@/lib/session/session-context'
import { PostCommentThread } from './post-comment-thread'

const COPY: Record<BlogCommentType, ThreadListCopy> = {
  comment: {
    list: 'دیدگاه\u{200C}ها',
    empty: 'هنوز دیدگاهی ثبت نشده است. اولین نفری باشید که دیدگاه می\u{200C}نویسد.',
    failed: 'دیدگاه\u{200C}ها بارگذاری نشد.',
  },
  question: {
    list: 'پرسش\u{200C}ها',
    empty: 'هنوز پرسشی ثبت نشده است. پرسش خود را بنویسید.',
    failed: 'پرسش\u{200C}ها بارگذاری نشد.',
  },
}
const POST_GONE = 'این مطلب دیگر در دسترس نیست.'

/** The loading list (the server's page 1 on its way). */
export function PostCommentPlaceholders({ type, count }: { type: BlogCommentType; count: number }) {
  return <ThreadPlaceholders count={count} label={`در حال بارگذاری ${COPY[type].list}`} />
}

export interface PostCommentListProps {
  slug: string
  type: BlogCommentType
  /** The post's count of visible root entries (`comment_count` / `question_count`). */
  count: number
  /** Page 1 as the server rendered it (anonymous); without it the list loads when in view. */
  initialPage?: Paginated<BlogComment> | null
}

/**
 * A post's comments or questions (ThreadList: newest first, page by page with «نمایش بیشتر»).
 * Page 1 of the comments comes server-rendered (`initialPage`); a signed-in visitor's copy is
 * read again through the BFF once the list comes near, so their own entries say «شما». Without
 * it (the questions, or a failed server read), page 1 loads when the list comes near (its tab
 * opened). With a count of zero nothing is read. A post gone meanwhile (404) says so.
 */
export function PostCommentList({ slug, type, count, initialPage }: PostCommentListProps) {
  const [ref, seen] = useSeenOnce<HTMLDivElement>()
  const replies = useFeature('blog_comments').enabled
  const { hasSession } = useSession()
  const seeded = initialPage ?? undefined
  const query = usePostComments(slug, type, { enabled: seen && count > 0, initialPage: seeded })
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
      failedMessage={(error) => (isApiNotFound(error) ? POST_GONE : null)}
      renderThread={(comment) => (
        <PostCommentThread comment={comment} slug={slug} canReply={replies} />
      )}
    />
  )
}
