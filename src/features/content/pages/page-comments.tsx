'use client'

import type { ReactNode } from 'react'
import { CommentSection } from '@/features/comments/comment-section'
import { CommentsGate } from '@/features/comments/comments-gate'

export interface PageCommentsProps {
  slug: string
  /** The page's form is open (`enable_comments`). */
  enableComments: boolean
  /** The page's counts of visible entries, replies included: the tabs' badges. */
  commentCount: number
  questionCount: number
  /** The comments' list, its first page server-rendered (`<SeededComments>` in a Suspense). */
  children: ReactNode
}

/**
 * A content page's «دیدگاه‌ها و پرسش‌ها» (content digest §3.2, §4): the shared CommentSection
 * (tabs with the page's counts, the lists, the threads with «پاسخ فروشگاه» and «شما», the form)
 * behind the page's own gate: its forms only while `enable_comments`, and gone (the API's
 * sentence instead) once a send finds them closed since (`403 page_comments_disabled`). The old
 * approved comments stay listed either way.
 */
export function PageComments({
  slug,
  enableComments,
  commentCount,
  questionCount,
  children,
}: PageCommentsProps) {
  const subject = { kind: 'page', slug } as const
  return (
    <CommentsGate subject={subject} open={enableComments}>
      <CommentSection subject={subject} commentCount={commentCount} questionCount={questionCount}>
        {children}
      </CommentSection>
    </CommentsGate>
  )
}
