'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button, type ButtonSize } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
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
 * «ادامهٔ خرید»: a link to `/checkout/` (never prefetched: the checkout reads the cart afresh),
 * or, while held back, a button that stays focusable but does nothing (`aria-disabled`),
 * described by the reason.
 */
export function CheckoutCta({ reason, reasonId, size = 'lg', className }: CheckoutCtaProps) {
  if (reason === null) {
    return (
      <Link href="/checkout/" prefetch={false} className={cn(buttonClasses({ size }), className)}>
        {CHECKOUT_LABEL}
        <ArrowLeft aria-hidden />
      </Link>
    )
  }
  return (
    <Button size={size} aria-disabled aria-describedby={reasonId} className={className}>
      {CHECKOUT_LABEL}
    </Button>
  )
}
