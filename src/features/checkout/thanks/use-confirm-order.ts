'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { IntentError, startPayment } from '@/features/payment/api'
import { intentMessage } from '@/features/payment/intent-messages'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { ORDERS_KEY, SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { newIdempotencyKey } from '../idempotency'
import { doorOf, updatePlaced, type PlacedContext } from '../placed-order'

// «تأیید سفارش» again on the thanks page (order digest §5.1 step 5, §5.8): a pay-on-delivery
// order whose confirmation failed after placement waits in `awaiting_payment` (and is cancelled
// after its deadline): the `pay_on_delivery` intent once more, a new key for this press. What
// the server answers is recorded on the placed order; `onDone` re-reads it. Confirmed (or
// settled meanwhile), a signed-in shopper's order has moved: «سفارش‌های من» and the account's
// counts are marked stale (no request while no such page is open), as the checkout's own payment
// does. A guest has no such lists.

export function useConfirmOrder(ctx: PlacedContext | null, onDone: () => void) {
  const expire = useSessionExpired()
  const client = useQueryClient()
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const moved = (guest: boolean) => {
    if (guest) return
    void client.invalidateQueries({ queryKey: ORDERS_KEY })
    void client.invalidateQueries({ queryKey: SUMMARY_KEY })
  }

  const confirm = async () => {
    const door = ctx && doorOf(ctx)
    if (!ctx || !door || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError(null)
    announce('در حال تأیید سفارش…')
    try {
      const intent = await startPayment({
        door,
        route: 'pay_on_delivery',
        key: newIdempotencyKey(),
      })
      updatePlaced(ctx.orderCode, {
        outcome: 'confirmed',
        free: intent.payment === null,
        failure: undefined,
      })
      moved(ctx.guest)
      announce('سفارش شما تأیید شد.')
    } catch (caught) {
      const failure = caught instanceof IntentError ? caught : new IntentError('other', caught)
      if (failure.problem === 'session') expire()
      else if (failure.problem === 'settled') {
        updatePlaced(ctx.orderCode, { outcome: 'settled', failure: failure.detail })
        moved(ctx.guest)
      } else setError(intentMessage(failure))
    } finally {
      inFlight.current = false
      setBusy(false)
      onDone()
    }
  }
  return { confirm, busy, error }
}
