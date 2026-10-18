'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cancelAttempt, type CancelOutcome } from '../attempt-api'
import { CANCEL_FORBIDDEN, SMS_NOTE } from '../open-attempt-parts'
import { CANCEL_PAID_NOTE, CANCEL_TITLE } from './transfer-copy'

// «انصراف از کارت به کارت» before a receipt is sent (order digest §3.2.6, §5.7 step 6): a
// confirmation that starts on «بازگشت» (nothing happens), says that cancelling sends a «پرداخت
// ناموفق» SMS and not to cancel once the money is sent, and abandons the attempt once however
// fast the presses (`POST payment/<uuid>/cancel/`). Its answer goes to the page
// (`onDone`); a refusal the page has no view for (another account's attempt, a wait, no answer)
// is said here and the dialog stays. Loaded on the first press.

export interface CancelTransferDialogProps {
  uuid: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Abandoned, or no longer abandonable (under review, not open): the page shows what it is. */
  onDone: (outcome: CancelOutcome) => void
}

export function CancelTransferDialog({
  uuid,
  open,
  onOpenChange,
  onDone,
}: CancelTransferDialogProps) {
  const keep = useRef<HTMLButtonElement>(null)
  const sending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  async function confirm() {
    if (sending.current || forbidden) return
    sending.current = true
    setBusy(true)
    setError(null)
    const outcome = await cancelAttempt(uuid)
    setBusy(false)
    if (outcome.ok || outcome.problem === 'under_review' || outcome.problem === 'stale') {
      // Handed to the page: never a second cancel from here.
      return onDone(outcome)
    }
    sending.current = false
    if (outcome.problem === 'forbidden') {
      setForbidden(true)
      return setError(CANCEL_FORBIDDEN)
    }
    setError(outcome.detail)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        title={CANCEL_TITLE}
        description={SMS_NOTE}
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
            {!forbidden && (
              <Button
                variant="danger"
                aria-disabled={busy || undefined}
                aria-busy={busy || undefined}
                onClick={() => void confirm()}
              >
                {busy ? 'در حال انصراف…' : 'انصراف از پرداخت'}
              </Button>
            )}
          </div>
        }
      >
        <p className="text-base leading-7 font-medium text-ink-900">{CANCEL_PAID_NOTE}</p>
        {error && (
          <p role="alert" className="mt-3 text-base leading-7 text-danger">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
