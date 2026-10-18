'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { newIdempotencyKey } from '@/features/checkout/idempotency'
import { findGuestOrder } from '@/features/orders/guest-orders'
import type { PaymentRoute } from '@/lib/api/types/payment'
import { BANK_LEAVING_MS, useReleaseIfStillHere } from '@/lib/navigation/leaving'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { SUMMARY_KEY, WALLET_KEY } from '@/lib/session/viewer-queries'
import { IntentError, startPayment } from './api'
import { intentMessage } from './intent-messages'
import { LOOKUP_FAILED, LookupError, lookupDoor } from './order-lookup'
import { payAgainDoor, payAgainRoute } from './pay-again'
import { savePending, type PendingPayment } from './pending-payments'

// «پرداخت دوباره» on the result page (order digest §5.10, §5.4): a NEW attempt for the order
// through the door this device knows (pay-again.ts), with a new Idempotency-Key per press (the
// API's own "still starting" retries keep it, `startPayment`; a replayed key whose handoff expired
// gets a new one), one intent per press. The pending payment is saved before the bank, as on the
// checkout. A refusal is said on the page (an attempt still open: the order's page resumes it);
// a session found gone (by the intent or the order's lookup) ends it here instead. Only the
// order's owner gets the owner's doors: a signed-in payer of someone else's order (`owner`
// false) pays through the order's link when this device knows it, never the account's lookup.

const BANK_LOAD_FAILED = 'انتقال به درگاه انجام نشد؛ دوباره تلاش کنید.'

export interface PayAgainOptions {
  orderCode: string | null
  pending: PendingPayment | null
  hasSession: boolean
  /** Signed in as the order's owner (its payment was read with the session). */
  owner: boolean
}

export interface PayAgainState {
  /** A door is known (or can be looked up): the press is offered. */
  available: boolean
  busy: boolean
  /** What stopped it, or null. */
  error: string | null
  /** The order's link token when this device knows it (another route: the link's page). */
  linkToken: string | null
  pay: () => void
}

export function usePayAgain({
  orderCode,
  pending,
  hasSession,
  owner,
}: PayAgainOptions): PayAgainState {
  const client = useQueryClient()
  const expire = useSessionExpired()
  const holdWhileLeaving = useReleaseIfStillHere(BANK_LEAVING_MS)
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const door = useMemo(() => {
    const guest = !owner && orderCode ? findGuestOrder(orderCode) : null
    return payAgainDoor({ pending, orderCode, owner, guestToken: guest?.linkToken ?? null })
  }, [pending, orderCode, owner])
  // The wallet is the payer's own: it needs the session, not the order's ownership.
  const route: PaymentRoute = payAgainRoute(pending, hasSession)

  async function run() {
    if (inFlight.current || door.kind === 'none' || !orderCode) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    announce('در حال آماده\u{200C}سازی پرداخت…')
    let leaving = false
    try {
      const target = door.kind === 'known' ? door.door : await lookupDoor(door.orderCode)
      const send = () => startPayment({ door: target, route, key: newIdempotencyKey() })
      let intent
      try {
        intent = await send()
      } catch (refused) {
        // A replayed key whose handoff expired: a new key, a new intent (digest §5.4).
        if (!(refused instanceof IntentError && refused.problem === 'token_expired')) throw refused
        intent = await send()
      }
      if (route === 'wallet_and_gateway') {
        void client.invalidateQueries({ queryKey: WALLET_KEY })
        void client.invalidateQueries({ queryKey: SUMMARY_KEY })
      }
      if (!intent.payment || !intent.handoff) throw new IntentError('other', null)
      // Saved before the browser leaves: this page finds the order from it on the way back.
      savePending(intent.payment.uuid, {
        kind: 'order',
        orderCode,
        ...(target.kind === 'uuid' ? { orderUuid: target.orderUuid } : { linkToken: target.token }),
        route,
        amount: intent.payment.amount,
        startedAt: Date.now(),
      })
      const handoff = intent.handoff
      const goToBank = await import('./go-to-bank')
        .then((module) => module.goToBank)
        .catch(() => null)
      if (!goToBank) return setError(BANK_LOAD_FAILED)
      goToBank(handoff)
      leaving = true
      // Busy while the browser leaves; given back if it did not (a stuck load, a cache restore).
      holdWhileLeaving(() => {
        inFlight.current = false
        setBusy(false)
      })
    } catch (failure) {
      if (failure instanceof LookupError) return setError(LOOKUP_FAILED)
      const refusal = failure instanceof IntentError ? failure : new IntentError('other', failure)
      if (refusal.problem === 'session') return expire()
      setError(intentMessage(refusal))
    } finally {
      if (!leaving) {
        inFlight.current = false
        setBusy(false)
      }
    }
  }

  const linkToken = door.kind === 'known' && door.door.kind === 'link' ? door.door.token : null
  return { available: door.kind !== 'none', busy, error, linkToken, pay: () => void run() }
}
