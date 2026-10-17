'use client'

import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import type { NotificationItem as Notification } from '@/lib/api/types/notification'
import { formatJalaliDateTime, formatRelative } from '@/lib/format/date-time'

export interface NotificationItemProps {
  item: Notification
  /** The visitor opened it (an unread one is then marked read: `useMarkRead`). */
  onOpen: (item: Notification) => void
}

/**
 * One notification of the inbox, a disclosure: its title is a button (`aria-expanded`) that
 * shows the whole text and the picture, the text clamped to two lines meanwhile. Unread: a dot,
 * a bold title and «خوانده‌نشده» for screen readers. The date in Jalali with how long ago. The
 * text is plain (line breaks kept); there is no link to follow (the API has none).
 */
export function NotificationItem({ item, onOpen }: NotificationItemProps) {
  const [expanded, setExpanded] = useState(false)
  const bodyId = useId()
  const unread = !item.is_read
  const toggle = () => {
    if (!expanded) onOpen(item)
    setExpanded(!expanded)
  }
  return (
    <article
      data-notification={item.id}
      className={cn(
        'rounded-card bg-white shadow-card transition-shadow',
        unread && 'ring-1 ring-brand-200',
      )}
    >
      <h2>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={toggle}
          className="flex min-h-14 w-full items-start gap-3 rounded-card px-4 pt-4 pb-1 text-start outline-none focus-visible:ring-4 focus-visible:ring-(--focus) md:px-5"
        >
          <span
            aria-hidden
            className={cn(
              'mt-2.5 size-2.5 shrink-0 rounded-full',
              unread ? 'bg-brand' : 'border border-ink-300',
            )}
          />
          <span
            dir="auto"
            className={cn(
              'min-w-0 flex-1 text-base leading-7',
              unread ? 'font-bold text-ink-900' : 'font-medium text-ink-800',
            )}
          >
            {item.title}
            {unread && (
              <>
                {' '}
                <VisuallyHidden>خوانده‌نشده</VisuallyHidden>
              </>
            )}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              'mt-1 size-5 shrink-0 text-ink-500 motion-safe:transition-transform motion-safe:duration-200',
              expanded && 'rotate-180',
            )}
          />
        </button>
      </h2>
      <p className="ps-[2.375rem] pe-4 text-sm text-ink-600 md:ps-[2.625rem] md:pe-5">
        <time dateTime={item.created}>{formatJalaliDateTime(item.created)}</time>
        <span aria-hidden> · </span>
        <span>{formatRelative(item.created)}</span>
      </p>
      <div
        id={bodyId}
        className="flex flex-col gap-3 ps-[2.375rem] pe-4 pt-2 pb-4 md:ps-[2.625rem] md:pe-5"
      >
        {expanded && item.image && (
          <SmartImage
            src={item.image}
            alt=""
            ratio="2/1"
            fit="contain"
            sizes="(min-width: 768px) 640px, 100vw"
            className="max-w-xl overflow-hidden rounded-control bg-ink-50"
          />
        )}
        <p
          dir="auto"
          className={cn(
            'text-base leading-7 whitespace-pre-line text-ink-700',
            !expanded && 'line-clamp-2',
          )}
        >
          {item.body}
        </p>
      </div>
    </article>
  )
}
