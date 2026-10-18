'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import type { ReceiptRejectionCode } from '@/lib/api/types/payment'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { readReceiptDetail } from './card-transfer-api'

// Why a receipt was turned down, for the payment's signed-in owner (order digest §5.7 step 5,
// §3.2.10): `GET payment/history/<uuid>/` is the only place it can be read
// (`card_transfer_receipt.rejection_reason_code` and the sentence the shopper was sent). Read once,
// when the outcome is a rejection; never for a guest (the status alone says nothing more: the
// page says the reason went by SMS). Not the owner's after all (404), or no answer: `failed`, and
// the page says the same as to a guest; so does a receipt with neither a code nor a sentence. A
// session found gone ends it.

export type RejectionReason =
  | { state: 'idle' | 'loading' | 'failed' }
  | { state: 'read'; code: ReceiptRejectionCode | null; text: string }

export function useRejectionReason(uuid: string, enabled: boolean): RejectionReason {
  const sessionGone = useEffectEvent(useSessionExpired())
  const [reason, setReason] = useState<{ uuid: string; value: RejectionReason } | null>(null)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    readReceiptDetail(uuid, controller.signal).then(
      (detail) => {
        const receipt = detail.card_transfer_receipt
        const code = receipt?.rejection_reason_code ?? null
        const text = receipt?.rejection_reason.trim() ?? ''
        // Nothing to say (no receipt, or neither a code nor a sentence): the SMS sentence.
        setReason({
          uuid,
          value: code || text ? { state: 'read', code, text } : { state: 'failed' },
        })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        if (isSessionExpiredError(error)) sessionGone()
        setReason({ uuid, value: { state: 'failed' } })
      },
    )
    return () => controller.abort()
  }, [uuid, enabled])

  if (!enabled) return { state: 'idle' }
  return reason?.uuid === uuid ? reason.value : { state: 'loading' }
}
