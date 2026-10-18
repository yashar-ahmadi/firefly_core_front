'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { TotalChangedBody, type TotalChangedProps } from './total-changed-body'

// «مبلغ سفارش تغییر کرد» (409 `order_total_changed`, order digest §5.1 step 3; Review Focus #1):
// the cart read again, its new amounts, and a new confirmation. It starts on «بازبینی دوباره»
// (the safe choice: look again, nothing is placed); placing at the new total is a second,
// deliberate press, offered only while every step is still done for the new cart. The receiver
// and the note stay where they were (the page's own state). Loaded on the refusal only.

export function TotalChangedDialog({
  cart,
  previous,
  canConfirm,
  onReview,
  onConfirm,
}: TotalChangedProps) {
  const review = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open onOpenChange={(open) => !open && onReview()}>
      <DialogContent
        title="مبلغ سفارش تغییر کرد"
        size="sm"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          review.current?.focus()
        }}
        footer={
          <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button ref={review} variant={canConfirm ? 'outline' : 'primary'} onClick={onReview}>
              بازبینی دوباره
            </Button>
            {canConfirm && (
              <Button onClick={() => onConfirm(cart.total)}>ثبت سفارش با مبلغ جدید</Button>
            )}
          </div>
        }
      >
        <TotalChangedBody cart={cart} previous={previous} />
      </DialogContent>
    </Dialog>
  )
}
