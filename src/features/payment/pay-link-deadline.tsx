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
// says the deadline passed).

const THRESHOLDS: ReadonlyArray<{ ms: number; say: string }> = [
  { ms: 60 * 60_000, say: 'یک ساعت تا پایان مهلت پرداخت این سفارش مانده است.' },
  { ms: 10 * 60_000, say: 'ده دقیقه تا پایان مهلت پرداخت این سفارش مانده است.' },
]
const ENDED = 'مهلت پرداخت این سفارش تمام شد.'
/** setTimeout's own ceiling (about 24.8 days): a later threshold is not scheduled. */
const MAX_DELAY = 2 ** 31 - 1

export function PayLinkDeadline({ expiresAt, onEnd }: { expiresAt: string; onEnd: () => void }) {
  const ended = () => {
    announce(ENDED)
    onEnd()
  }
  useEffect(() => {
    const end = Date.parse(expiresAt)
    if (Number.isNaN(end)) return
    const timers = THRESHOLDS.flatMap(({ ms, say }) => {
      const delay = end - ms - Date.now()
      return delay > 0 && delay <= MAX_DELAY ? [setTimeout(() => announce(say), delay)] : []
    })
    return () => timers.forEach(clearTimeout)
  }, [expiresAt])
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base leading-7 text-ink-700">
      <CalendarClock aria-hidden className="size-5 text-ink-500" />
      <span>
        {'مهلت پرداخت: '}
        <time dateTime={expiresAt}>{formatJalaliDateTime(expiresAt)}</time>
      </span>
      <span className="text-ink-600">
        (<Countdown endsAt={expiresAt} onEnd={ended} className="tabular-nums" /> مانده)
      </span>
    </p>
  )
}
