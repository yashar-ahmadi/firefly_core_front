'use client'

import { useEffect, useRef } from 'react'
import { useSeenOnce } from '@/components/ui/use-in-view'
import { useCommentsClosed } from '@/features/comments/comments-gate'
import { subjectRules, type CommentSubject } from '@/features/comments/subjects'
import {
  ThreadList,
  ThreadPlaceholders,
  type ThreadListCopy,
} from '@/features/comments/thread-list'
import { useSubjectComments } from '@/features/comments/use-subject-comments'
import { isApiNotFound } from '@/lib/api/errors'
import type { Paginated } from '@/lib/api/types/common'
import type { SubjectComment, SubjectCommentType } from '@/lib/api/types/subject-comment'
import { useSession } from '@/lib/session/session-context'
import { SubjectCommentThread } from './subject-comment-thread'

const COPY: Record<SubjectCommentType, ThreadListCopy> = {
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

/** The loading list (the server's page 1 on its way). */
export function CommentPlaceholders({ type, count }: { type: SubjectCommentType; count: number }) {
  return <ThreadPlaceholders count={count} label={`در حال بارگذاری ${COPY[type].list}`} />
}

export interface SubjectCommentListProps {
  subject: CommentSubject
  type: SubjectCommentType
  /** The subject's count of visible root entries (`comment_count` / `question_count`). */
  count: number
  /** Page 1 as the server rendered it (anonymous); without it the list loads when in view. */
  initialPage?: Paginated<SubjectComment> | null
}

/**
 * A post's or a page's comments or questions (ThreadList: newest first, page by page with «نمایش
 * بیشتر»). Page 1 of the comments comes server-rendered (`initialPage`); a signed-in visitor's
 * copy is read again through the BFF once the list comes near, so their own entries say «شما».
 * Without it (the questions, or a failed server read), page 1 loads when the list comes near
 * (its tab opened). With a count of zero nothing is read. A subject gone meanwhile (404) says
 * so. «پاسخ» is offered while the forms are open.
 */
export function SubjectCommentList({ subject, type, count, initialPage }: SubjectCommentListProps) {
  const [ref, seen] = useSeenOnce<HTMLDivElement>()
  const replies = useCommentsClosed(subject) === null
  const { hasSession } = useSession()
  const seeded = initialPage ?? undefined
  const query = useSubjectComments(subject, type, {
    enabled: seen && count > 0,
    initialPage: seeded,
  })
  const { refetch } = query
  // The server's page 1 is anonymous: a signed-in visitor's own entries are marked only by the
  // BFF's answer. Once, when the list first comes near.
  const personalised = useRef(false)
  useEffect(() => {
    if (!seen || !hasSession || !seeded || personalised.current) return
    personalised.current = true
    void refetch()
  }, [seen, hasSession, seeded, refetch])

  const gone = subjectRules(subject.kind).gone
  return (
    <ThreadList
      query={query}
      count={count}
      copy={COPY[type]}
      frameRef={ref}
      failedMessage={(error) => (isApiNotFound(error) ? gone : null)}
      renderThread={(comment) => (
        <SubjectCommentThread comment={comment} subject={subject} canReply={replies} />
      )}
    />
  )
}
