'use client'

import { useMemo, useRef, useState } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { newIdempotencyKey } from '@/features/checkout/idempotency'
import { loadPage } from '@/lib/navigation/hard-navigation'
import { useReleaseIfStillHere } from '@/lib/navigation/leaving'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { IntentError, startPayment, type PaymentDoor } from '../api'
import { intentMessage } from '../intent-messages'
import { LOOKUP_FAILED, LookupError, lookupDoor } from '../order-lookup'
import { savePending } from '../pending-payments'
import { ATTEMPT_OPEN_OTHER } from './transfer-copy'
import { storedLinkToken, transferDoor, type TransferOrder } from './transfer-door'

// «پرداخت دوباره» after a rejected receipt or a closed attempt (order digest §5.7 step 5, §3.2.4):
// a NEW card-transfer intent for the order, through the door this device knows (transfer-door.ts),
// with a new Idempotency-Key per press and one intent per press; then the new attempt's own page,
// by a full page load (its URL holds the new uuid), its pending payment saved first. An attempt
// still open on the order: its page when it is a card transfer; otherwise the order's payment page
// says what to do. No door known: nothing is offered (the page says where to pay instead).

export interface CardAgainState {
  /** A door is known (or can be looked up). */
  available: boolean
  busy: boolean
  error: string | null
  /** The order's link token when this device holds it (another route: the link's page). */
  linkToken: string | null
  pay: () => void
}

const doorFields = (door: PaymentDoor) =>
  door.kind === 'uuid' ? { orderUuid: door.orderUuid } : { linkToken: door.token }

export function useCardAgain(order: TransferOrder): CardAgainState {
  const { uuid, orderCode, owner } = order
  const expire = useSessionExpired()
  // Our own page loads: the default wait (`LEAVING_MS`). Not imported by name: that export of the
  // shared module grew a lazy chunk of /checkout/ (measured: +4 B gzip there).
  const holdWhileLeaving = useReleaseIfStillHere()
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const door = useMemo(() => transferDoor({ uuid, orderCode, owner }), [uuid, orderCode, owner])
  const linkToken = useMemo(
    () => storedLinkToken({ uuid, orderCode, owner }),
    [uuid, orderCode, owner],
  )

  async function run() {
    if (inFlight.current || door.kind === 'none' || !orderCode) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    announce('در حال آماده\u{200C}سازی پرداخت…')
    let leaving = false
    try {
      const target = door.kind === 'known' ? door.door : await lookupDoor(door.orderCode)
      let next: { uuid: string; amount: number }
      try {
        const intent = await startPayment({
          door: target,
          route: 'card_transfer',
          key: newIdempotencyKey(),
        })
        if (!intent.payment) throw new IntentError('other', null)
        next = intent.payment
      } catch (refused) {
        // A card transfer already open on the order: its page (never a second attempt).
        const open = refused instanceof IntentError ? refused.openAttempt : null
        if (open?.method !== 'card_transfer' || open.status !== 'pending') throw refused
        next = { uuid: open.payment, amount: open.amount }
      }
      savePending(next.uuid, {
        kind: 'order',
        orderCode,
        ...doorFields(target),
        route: 'card_transfer',
        amount: next.amount,
        startedAt: Date.now(),
      })
      loadPage(`/payment/card-transfer/${next.uuid}/`)
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
      setError(refusal.problem === 'attempt_open' ? ATTEMPT_OPEN_OTHER : intentMessage(refusal))
    } finally {
      if (!leaving) {
        inFlight.current = false
        setBusy(false)
      }
    }
  }

  return { available: door.kind !== 'none', busy, error, linkToken, pay: () => void run() }
}
