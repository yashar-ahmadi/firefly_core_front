'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { CouponBlock } from '@/lib/api/types/cart'
import { useRemoveCoupon } from '../coupon-hooks'

const FREE_SHIPPING_NOTE = 'ارسال رایگان پس از انتخاب روش ارسال اعمال می\u{200C}شود'

export interface AppliedCouponProps {
  coupon: CouponBlock
  /** Just applied by the shopper: the status takes the focus, and says it (no toast). */
  focus: boolean
  /** Removed by the shopper (the field comes back and takes the focus). */
  onRemoved: () => void
}

/** The coupon on the cart: its code and title, the free-shipping note, and «حذف کد تخفیف». */
export function AppliedCoupon({ coupon, focus, onRemoved }: AppliedCouponProps) {
  const { remove, isPending } = useRemoveCoupon()
  const status = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (focus) status.current?.focus()
  }, [focus])
  return (
    <div className="flex flex-col gap-2">
      <p ref={status} tabIndex={-1} className="text-base text-ink-800 outline-none">
        {'کد '}
        <span dir="ltr" className="rounded-pill bg-sale/10 px-2 font-bold text-sale">
          {coupon.code}
        </span>
        {' روی سبد اعمال شد.'}
      </p>
      {coupon.title && <p className="text-sm leading-6 text-ink-600">{coupon.title}</p>}
      {coupon.discount_type === 'free_shipping' && (
        <p className="text-sm leading-6 font-medium text-success">{FREE_SHIPPING_NOTE}</p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        aria-busy={isPending || undefined}
        iconStart={isPending ? <Spinner size="sm" /> : undefined}
        onClick={async () => {
          if (!isPending && (await remove())) onRemoved()
        }}
      >
        حذف کد تخفیف
      </Button>
    </div>
  )
}
