'use client'

import { useRef, useState } from 'react'
import { useSubmitWait } from '@/components/form/code-timers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { tell } from '@/components/ui/tell'
import { Textarea } from '@/components/ui/textarea'
import type { OrderDetail } from '@/lib/api/types/order-detail'
import { toPersianDigits } from '@/lib/format'
import { NO_WAIT, restartWait, type Wait } from '@/lib/forms/waits'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import {
  CANCEL_REASON_MAX,
  cancelledText,
  cancelOrder,
  isStaleRefusal,
  type CancelOutcome,
} from './cancel-api'

// «لغو سفارش» of an account order (order digest §3.1.4; while `can_cancel`): a question that
// starts on «بازگشت» (the safe choice: nothing happens), an optional reason (≤ 500, the shop's
// eyes only), and «لغو سفارش» sends it once however fast the presses. Cancelled → said once
// (with «درخواست بازگشت وجه ثبت شد…» when money was already settled), the dialog closes and the
// page shows the API's order. A refusal is said here: one that means the page is out of date
// (cancelled already, past cancelling, gone) also reads the order again, and the dialog offers
// only «بازگشت»; a 429 waits on the button. Loaded on the first press of «لغو سفارش».

export interface CancelDialogProps {
  code: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCancelled: (order: OrderDetail) => void
  /** The order is not as the page shows it: read it again. */
  onStale: () => void
  /** Where the focus goes as it closes (the list: the card's heading, its button may go). */
  onCloseAutoFocus?: (event: Event) => void
}

type Failure = Extract<CancelOutcome, { ok: false }>

export function CancelDialog({
  code,
  open,
  onOpenChange,
  onCancelled,
  onStale,
  onCloseAutoFocus,
}: CancelDialogProps) {
  const keep = useRef<HTMLButtonElement>(null)
  const sending = useRef(false)
  const expire = useSessionExpired()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [wait, setWait] = useState<Wait>(NO_WAIT)
  const lock = useSubmitWait(wait)
  const final = failure !== null && isStaleRefusal(failure.refusal)

  async function confirm() {
    if (sending.current || lock.locked || final) return
    sending.current = true
    setBusy(true)
    setFailure(null)
    const outcome = await cancelOrder(code, reason)
    sending.current = false
    setBusy(false)
    if (outcome.ok) {
      tell(cancelledText(outcome.order))
      onCancelled(outcome.order)
      return onOpenChange(false)
    }
    if (outcome.refusal === 'session') return expire()
    if (outcome.retryAfter)
      setWait((previous) => restartWait(previous, Date.now(), outcome.retryAfter!))
    if (isStaleRefusal(outcome.refusal)) {
      onStale()
      // «لغو سفارش» goes with this answer: the focus stays in the dialog, on «بازگشت».
      keep.current?.focus()
    }
    setFailure(outcome)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        title="لغو سفارش"
        description={`سفارش ${toPersianDigits(code)} لغو می\u{200C}شود و دیگر نمی\u{200C}توان آن را پرداخت کرد. این کار برگشت\u{200C}پذیر نیست.`}
        size="sm"
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          keep.current?.focus()
        }}
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-end">
            <Button ref={keep} variant="outline" onClick={() => onOpenChange(false)}>
              بازگشت
            </Button>
            {!final && (
              <Button
                variant="danger"
                aria-disabled={busy || lock.locked || undefined}
                aria-busy={busy || undefined}
                aria-describedby={lock.locked ? lock.noteId : undefined}
                onClick={() => void confirm()}
              >
                {busy ? 'در حال لغو…' : 'لغو سفارش'}
              </Button>
            )}
          </div>
        }
      >
        {!final && (
          <Field
            label={
              <>
                دلیل لغو <span className="font-normal text-ink-600">(اختیاری)</span>
              </>
            }
            hint={`حداکثر ${toPersianDigits(CANCEL_REASON_MAX)} نویسه؛ فقط فروشگاه آن را می\u{200C}بیند.`}
            error={failure?.refusal === 'field' ? failure.detail : null}
          >
            <Textarea
              name="cancel-reason"
              rows={3}
              maxLength={CANCEL_REASON_MAX}
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
          </Field>
        )}
        {failure && failure.refusal !== 'field' && (
          <p role="alert" className="mt-3 text-base leading-7 text-danger">
            {failure.detail}
          </p>
        )}
        {lock.note}
      </DialogContent>
    </Dialog>
  )
}
