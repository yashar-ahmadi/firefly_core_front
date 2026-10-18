'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { THROTTLED_MESSAGE } from '@/features/account/lists/list-error'
import { CART_KEY } from '@/features/cart/cart-cache'
import { useMarkFeatureDisabled } from '@/features/settings/feature-context'
import type { RouteChoiceState } from '@/features/payment/use-route-choice'
import { NETWORK_ERROR_DETAIL } from '@/lib/api/errors'
import type { Cart, CartAdjustment } from '@/lib/api/types/cart'
import type { OrderItemUnavailable } from '@/lib/api/types/order'
import { toPersianDigits } from '@/lib/format'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { receiverBody } from './guest-receiver'
import { clearPlacementKey, placementKey } from './idempotency'
import type { PlacementProblem } from './place-order'
import type { PlacedContext } from './placed-order'
import type { Checkout } from './use-checkout'
import { SHIPPING_OPTIONS_KEY } from './use-shipping-options'

// «ثبت سفارش و پرداخت» (order digest §5.1–5.2, §8.1): one placement per press however fast the
// presses (an in-flight guard, and the purchase's one placement key), the cart's `total` on
// screen as `expected_total` (the call and its aftermath load on the press: ./place-flow), then
// what the answer means. A 2xx ends the purchase (the guest's
// order saved, the key and the draft forgotten, the cart re-read: the badge empties) and hands
// the order to the payment (placed-order.tsx). A refusal says what changed and takes the
// shopper where it can be put right, never losing the receiver or the note: the total changed
// opens a dialog with the new amounts and asks again (the same key: nothing was created).

export interface PlacementNotice {
  message: string
  problem: PlacementProblem
  /** A way out: the cart, the orders waiting for payment, login. */
  link?: { href: string; label: string }
  items?: OrderItemUnavailable[]
  adjustments?: CartAdjustment[]
}

export interface Placement {
  note: string
  setNote: (note: string) => void
  noteError: string | null
  placing: boolean
  notice: PlacementNotice | null
  /** A 429's wait (`throttleWait`). */
  throttle: { error: unknown; at: number } | null
  /** The cart read again after `order_total_changed`, and the total confirmed before. */
  totalChanged: { cart: Cart; previous: number } | null
  closeTotalChanged: () => void
  placed: PlacedContext | null
  /** Places with the cart's `total` (or the new one the dialog confirmed). */
  place: (expectedTotal?: number) => Promise<void>
}

/** Problems whose fix is elsewhere on the page (the notice shows at its top). */
export const MOVES_STEP: ReadonlySet<PlacementProblem> = new Set([
  'shipping',
  'destination',
  'receiver',
  'guest_closed',
])

export function usePlaceOrder(checkout: Checkout, payment: RouteChoiceState): Placement {
  const client = useQueryClient()
  const expire = useSessionExpired()
  const markFeatureDisabled = useMarkFeatureDisabled()
  const inFlight = useRef(false)
  const [note, setNoteValue] = useState('')
  const [noteError, setNoteError] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)
  const [notice, setNotice] = useState<PlacementNotice | null>(null)
  const [throttle, setThrottle] = useState<Placement['throttle']>(null)
  const [totalChanged, setTotalChanged] = useState<Placement['totalChanged']>(null)
  const [placed, setPlaced] = useState<PlacedContext | null>(null)

  const reread = () => checkout.cartQuery.refetch().then(({ data }) => data ?? null)

  const place = async (expectedTotal?: number) => {
    const cart = checkout.cart
    const route = payment.chosen?.route
    if (inFlight.current || !cart || !route) return
    inFlight.current = true
    setPlacing(true)
    setNotice(null)
    setNoteError(null)
    setTotalChanged(null)
    announce('در حال ثبت سفارش…')
    const guest = !checkout.signedIn
    const receiver = guest ? receiverBody(checkout.receiver) : null
    const sent = expectedTotal ?? cart.total
    try {
      const { handleRefusal, submitPlacement } = await import('./place-flow')
      const outcome = await submitPlacement(
        {
          isGuest: guest,
          receiver: receiver?.receiver,
          customerMobile: receiver?.customerMobile,
          note,
          expectedTotal: sent,
          key: placementKey(),
        },
        { route, gatewayCode: payment.gatewayCode ?? null },
      )
      if (!outcome.ok) {
        await handleRefusal(outcome.error, sent, {
          reread,
          invalidateShipping: () =>
            void client.invalidateQueries({ queryKey: SHIPPING_OPTIONS_KEY }),
          edit: checkout.edit,
          reopenReceiver: checkout.reopenReceiver,
          markGuestClosed: (detail) => markFeatureDisabled('guest_checkout', detail),
          expire,
          signedIn: checkout.signedIn,
          clearKey: clearPlacementKey,
          throttledMessage: THROTTLED_MESSAGE,
          setNotice,
          setNoteError,
          setThrottle,
          setTotalChanged,
        })
        return
      }
      void client.invalidateQueries({ queryKey: CART_KEY })
      if (!guest) void client.invalidateQueries({ queryKey: SUMMARY_KEY })
      announce(`سفارش ${toPersianDigits(outcome.ctx.orderCode)} ثبت شد.`)
      setPlaced(outcome.ctx)
    } catch {
      // The press's code could not load (a deploy, the connection): nothing was sent.
      setNotice({ message: NETWORK_ERROR_DETAIL, problem: 'other' })
    } finally {
      inFlight.current = false
      setPlacing(false)
    }
  }

  return {
    note,
    setNote: (value) => {
      setNoteValue(value)
      setNoteError(null)
    },
    noteError,
    placing,
    notice,
    throttle,
    totalChanged,
    closeTotalChanged: () => setTotalChanged(null),
    placed,
    place,
  }
}
