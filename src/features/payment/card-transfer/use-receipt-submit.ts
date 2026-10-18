'use client'

import { useRef, useState } from 'react'
import { useSubmitWait, type SubmitLock } from '@/components/form/code-timers'
import { announce } from '@/components/ui/live-announcer'
import type { CardTransferReceipt } from '@/lib/api/types/payment'
import { NO_WAIT, restartWait, type Wait } from '@/lib/forms/waits'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import type { ReceiptBody } from './card-transfer-api'
import { receiptRefusal } from './receipt-errors'
import { THROTTLED_RECEIPT, UPLOADING } from './transfer-copy'
import {
  normalizeLastDigits,
  validateReceipt,
  type ImageProbe,
  type ReceiptErrors,
  type ReceiptField,
} from './validate-receipt'

// Sending the receipt (order digest §3.2.8): checked first (validate-receipt.ts, with the
// picture's decoded size), then one multipart POST per press however fast the presses come (a
// ref guard held from the press to the answer, the picture's measuring included). Every refusal
// does what receipt-errors.ts says: under the fields (the first in error takes the focus: the
// form's `attempt` grows), the cards read again, the outcome, a new attempt, the calm page, a
// 429's wait (the button held, the time left shown), or «دوباره تلاش کنید» with every field and
// the chosen file kept (`503 upload_retry`, no answer).

/** The chosen picture: the file, its preview URL and its measuring under way. */
export interface ChosenImage {
  file: File
  url: string
  probe: Promise<ImageProbe>
}

export interface ReceiptDraft {
  image: ChosenImage | null
  payerName: string
  lastDigits: string
  paidAt: string
  destinationCard: number | null
  bankReference: string
}

export interface ReceiptHandlers {
  /** 201: the receipt is in the review queue. */
  onSent: (receipt: CardTransferReceipt) => void
  /** 409: a receipt was sent before. */
  onSubmitted: () => void
  /** 400 `payment_target_invalid`: the attempt is no longer open. */
  onClosed: () => void
  onRefused: (reason: 'forbidden' | 'not_found') => void
  /** The cards read again (a chosen card the API no longer takes). */
  reloadCards: () => Promise<unknown>
  /** Sends the receipt (the page knows whether the payment is someone else's: §11 #7). */
  upload: (body: ReceiptBody) => Promise<CardTransferReceipt>
}

export interface ReceiptSubmit {
  errors: ReceiptErrors
  /** About the whole form (a lost answer, a wait): shown above it. */
  alert: string | null
  busy: boolean
  /** Grows on every refused press: the first field in error takes the focus. */
  attempt: number
  lock: SubmitLock
  submit: (draft: ReceiptDraft) => Promise<void>
  /** A field was edited (or its picture measured): its error goes, or becomes `message`. */
  setFieldError: (field: ReceiptField, message?: string) => void
}

export function useReceiptSubmit(handlers: ReceiptHandlers): ReceiptSubmit {
  const expire = useSessionExpired()
  const [errors, setErrors] = useState<ReceiptErrors>({})
  const [alert, setAlert] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [wait, setWait] = useState<Wait>(NO_WAIT)
  const lock = useSubmitWait(wait)
  const sending = useRef(false)

  const refuse = (found: ReceiptErrors) => {
    setErrors(found)
    setAttempt((count) => count + 1)
  }

  async function submit(draft: ReceiptDraft) {
    if (sending.current || lock.locked) return
    sending.current = true
    setAlert(null)
    try {
      const probe = draft.image ? await draft.image.probe : null
      const image =
        draft.image && probe
          ? { type: draft.image.file.type, size: draft.image.file.size, probe }
          : null
      const found = validateReceipt({ ...draft, image }, new Date())
      if (Object.keys(found).length > 0) return refuse(found)
      setErrors({})
      setBusy(true)
      announce(UPLOADING)
      const receipt = await handlers.upload({
        image: draft.image!.file,
        payerName: draft.payerName,
        lastDigits: normalizeLastDigits(draft.lastDigits),
        paidAt: draft.paidAt,
        destinationCard: draft.destinationCard!,
        bankReference: draft.bankReference,
      })
      handlers.onSent(receipt)
    } catch (error) {
      const refusal = receiptRefusal(error)
      if (refusal.kind === 'fields') {
        if (refusal.reloadCards) await handlers.reloadCards()
        refuse(refusal.errors)
      } else if (refusal.kind === 'submitted') handlers.onSubmitted()
      else if (refusal.kind === 'closed') handlers.onClosed()
      else if (refusal.kind === 'refused') handlers.onRefused(refusal.reason)
      else if (refusal.kind === 'throttled') {
        setWait((previous) => restartWait(previous, Date.now(), refusal.retryAfter ?? 60))
        setAlert(THROTTLED_RECEIPT)
      } else {
        if (refusal.kind === 'retry' && refusal.session) expire()
        setAlert(refusal.message)
      }
    } finally {
      sending.current = false
      setBusy(false)
    }
  }

  const setFieldError = (field: ReceiptField, message?: string) =>
    setErrors((current) => {
      if (current[field] === message) return current
      const next = { ...current }
      if (message) next[field] = message
      else delete next[field]
      return next
    })

  return { errors, alert, busy, attempt, lock, submit, setFieldError }
}
