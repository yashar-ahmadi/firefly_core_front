'use client'

import { Timer } from 'lucide-react'
import { useState } from 'react'
import { Countdown } from '@/components/ui/countdown'
import { VisuallyHidden } from '@/components/ui/visually-hidden'

/**
 * Time left of a card's timed discount. `endsAt` is the API's end timestamp in ms. The row hides
 * itself once the time is up (also when it was already over at mount), so a cached page never
 * shows a finished deal as running.
 */
export function DiscountTimer({ endsAt }: { endsAt: number }) {
  const [ended, setEnded] = useState(false)
  if (ended) return null
  return (
    // Phone cards are too narrow for the icon and «۲ روز و ۰۴:۵۶:۲۸» on one line.
    <p className="flex min-h-6 flex-wrap items-center gap-1.5 text-sm font-medium text-sale">
      <Timer aria-hidden className="size-4 shrink-0 max-sm:hidden" />
      <VisuallyHidden>{'زمان باقی\u{200C}مانده تا پایان تخفیف: '}</VisuallyHidden>
      <Countdown endsAt={endsAt} onEnd={() => setEnded(true)} />
    </p>
  )
}
