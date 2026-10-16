'use client'

import { Timer } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSyncExternalStore } from 'react'
import { cn } from '@/components/ui/cn'
import { clockNow, subscribeClock } from '@/components/ui/clock'
import { Countdown } from '@/components/ui/countdown'
import { Price, type PriceSize } from '@/components/ui/price'
import type { Variant } from '@/lib/api/types/catalog'

/**
 * The time left on a timed discount. Rendered on the server and during hydration (the clock is
 * not running there, so both agree); once the clock runs it disappears if the end has passed (a
 * page cached a little longer than the deal). When it reaches zero the page is read again: the
 * price changes then.
 */
function DealCountdown({ endsAt }: { endsAt: number }) {
  const router = useRouter()
  const now = useSyncExternalStore(subscribeClock, clockNow, () => null)
  if (now !== null && endsAt <= now) return null
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-sale">
      <Timer aria-hidden className="size-5" />
      <span>زمان باقی مانده تا پایان تخفیف</span>
      <Countdown endsAt={endsAt} variant="boxed" onEnd={() => router.refresh()} />
    </p>
  )
}

export interface PriceBlockProps {
  /** Nothing is shown without a variant. */
  variant: Variant | null
  size?: PriceSize
  /** Leave the countdown out (the buy bar has no room for it). */
  countdown?: boolean
  className?: string
}

/**
 * The variant's price from the API (product digest §5.3): `final_price`, with `price` struck and
 * the percent only when `has_discount`, and the countdown of a timed discount. Never a price
 * from the JSON-LD (Rial).
 */
export function PriceBlock({ variant, size = 'lg', countdown = true, className }: PriceBlockProps) {
  if (!variant) return null
  const endsAt = variant.has_discount ? variant.discount_time_remaining : null
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Price
        amount={variant.final_price}
        original={variant.has_discount ? variant.price : null}
        discountPercent={variant.has_discount ? variant.discount_percent : undefined}
        size={size}
        muted={!variant.in_stock}
      />
      {countdown && endsAt !== null && <DealCountdown endsAt={endsAt} />}
    </div>
  )
}
