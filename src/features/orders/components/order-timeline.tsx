import { formatJalaliDateTime } from '@/lib/format/date-time'
import type { OrderTimelineEntry } from '@/lib/api/types/order-detail'

// An order's history (order digest §6.4 `timeline`): every row the API sends, oldest first, in its
// own words (`to_status_display`: rejections and corrections included, operators' notes never
// sent) with its moment (Jalali, Tehran time). Drawn as sent: nothing reordered, merged or
// guessed. For the account's order page (Plan 4 Task 8); tracking has no timeline. Nothing at all
// without rows. No state: a server component as well.

export interface OrderTimelineProps {
  timeline: OrderTimelineEntry[]
  /** The heading's level in the page (default 2). */
  headingLevel?: 2 | 3
}

export function OrderTimeline({ timeline, headingLevel = 2 }: OrderTimelineProps) {
  if (timeline.length === 0) return null
  const Heading = headingLevel === 3 ? 'h3' : 'h2'
  return (
    <section aria-labelledby="order-timeline-heading" className="flex flex-col gap-3">
      <Heading id="order-timeline-heading" className="text-lg leading-8 font-bold text-ink-900">
        تاریخچهٔ سفارش
      </Heading>
      <ol aria-label="تاریخچهٔ سفارش" className="flex flex-col">
        {timeline.map((entry, index) => (
          <li
            key={`${entry.created}-${index}`}
            className="relative flex gap-3 ps-1 pb-4 after:absolute after:start-[8px] after:top-5 after:bottom-0 after:w-px after:bg-ink-200 last:pb-0 last:after:hidden"
          >
            <span aria-hidden className="mt-2 size-2.5 shrink-0 rounded-full bg-ink-400" />
            <span className="flex min-w-0 flex-col">
              <span data-entry-label className="text-base leading-7 font-medium text-ink-900">
                {entry.to_status_display}
              </span>
              <time dateTime={entry.created} className="text-sm leading-6 text-ink-600">
                {formatJalaliDateTime(entry.created)}
              </time>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
