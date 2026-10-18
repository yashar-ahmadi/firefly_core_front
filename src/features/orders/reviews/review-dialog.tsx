'use client'

import { useRef } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import type { AwaitingReviewProduct } from '@/lib/api/types/order-review'
import { toPersianDigits } from '@/lib/format'
import { PurchaseReviewForm } from './purchase-review-form'

// The review form of one purchase, in a dialog (focus kept inside; Escape closes it, and the
// focus returns where the page says). Loaded on the first «ثبت دیدگاه».

export interface ReviewDialogProps {
  orderCode: string
  product: AwaitingReviewProduct
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted: (message: string) => void
  onStale: (reason: string) => void
  onCloseAutoFocus?: (event: Event) => void
}

export function ReviewDialog({
  orderCode,
  product,
  open,
  onOpenChange,
  onSubmitted,
  onStale,
  onCloseAutoFocus,
}: ReviewDialogProps) {
  const body = useRef<HTMLDivElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`دیدگاه دربارهٔ ${product.name}`}
        description={`سفارش ${toPersianDigits(orderCode)}؛ دیدگاه شما پس از بررسی فروشگاه نمایش داده می‌شود.`}
        size="lg"
        onCloseAutoFocus={onCloseAutoFocus}
        // Starts on the stars (the first thing to give), not on the ×.
        onOpenAutoFocus={(event) => {
          const first = body.current?.querySelector<HTMLElement>('input[type="radio"]')
          if (!first) return
          event.preventDefault()
          first.focus()
        }}
      >
        <div ref={body}>
          <PurchaseReviewForm
            key={`${orderCode}-${product.id}`}
            orderCode={orderCode}
            product={product}
            onSubmitted={onSubmitted}
            onStale={onStale}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
