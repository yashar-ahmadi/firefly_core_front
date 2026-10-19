'use client'

import { Store, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ThreadItem } from '@/features/comments/thread-item'
import type { BlogComment } from '@/lib/api/types/blog-post'
import { PostCommentComposer } from './post-comment-composer'

export interface PostCommentThreadProps {
  comment: BlogComment
  slug: string
  /** A «پاسخ» under this root entry (while comments are on). */
  canReply: boolean
  depth?: number
}

/**
 * One comment or question of a post with its replies (blog digest §1.7), as a list item (the
 * shared ThreadItem): the author, «پاسخ رسمی» for the shop's answer written in the panel, «شما»
 * for the visitor's own, the Jalali date and the text, plain (escaped by React) with its line
 * breaks kept. Replies follow oldest first, at any depth, indented two levels at most; a root
 * entry can be answered in place.
 */
export function PostCommentThread({ comment, slug, canReply, depth = 0 }: PostCommentThreadProps) {
  return (
    <ThreadItem
      comment={comment}
      depth={depth}
      badges={
        <>
          {comment.is_user_admin && (
            <Badge tone="brand" size="sm">
              <Store aria-hidden />
              پاسخ رسمی
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
        <PostCommentThread comment={reply} slug={slug} canReply={false} depth={next} />
      )}
    >
      <p className="text-base leading-8 break-words whitespace-pre-wrap text-ink-800">
        {comment.review}
      </p>
      {canReply && depth === 0 && (
        <PostCommentComposer slug={slug} type={comment.comment_type} parentId={comment.id} />
      )}
    </ThreadItem>
  )
}
