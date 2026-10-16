'use client'

import { BadgeCheck, Store, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/components/ui/cn'
import { Rating } from '@/components/ui/rating'
import type { ProductComment } from '@/lib/api/types/catalog'
import { formatJalaliDate } from '@/lib/format'
import { CommentComposer } from './comment-composer'
import { POINTS } from './review-fields'

/** Replies deeper than this sit at this depth: narrow screens keep their width. */
const MAX_INDENT = 2

/** Oldest first (the API sends replies newest first), the id breaking ties. */
function chronological(replies: readonly ProductComment[]): ProductComment[] {
  return [...replies].sort((a, b) => Date.parse(a.created) - Date.parse(b.created) || a.id - b.id)
}

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
  const replies = chronological(comment.replies)
  return (
    <li data-depth={Math.min(depth, MAX_INDENT)} className="min-w-0">
      {/* Focusable from script: «نمایش بیشتر» moves the focus to the first new entry. */}
      <article
        tabIndex={-1}
        className={cn(
          'flex flex-col gap-2 py-4',
          comment.is_user_admin && 'my-2 rounded-control bg-brand-50 px-3 py-3',
        )}
      >
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span dir="auto" className="text-base font-bold text-ink-900">
            {comment.name}
          </span>
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
          <time dateTime={comment.created} className="text-sm text-ink-600">
            {formatJalaliDate(comment.created)}
          </time>
        </div>
        {comment.rating !== null && <Rating value={comment.rating} size="sm" showValue={false} />}
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
      </article>
      {replies.length > 0 && (
        <ol
          aria-label={`پاسخ\u{200C}ها به ${comment.name}`}
          className={cn(
            'flex flex-col',
            depth < MAX_INDENT && 'ms-3 border-s-2 border-ink-100 ps-3 md:ms-6 md:ps-4',
          )}
        >
          {replies.map((child) => (
            <CommentThread
              key={child.id}
              comment={child}
              slug={slug}
              canReply={false}
              depth={depth + 1}
            />
          ))}
        </ol>
      )}
    </li>
  )
}
