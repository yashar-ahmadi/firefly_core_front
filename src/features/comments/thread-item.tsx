import { Fragment, type ReactNode } from 'react'
import { cn } from '@/components/ui/cn'
import { formatJalaliDate } from '@/lib/format'

// One entry of a comment thread with its replies, for every comment list of the shop (a
// product's reviews and questions, a blog post's comments and Q&A): the shape the API gives
// them all (an id, a name, a date, the shop's own answer flagged, replies at any depth).

/** Replies deeper than this sit at this depth: narrow screens keep their width. */
export const MAX_INDENT = 2

/** What a thread entry needs of a comment. */
export interface ThreadComment {
  id: number
  name: string
  created: string
  /** The shop's own answer, written in the panel: tinted. */
  is_user_admin: boolean
  replies: ThreadComment[]
}

/** Oldest first (the API sends replies newest first), the id breaking ties. */
export function chronological<T extends ThreadComment>(replies: readonly T[]): T[] {
  return [...replies].sort((a, b) => Date.parse(a.created) - Date.parse(b.created) || a.id - b.id)
}

export interface ThreadItemProps<T extends ThreadComment> {
  comment: T
  depth: number
  /** After the name: «شما», the shop's answer… */
  badges?: ReactNode
  /** Under the name and the date: the text and what goes with it. */
  children: ReactNode
  /** One reply, a level deeper (the same component, as a rule). */
  renderReply: (reply: T, depth: number) => ReactNode
}

/**
 * A list item: the entry as an `<article>` (focusable from script: «نمایش بیشتر» moves the focus
 * to the first new one), its author (`dir="auto"`), badges and Jalali date, its body, then its
 * replies oldest first, indented `MAX_INDENT` levels at most.
 */
export function ThreadItem<T extends ThreadComment>({
  comment,
  depth,
  badges,
  children,
  renderReply,
}: ThreadItemProps<T>) {
  const replies = chronological(comment.replies as T[])
  return (
    <li data-depth={Math.min(depth, MAX_INDENT)} className="min-w-0">
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
          {badges}
          <time dateTime={comment.created} className="text-sm text-ink-600">
            {formatJalaliDate(comment.created)}
          </time>
        </div>
        {children}
      </article>
      {replies.length > 0 && (
        <ol
          aria-label={`پاسخ\u{200C}ها به ${comment.name}`}
          className={cn(
            'flex flex-col',
            depth < MAX_INDENT && 'ms-3 border-s-2 border-ink-100 ps-3 md:ms-6 md:ps-4',
          )}
        >
          {replies.map((reply) => (
            <Fragment key={reply.id}>{renderReply(reply, depth + 1)}</Fragment>
          ))}
        </ol>
      )}
    </li>
  )
}
