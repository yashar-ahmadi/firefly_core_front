'use client'

import { TicketPercent } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useFeature } from '@/features/settings/feature-context'
import type { Cart } from '@/lib/api/types/cart'
import { couponApplied } from '../coupon-messages'
import { AppliedCoupon } from './applied-coupon'
import { CouponForm } from './coupon-form'

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="flex items-center gap-2 text-base font-bold text-ink-900">
        <TicketPercent aria-hidden className="size-5 text-brand-600" />
        کد تخفیف
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/**
 * The cart page's coupon box (cart digest §3.6–3.7). With a coupon on the cart: its code, title
 * and «حذف کد تخفیف» (removing stays open with the `coupons` switch off). Without one: the code
 * form, unless the switch is off. A `503 feature_disabled` on apply puts the operator's
 * sentence in the form's place. The focus follows: to the coupon once applied (which says it),
 * to the field once removed.
 */
export function CouponBox({ cart, className }: { cart: Cart; className?: string }) {
  const { enabled } = useFeature('coupons')
  const [switchedOff, setSwitchedOff] = useState<string | null>(null)
  // Where the focus goes after the shopper's own apply or remove (never after a coupon the API
  // took off by itself).
  const [moved, setMoved] = useState<'applied' | 'field' | null>(null)

  if (couponApplied(cart.coupon)) {
    return (
      <Frame className={className}>
        <AppliedCoupon
          coupon={cart.coupon}
          focus={moved === 'applied'}
          onRemoved={() => setMoved('field')}
        />
      </Frame>
    )
  }
  if (switchedOff !== null) {
    return (
      <Frame className={className}>
        <p role="status" className="text-sm leading-6 text-ink-600">
          {switchedOff}
        </p>
      </Frame>
    )
  }
  if (!enabled) return null
  return (
    <Frame className={className}>
      <CouponForm
        focus={moved === 'field'}
        onApplied={() => setMoved('applied')}
        onSwitchedOff={setSwitchedOff}
      />
    </Frame>
  )
}
