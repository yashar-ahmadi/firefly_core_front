'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { THROTTLED_MESSAGE } from '@/features/account/lists/list-error'
import { CART_KEY } from '@/features/cart/cart-cache'
import { useMarkFeatureDisabled } from '@/features/settings/feature-context'
import type { RouteChoiceState } from '@/features/payment/use-route-choice'
import { NETWORK_ERROR_DETAIL } from '@/lib/api/errors'
import type { CartAdjustment } from '@/lib/api/types/cart'
import type { OrderItemUnavailable } from '@/lib/api/types/order'
import { toPersianDigits } from '@/lib/format'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { ORDERS_KEY, SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { receiverBody } from './guest-receiver'
import { clearPlacementKey, placementKey } from './idempotency'
import type { PlacementProblem } from './place-order'
import type { PlacedContext } from './placed-order'
import { thanksPath } from './thanks-path'
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
  /**
   * Something to try again here (the cart read again after a total change): resolves true once
   * it worked, false when it failed again (said politely beside the button).
   */
  retry?: { label: string; run: () => Promise<boolean>; failedAgain: string }
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
  /**
   * After `order_total_changed`, while the review stays open: the total confirmed before (the
   * dialog shows the cart as it is now). Gone once the review closes.
   */
  totalChanged: { previous: number } | null
  closeTotalChanged: () => void
  /** Places with the cart's `total` (or the new one the dialog confirmed). */
  place: (expectedTotal?: number) => Promise<void>
}

/** A total change that took the shopper back to an earlier step: said until the review again. */
const TOTAL_MOVED =
  'مبلغ سفارش تغییر کرد. مرحله\u{0654} باز را کامل کنید و سفارش را با مبلغ جدید دوباره بازبینی کنید.'

/** Problems whose fix is elsewhere on the page (the notice shows at its top). */
export const MOVES_STEP: ReadonlySet<PlacementProblem> = new Set([
  'shipping',
  'destination',
  'receiver',
  'guest_closed',
])

/** Said at the top while the shopper is away from the review (the review says it too). */
export const saidAtTop = (problem: PlacementProblem) =>
  MOVES_STEP.has(problem) || problem === 'total_changed'

export function usePlaceOrder(
  checkout: Checkout,
  payment: RouteChoiceState,
  onPlaced: (ctx: PlacedContext) => void,
): Placement {
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
  // The new cart took the shopper back to a step (its shipping cleared, the route over its
  // ceiling): the question is over. The next confirmation is the review's own, with its checks.
  if (totalChanged && checkout.step !== 'review') {
    setTotalChanged(null)
    setNotice({ message: TOTAL_MOVED, problem: 'total_changed' })
  }

  // The cart read again; null when that read failed (never the old cart in its place).
  const reread = () =>
    checkout.cartQuery.refetch().then(({ data, isError }) => (isError ? null : (data ?? null)))

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
      if (outcome.ok === false) {
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
      const code = toPersianDigits(outcome.ctx.orderCode)
      if (outcome.ok === 'earlier') {
        // A key whose 2xx was lost met its order again, for another cart: that order is said,
        // never taken for this purchase (the next press places this cart, a new key).
        setNotice({
          message: `سفارش ${code} پیش\u{200C}تر با همین خرید ثبت شده بود؛ سبد کنونی هنوز ثبت نشده است.`,
          problem: 'earlier',
          link: { href: thanksPath(outcome.ctx.orderCode), label: 'مشاهده\u{0654} آن سفارش' },
        })
        return
      }
      // The cart is spent: read again (empty now), but not its shipping options, which the API
      // can no longer price (404 `cart_not_found`); the review asking for them goes next.
      void client.invalidateQueries({ queryKey: CART_KEY, exact: true })
      if (!guest) {
        // The counts and «سفارش‌های من» hold the new order now (marked stale: no request here).
        void client.invalidateQueries({ queryKey: SUMMARY_KEY })
        void client.invalidateQueries({ queryKey: ORDERS_KEY })
      }
      announce(`سفارش ${code} ثبت شد.`)
      onPlaced(outcome.ctx)
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
    place,
  }
}
