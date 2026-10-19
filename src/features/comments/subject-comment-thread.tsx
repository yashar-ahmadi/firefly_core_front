'use client'

import { Store, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SHOP_ANSWER } from '@/features/comments/form-copy'
import type { CommentSubject } from '@/features/comments/subjects'
import { ThreadItem } from '@/features/comments/thread-item'
import type { SubjectComment } from '@/lib/api/types/subject-comment'
import { SubjectCommentComposer } from './subject-comment-composer'

export interface SubjectCommentThreadProps {
  comment: SubjectComment
  subject: CommentSubject
  /** A «پاسخ» under this root entry (while the forms are open). */
  canReply: boolean
  depth?: number
}

/**
 * One comment or question of a post or a page with its replies (blog digest §1.7, content digest
 * §4.1), as a list item (the shared ThreadItem): the author, «پاسخ فروشگاه» for the shop's answer
 * written in the panel, «شما» for the visitor's own, the Jalali date and the text, plain (escaped
 * by React) with its line breaks kept. Replies follow oldest first, at any depth, indented two
 * levels at most; a root entry can be answered in place.
 */
export function SubjectCommentThread({
  comment,
  subject,
  canReply,
  depth = 0,
}: SubjectCommentThreadProps) {
  return (
    <ThreadItem
      comment={comment}
      depth={depth}
      badges={
        <>
          {comment.is_user_admin && (
            <Badge tone="brand" size="sm">
              <Store aria-hidden />
              {SHOP_ANSWER}
            </Badge>
          )}
          {comment.is_current_user && (
            <Badge tone="info" size="sm">
              <UserRound aria-hidden />
              شما
            </Badge>
          )}
        </>
      }
      renderReply={(reply, next) => (
        <SubjectCommentThread comment={reply} subject={subject} canReply={false} depth={next} />
      )}
    >
      <p className="text-base leading-8 break-words whitespace-pre-wrap text-ink-800">
        {comment.review}
      </p>
      {canReply && depth === 0 && (
        <SubjectCommentComposer
          subject={subject}
          type={comment.comment_type}
          parentId={comment.id}
        />
      )}
    </ThreadItem>
  )
}
