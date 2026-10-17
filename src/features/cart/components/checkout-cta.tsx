'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { buttonClasses, type ButtonSize } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'

export const CHECKOUT_LABEL = 'ادامه\u{0654} خرید'

export interface CheckoutCtaProps {
  /** Why the checkout is held back (`checkoutBlock`), or null. */
  reason: string | null
  /** The id of the element that shows `reason` (the caller places it). */
  reasonId: string
  size?: ButtonSize
  className?: string
}

/**
 * «ادامهٔ خرید»: one link to `/checkout/` (never prefetched: the checkout reads the cart
 * afresh), the same element whether or not it is held back, so a reason that comes or goes
 * while it has the focus keeps the focus there. Held back, it stays focusable but does nothing
 * (`aria-disabled`, its clicks cancelled), described by the reason.
 */
export function CheckoutCta({ reason, reasonId, size = 'lg', className }: CheckoutCtaProps) {
  const held = reason !== null
  return (
    <Link
      href="/checkout/"
      prefetch={false}
      aria-disabled={held || undefined}
      aria-describedby={held ? reasonId : undefined}
      onClick={(event) => {
        if (held) event.preventDefault()
      }}
      className={cn(buttonClasses({ size }), held && 'cursor-not-allowed opacity-50', className)}
    >
      {CHECKOUT_LABEL}
      <ArrowLeft aria-hidden />
    </Link>
  )
}
