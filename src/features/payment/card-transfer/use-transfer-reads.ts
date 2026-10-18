'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '@/lib/api/errors'
import type {
  CardTransferInstruction,
  CardTransferReceipt,
  PaymentStatusInfo,
} from '@/lib/api/types/payment'
import { removePending } from '../pending-payments'
import { readPaymentStatus } from '../status-api'
import {
  readInstruction,
  sessionFirst,
  submitReceipt,
  type ReceiptBody,
  type TransferStatus,
} from './card-transfer-api'

// What the card-transfer page shows first (order digest §5.7), from two reads made at once in
// the browser: the cards (`GET payment/<uuid>/card-transfer/`, ALWAYS read here: an intent's
// replay answers no cards, §0 #11) and the payment's status, once (no polling while the form is
// filled in: the shared 240/h `payment_status` budget; the outcome polls, receipt-outcome.tsx).
// - status pending → the form;
// - a receipt under review, approved or rejected → the outcome;
// - any other end (cancelled, expired, failed otherwise), or a payment that is not a card
//   transfer (400 `payment_target_invalid`) → closed (a new attempt);
// - 404 / 403 / a wait / no answer → the calm page (a read again from it).
// A status that could not be read with cards that could → the form (an upload finds the truth).
// Both reads go with the session first; refused another account's payment (403
// `payment_forbidden`, §11 #7), each is made again without it, and from then on every call of the
// page is (the cards read again, the receipt: `upload`), as `usePaymentStatus` does for its reads.

export type TransferRefusalKind = 'not_found' | 'forbidden' | 'throttled' | 'unavailable'

export interface TransferRefusal {
  kind: TransferRefusalKind
  /** A 429's wait in seconds. */
  retryAfter: number | null
}

/** Why the outcome shows: the receipt just sent, a second one refused, a cancel refused. */
export type OutcomeNotice = 'sent' | 'already' | 'under_review'

export type TransferPhase =
  | { kind: 'loading' }
  | { kind: 'refused'; refusal: TransferRefusal }
  | { kind: 'form' }
  | { kind: 'outcome'; notice: OutcomeNotice | null }
  | { kind: 'closed' }
  /** Cancelled here, with no route choice this device can go back to. */
  | { kind: 'cancelled' }

export interface TransferReads {
  phase: TransferPhase
  instruction: CardTransferInstruction | null
  status: TransferStatus | null
  /** Answered only without the session: another account's payment (§11 #7). */
  foreign: boolean
  go: (phase: TransferPhase) => void
  /** Both reads again (from the calm page). */
  retry: () => void
  /** The cards again (a card refused at upload); true when they were read. */
  reloadCards: () => Promise<boolean>
  /** Sends the receipt (without the session when the payment is someone else's). */
  upload: (body: ReceiptBody) => Promise<CardTransferReceipt>
}

export function refusalOf(error: unknown): TransferRefusal {
  if (error instanceof ApiError && error.status === 404 && error.code !== 'non_json_response')
    return { kind: 'not_found', retryAfter: null }
  if (error instanceof ApiError && error.status === 403)
    return { kind: 'forbidden', retryAfter: null }
  if (error instanceof ApiError && error.status === 429)
    return { kind: 'throttled', retryAfter: error.retryAfter }
  return { kind: 'unavailable', retryAfter: null }
}

/** Where a payment in this state belongs. */
export function phaseOf(info: PaymentStatusInfo): TransferPhase {
  if (info.status === 'pending') return { kind: 'form' }
  if (info.status === 'awaiting_review' || info.status === 'settled')
    return { kind: 'outcome', notice: null }
  if (info.status === 'failed' && info.failure_reason === 'payment_receipt_rejected')
    return { kind: 'outcome', notice: null }
  return { kind: 'closed' }
}

const isTargetInvalid = (error: unknown) =>
  error instanceof ApiError && error.code === 'payment_target_invalid'

export function useTransferReads(uuid: string): TransferReads {
  const [phase, setPhase] = useState<TransferPhase>({ kind: 'loading' })
  const [instruction, setInstruction] = useState<CardTransferInstruction | null>(null)
  const [status, setStatus] = useState<TransferStatus | null>(null)
  const [round, setRound] = useState(0)
  // Refused with the session, answered without it: every later call goes without it at once.
  const anonymous = useRef(false)
  const [foreign, setForeign] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const answered = <T>(call: (anon: boolean) => Promise<T>) =>
      sessionFirst(call, anonymous.current).then((answer) => {
        if (answer.foreign) {
          anonymous.current = true
          setForeign(true)
        }
        return answer
      })
    void Promise.allSettled([
      answered((anon) => readPaymentStatus(uuid, { anonymous: anon, signal })),
      answered((anon) => readInstruction(uuid, { anonymous: anon, signal })),
    ]).then(([read, cards]) => {
      if (signal.aborted) return
      if (read.status === 'fulfilled') {
        setStatus({ info: read.value.value, foreign: read.value.foreign })
      }
      if (cards.status === 'rejected') {
        if (isTargetInvalid(cards.reason)) return setPhase({ kind: 'closed' })
        const refusal = refusalOf(cards.reason)
        // No such payment: a pending entry for it is stale (digest §8.3 `payment_not_found`).
        if (refusal.kind === 'not_found') removePending(uuid)
        return setPhase({ kind: 'refused', refusal })
      }
      setInstruction(cards.value.value)
      if (read.status === 'fulfilled') return setPhase(phaseOf(read.value.value))
      const refusal = refusalOf(read.reason)
      // Not found or refused even without the session: the calm page; else the form.
      setPhase(
        refusal.kind === 'not_found' || refusal.kind === 'forbidden'
          ? { kind: 'refused', refusal }
          : { kind: 'form' },
      )
    })
    return () => controller.abort()
  }, [uuid, round])

  const retry = useCallback(() => {
    setPhase({ kind: 'loading' })
    setRound((count) => count + 1)
  }, [])

  /** `call` with the session unless the payment is known to be someone else's (then without). */
  const answered = useCallback(async <T>(call: (anon: boolean) => Promise<T>): Promise<T> => {
    const answer = await sessionFirst(call, anonymous.current)
    if (answer.foreign) {
      anonymous.current = true
      setForeign(true)
    }
    return answer.value
  }, [])

  const reloadCards = useCallback(async () => {
    try {
      setInstruction(await answered((anon) => readInstruction(uuid, { anonymous: anon })))
      return true
    } catch {
      return false
    }
  }, [uuid, answered])

  const upload = useCallback(
    (body: ReceiptBody) => answered((anon) => submitReceipt(uuid, body, { anonymous: anon })),
    [uuid, answered],
  )

  return { phase, instruction, status, foreign, go: setPhase, retry, reloadCards, upload }
}
