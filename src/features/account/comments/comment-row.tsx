'use client'

import { BadgeCheck, MessageCircleQuestion, Reply, Store, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useId } from 'react'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { Rating } from '@/components/ui/rating'
import { SmartImage } from '@/components/ui/smart-image'
import { Spinner } from '@/components/ui/spinner'
import { SHOP_ANSWER } from '@/features/comments/form-copy'
import { useFeature } from '@/features/settings/feature-context'
import type { MyComment, MyCommentReply } from '@/lib/api/types/dashboard'
import { formatJalaliDate } from '@/lib/format'
import { ClampedText } from './clamped-text'
import { commentKey } from './comments-api'
import { orderHref, SUBJECT_KIND, subjectHref } from './subject-links'

/** The status pill's colours (each soft tone is at least 4.5:1, WCAG AA). */
const STATUS_TONE: Record<string, BadgeTone> = {
  pending: 'warning',
  accepted: 'success',
  declined: 'danger',
}

const LINK = 'rounded-control underline-offset-4 hover:text-brand-700 hover:underline'
/** The subject's link covers the row's head (thumbnail, kind, name): a target 56px tall. */
const SUBJECT_LINK = cn(
  LINK,
  "after:absolute after:inset-0 after:rounded-control after:content-['']",
)
/** The order's link in the meta line: a 44px hit area without moving the line. */
const ORDER_LINK = cn(LINK, 'relative after:absolute after:-inset-y-2.5 after:inset-x-0')

/**
 * The heading of the row with `key` (`commentKey`: a subject type and digits, safe in a quoted
 * selector), which takes the focus after a delete.
 */
export function rowHeading(key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-comment="${key}"] h2`)
}

function ReplyItem({ reply }: { reply: MyCommentReply }) {
  return (
    <li
      className={cn(
        'flex flex-col gap-1 rounded-control',
        reply.is_user_admin && 'bg-brand-50 px-3 py-2',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span dir="auto" className="text-base font-bold text-ink-900">
          {reply.name}
        </span>
        {reply.is_user_admin && (
          <Badge tone="brand" size="sm">
            <Store aria-hidden />
            {SHOP_ANSWER}
          </Badge>
        )}
        <time dateTime={reply.created} className="text-sm text-ink-600">
          {formatJalaliDate(reply.created)}
        </time>
      </div>
      <p className="text-base leading-8 break-words whitespace-pre-line text-ink-800">
        {reply.review}
      </p>
    </li>
  )
}

export interface CommentRowProps {
  comment: MyComment
  /** Its delete is on its way: the row waits. */
  pending: boolean
  onDelete: () => void
  /** The pointer or the focus reached «حذف دیدگاه»: the dialog's code can start loading. */
  onPreloadDelete?: () => void
}

/**
 * One of the visitor's comments (digest §3.6): an article named by its subject (linked to its
 * page; a post's name is text while the blog is off), the status as the API words it on a pill
 * coloured by state, «پرسش», «پاسخ شما به یک دیدگاه», a review's stars and title and
 * «خریدار», the order it was written for, the date, the text and the visible replies (the shop's
 * marked «پاسخ فروشگاه»). Everything the visitor or others wrote is plain text.
 */
export function CommentRow({ comment, pending, onDelete, onPreloadDelete }: CommentRowProps) {
  const headingId = useId()
  const blog = useFeature('blog').enabled
  const { subject } = comment
  const href = subjectHref(comment, blog)
  return (
    <article
      data-comment={commentKey(comment)}
      aria-labelledby={headingId}
      aria-busy={pending || undefined}
      className="flex flex-col gap-3 rounded-card bg-white p-4 shadow-card md:p-5"
    >
      <div className="relative flex items-start gap-3">
        {subject.image && (
          <SmartImage
            src={subject.image}
            alt=""
            ratio="1/1"
            sizes="56px"
            className="size-14 shrink-0 rounded-control bg-ink-50"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-sm leading-6 text-ink-600">{SUBJECT_KIND[comment.subject_type]}</p>
          <h2
            id={headingId}
            tabIndex={-1}
            dir="auto"
            className="rounded-control text-base leading-7 font-bold break-words text-ink-900 outline-none focus-visible:ring-4 focus-visible:ring-(--focus)"
          >
            {href ? (
              <Link href={href} prefetch={false} className={SUBJECT_LINK}>
                {subject.name}
              </Link>
            ) : (
              subject.name
            )}
          </h2>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[comment.status] ?? 'neutral'} size="sm">
          {comment.status_display}
        </Badge>
        {comment.comment_type === 'question' && (
          <Badge tone="info" size="sm">
            <MessageCircleQuestion aria-hidden />
            پرسش
          </Badge>
        )}
        {comment.is_reply && (
          <Badge size="sm">
            <Reply aria-hidden />
            پاسخ شما به یک دیدگاه
          </Badge>
        )}
        {comment.is_verified_buyer && (
          <Badge tone="brand" size="sm">
            <BadgeCheck aria-hidden />
            خریدار
          </Badge>
        )}
      </div>

      {(comment.rating !== null || comment.title) && (
        <div className="flex flex-col gap-1">
          {comment.rating !== null && <Rating value={comment.rating} size="sm" showValue={false} />}
          {comment.title && (
            <h3 dir="auto" className="text-base leading-7 font-bold text-ink-900">
              {comment.title}
            </h3>
          )}
        </div>
      )}

      <ClampedText text={comment.review} />

      <p className="flex flex-wrap items-center gap-x-2 text-sm leading-6 text-ink-600">
        <time dateTime={comment.created}>{formatJalaliDate(comment.created)}</time>
        {comment.order_code && (
          <>
            <span aria-hidden>·</span>
            <Link href={orderHref(comment.order_code)} prefetch={false} className={ORDER_LINK}>
              سفارش <span dir="ltr">{comment.order_code}</span>
            </Link>
          </>
        )}
      </p>

      {comment.replies.length > 0 && (
        <ol aria-label="پاسخ‌ها" className="flex flex-col gap-3 border-s-2 border-ink-100 ps-3">
          {comment.replies.map((reply) => (
            <ReplyItem key={reply.id} reply={reply} />
          ))}
        </ol>
      )}

      <div className="flex border-t border-ink-100 pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-danger"
          iconStart={pending ? <Spinner size="sm" /> : <Trash2 aria-hidden />}
          aria-haspopup="dialog"
          aria-disabled={pending || undefined}
          onPointerEnter={onPreloadDelete}
          onFocus={onPreloadDelete}
          onClick={() => {
            if (!pending) onDelete()
          }}
        >
          حذف دیدگاه <span className="sr-only">روی «{subject.name}»</span>
        </Button>
      </div>
    </article>
  )
}
