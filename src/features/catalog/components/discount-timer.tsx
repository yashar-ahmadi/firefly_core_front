'use client'

import { Timer } from 'lucide-react'
import { useCallback, useSyncExternalStore } from 'react'
import { clockNow, subscribeClock } from '@/components/ui/clock'
import { cn } from '@/components/ui/cn'
import { Countdown } from '@/components/ui/countdown'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { toPersianDigits } from '@/lib/format'

const DAY_MS = 86_400_000
/** The snapshot once the deal is over. */
const OVER = -1

/**
 * A card's timed discount as a sale pill on the image (white on `sale`, AA). From one day up it
 * shows whole days left («۲ روز»), which fits a phone card; under a day the ticking «۰۴:۵۶:۲۸».
 * It disappears when the time is up, also when it was already over at mount (a cached page).
 * `endsAt` is the API's end timestamp in ms. The server and hydration show the clock's
 * placeholder, so the markup never mismatches.
 */
export function DiscountTimer({ endsAt, className }: { endsAt: number; className?: string }) {
  // Whole days left (0 under a day), OVER, or null before the clock runs. A number, so the pill
  // re-renders only when the day count changes; the Countdown ticks on its own.
  const daysLeft = useSyncExternalStore(
    subscribeClock,
    useCallback(() => {
      const now = clockNow()
      if (now === null) return null
      const left = endsAt - now
      return left <= 0 ? OVER : Math.floor(left / DAY_MS)
    }, [endsAt]),
    () => null,
  )
  if (daysLeft === OVER) return null

  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-pill bg-sale px-2 text-sm font-bold text-sale-fg shadow-sm',
        className,
      )}
    >
      <Timer aria-hidden className="size-3.5 shrink-0" />
      <VisuallyHidden>{'زمان باقی\u{200C}مانده تا پایان تخفیف: '}</VisuallyHidden>
      {daysLeft !== null && daysLeft > 0 ? (
        <span role="timer" aria-live="off">{`${toPersianDigits(daysLeft)} روز`}</span>
      ) : (
        <Countdown endsAt={endsAt} className="font-bold" />
      )}
    </span>
  )
}
