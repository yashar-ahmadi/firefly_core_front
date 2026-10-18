'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useSubmitWait } from '@/components/form/code-timers'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { tell } from '@/components/ui/tell'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { WithdrawalRequest } from '@/lib/api/types/wallet'
import { formatToman } from '@/lib/format/number'
import { NO_WAIT, restartWait, type Wait } from '@/lib/forms/waits'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { postWithdrawalCancel } from './api'
import { walletChanged } from './wallet-queries'

// «لغو درخواست» of an open withdrawal (order digest §3.3.6, §8.5): a question that starts on
// «انصراف» (the safe choice: nothing happens); «لغو درخواست» sends it once however fast the
// presses. 200: the money is back in the balance at once (said), the wallet's reads again. 409
// `wallet_withdrawal_not_cancellable` (reviewed meanwhile) and 404: said, the list read again,
// only «بازگشت» left; a 429 waits on the button. Its own chunk: loaded on the first press.

export interface CancelWithdrawalDialogProps {
  request: WithdrawalRequest
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where the focus goes as it closes (its «لغو درخواست» goes with the cancellation). */
  onCloseAutoFocus?: (event: Event) => void
}

const STALE = new Set(['wallet_withdrawal_not_cancellable', 'not_found'])

export function CancelWithdrawalDialog({
  request,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: CancelWithdrawalDialogProps) {
  const client = useQueryClient()
  const expire = useSessionExpired()
  const keep = useRef<HTMLButtonElement>(null)
  const sending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<{ text: string; final: boolean } | null>(null)
  const [wait, setWait] = useState<Wait>(NO_WAIT)
  // Opened again: afresh (no refusal or wait of before).
  const [shown, setShown] = useState(open)
  if (open !== shown) {
    setShown(open)
    if (open) {
      setFailure(null)
      setWait(NO_WAIT)
    }
  }
  const lock = useSubmitWait(wait)

  async function confirm() {
    if (sending.current || lock.locked || failure?.final) return
    sending.current = true
    setBusy(true)
    setFailure(null)
    try {
      const cancelled = await postWithdrawalCancel(request.uuid)
      tell(`درخواست برداشت لغو شد و ${formatToman(cancelled.amount)} به کیف پول شما برگشت.`)
      walletChanged(client)
      onOpenChange(false)
    } catch (error) {
      if (isSessionExpiredError(error)) return expire()
      const api = error instanceof ApiError ? error : null
      if (api?.status === 429) {
        setWait((previous) => restartWait(previous, Date.now(), api.retryAfter ?? 60))
        return
      }
      const final = !!api && STALE.has(api.code)
      if (final) {
        walletChanged(client)
        keep.current?.focus()
      }
      const text =
        api?.code === 'not_found'
          ? 'این درخواست برداشت پیدا نشد؛ فهرست به\u{200C}روز شد.'
          : (api?.detail ?? GENERIC_ERROR_DETAIL)
      setFailure({ text, final })
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        title="لغو درخواست برداشت"
        description={`درخواست برداشت ${formatToman(request.amount)} لغو می\u{200C}شود و این مبلغ همین حالا به کیف پول شما برمی\u{200C}گردد.`}
        size="sm"
        onCloseAutoFocus={onCloseAutoFocus}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          keep.current?.focus()
        }}
        footer={
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:justify-end">
            <Button ref={keep} variant="outline" onClick={() => onOpenChange(false)}>
              {failure?.final ? 'بازگشت' : 'انصراف'}
            </Button>
            {!failure?.final && (
              <Button
                variant="danger"
                aria-disabled={busy || lock.locked || undefined}
                aria-busy={busy || undefined}
                aria-describedby={lock.locked ? lock.noteId : undefined}
                onClick={() => void confirm()}
              >
                {busy ? 'در حال لغو…' : 'لغو درخواست'}
              </Button>
            )}
          </div>
        }
      >
        {failure && (
          <p role="alert" className="text-base leading-7 text-danger">
            {failure.text}
          </p>
        )}
        {lock.note}
      </DialogContent>
    </Dialog>
  )
}
