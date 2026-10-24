'use client'

import { BadgeCheck, Store, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/components/ui/cn'
import { Rating } from '@/components/ui/rating'
import { ThreadItem } from '@/features/comments/thread-item'
import type { ProductComment } from '@/lib/api/types/catalog'
import { CommentComposer } from './comment-composer'
import { POINTS } from './review-fields'

function PointList({ kind, points }: { kind: keyof typeof POINTS; points: readonly string[] }) {
  if (points.length === 0) return null
  const { label, Icon, tone } = POINTS[kind]
  return (
    <ul aria-label={label} className="flex flex-col gap-1">
      {points.map((point, index) => (
        <li key={index} className="flex items-start gap-1.5 text-base text-ink-800">
          <Icon aria-hidden className={cn('mt-1.5 size-4 shrink-0', tone)} />
          {point}
        </li>
      ))}
    </ul>
  )
}

export interface CommentThreadProps {
  comment: ProductComment
  slug: string
  /** A «پاسخ» button under this root entry (questions, while comments are on). */
  canReply: boolean
  depth?: number
}

/**
 * One review or question with its replies, as a list item (product digest §8): the author, the
 * badges («پاسخ فروشنده» for the shop's own answer, «خریدار», «شما»), the Jalali date, the stars
 * and title of a review, its text (plain, escaped by React) and its pros and cons. Replies
 * follow oldest first, indented two levels at most.
 */
export function CommentThread({ comment, slug, canReply, depth = 0 }: CommentThreadProps) {
  return (
    <ThreadItem
      comment={comment}
      depth={depth}
      badges={
        <>
          {comment.is_user_admin && (
            <Badge tone="brand" size="sm">
              <Store aria-hidden />
              پاسخ فروشنده
            </Badge>
          )}
          {comment.is_verified_buyer && (
            <Badge tone="success" size="sm">
              <BadgeCheck aria-hidden />
              خریدار
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
        <CommentThread comment={reply} slug={slug} canReply={false} depth={next} />
      )}
    >
      {comment.rating !== null && <Rating value={comment.rating} size="sm" />}
      {comment.title && (
        <h3 dir="auto" className="text-base font-bold text-ink-900">
          {comment.title}
        </h3>
      )}
      <p className="text-base leading-8 break-words whitespace-pre-line text-ink-800">
        {comment.review}
      </p>
      <PointList kind="positive" points={comment.positive_points} />
      <PointList kind="negative" points={comment.negative_points} />
      {canReply && depth === 0 && (
        <CommentComposer slug={slug} type={comment.comment_type} parentId={comment.id} />
      )}
    </ThreadItem>
  )
}
