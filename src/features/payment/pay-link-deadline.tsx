'use client'

import { CalendarClock } from 'lucide-react'
import { useEffect } from 'react'
import { Countdown } from '@/components/ui/countdown'
import { announce } from '@/components/ui/live-announcer'
import { formatJalaliDateTime } from '@/lib/format/date-time'

// The order's payment deadline (the link's `expires_at`, order digest §9: placement + 72 h): the
// time, and what is left on a countdown that is no live region (it would speak every second).
// Screen readers hear it only at thresholds (an hour left, ten minutes left) and when it ends,
// through the shell's polite region; at the end the page reads the order again (its link then
// says the deadline passed). Nothing owed online (a pure pay-on-delivery order, `confirmOnly`):
// it is the deadline to confirm the order, and every word says so (as the thanks page does).

/** «مهلت پرداخت» or «مهلت تأیید»: the deadline's own name. */
const deadlineOf = (confirmOnly: boolean) => (confirmOnly ? 'مهلت تأیید' : 'مهلت پرداخت')
const thresholds = (deadline: string): ReadonlyArray<{ ms: number; say: string }> => [
  { ms: 60 * 60_000, say: `یک ساعت تا پایان ${deadline} این سفارش مانده است.` },
  { ms: 10 * 60_000, say: `ده دقیقه تا پایان ${deadline} این سفارش مانده است.` },
]
/** setTimeout's own ceiling (about 24.8 days): a later threshold is not scheduled. */
const MAX_DELAY = 2 ** 31 - 1

export interface PayLinkDeadlineProps {
  expiresAt: string
  onEnd: () => void
  /** Nothing is owed online: the deadline confirms the order, it does not pay it. */
  confirmOnly?: boolean
}

export function PayLinkDeadline({ expiresAt, onEnd, confirmOnly = false }: PayLinkDeadlineProps) {
  const deadline = deadlineOf(confirmOnly)
  const ended = () => {
    announce(`${deadline} این سفارش تمام شد.`)
    onEnd()
  }
  useEffect(() => {
    const end = Date.parse(expiresAt)
    if (Number.isNaN(end)) return
    const timers = thresholds(deadline).flatMap(({ ms, say }) => {
      const delay = end - ms - Date.now()
      return delay > 0 && delay <= MAX_DELAY ? [setTimeout(() => announce(say), delay)] : []
    })
    return () => timers.forEach(clearTimeout)
  }, [expiresAt, deadline])
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base leading-7 text-ink-700">
      <CalendarClock aria-hidden className="size-5 text-ink-500" />
      <span>
        {`${deadline}: `}
        <time dateTime={expiresAt}>{formatJalaliDateTime(expiresAt)}</time>
      </span>
      <span className="text-ink-600">
        (<Countdown endsAt={expiresAt} onEnd={ended} className="tabular-nums" /> مانده)
      </span>
    </p>
  )
}
