'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import type { OrderPaymentLink } from '@/lib/api/types/order'
import { toPersianDigits } from '@/lib/format'
import { CANCEL_REASON_MAX, cancelOrder } from './link-api'
import type { LinkRefusal } from './link-refusal'

// «لغو سفارش» through the payment link (order digest §3.1.10): a confirmation that starts on
// «بازگشت» (the safe choice: nothing happens), an optional reason (at most 500 characters, for
// the shop's eyes only), and «لغو سفارش» sends it once however fast the presses. Cancelled → the
// page shows it; a link that refuses now (cancelled or paid meanwhile) → the page shows why; the
// cancellation itself refused (`order_cancellation_not_allowed`), a wait or a lost answer → said
// here, the dialog stays. Loaded on the first press of «لغو سفارش».

export interface CancelOrderDialogProps {
  token: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCancelled: (link: OrderPaymentLink) => void
  onRefused: (refusal: LinkRefusal) => void
}

export function CancelOrderDialog({
  token,
  open,
  onOpenChange,
  onCancelled,
  onRefused,
}: CancelOrderDialogProps) {
  const keep = useRef<HTMLButtonElement>(null)
  const sending = useRef(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{ detail: string; field: boolean } | null>(null)

  async function confirm() {
    if (sending.current) return
    sending.current = true
    setBusy(true)
    setError(null)
    const outcome = await cancelOrder(token, reason)
    sending.current = false
    setBusy(false)
    if (outcome.ok) return onCancelled(outcome.link)
    if (outcome.refusal) return onRefused(outcome.refusal)
    setError({ detail: outcome.detail, field: outcome.field })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        title="لغو سفارش"
        description={
          'سفارش لغو می\u{200C}شود و دیگر نمی\u{200C}توان آن را پرداخت کرد. این کار برگشت\u{200C}پذیر نیست.'
        }
        size="sm"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          keep.current?.focus()
        }}
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-end">
            <Button ref={keep} variant="outline" onClick={() => onOpenChange(false)}>
              بازگشت
            </Button>
            <Button
              variant="danger"
              aria-disabled={busy || undefined}
              aria-busy={busy || undefined}
              onClick={() => void confirm()}
            >
              {busy ? 'در حال لغو…' : 'لغو سفارش'}
            </Button>
          </div>
        }
      >
        <Field
          label={
            <>
              دلیل لغو <span className="font-normal text-ink-600">(اختیاری)</span>
            </>
          }
          hint={`حداکثر ${toPersianDigits(CANCEL_REASON_MAX)} نویسه؛ فقط فروشگاه آن را می\u{200C}بیند.`}
          error={error?.field ? error.detail : null}
        >
          <Textarea
            name="cancel-reason"
            rows={3}
            maxLength={CANCEL_REASON_MAX}
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        </Field>
        {error && !error.field && (
          <p role="alert" className="mt-3 text-base leading-7 text-danger">
            {error.detail}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
