'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { useMarkFeatureDisabled } from '@/features/settings/feature-context'
import { IntentError, startPayment, type PaymentIntentResult } from '@/features/payment/api'
import { savePending } from '@/features/payment/pending-payments'
import { BANK_ROUTES } from '@/features/payment/routes'
import type { PaymentCatalogState } from '@/features/payment/use-payment-catalog'
import type { PaymentRoute, RedirectPayload } from '@/lib/api/types/payment'
import { loadPage } from '@/lib/navigation/hard-navigation'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { SUMMARY_KEY, WALLET_KEY } from '@/lib/session/viewer-queries'
import { newIdempotencyKey } from './idempotency'
import { doorOf, updatePlaced, type PlacedContext } from './placed-order'
import { thanksPath } from './thanks-path'

// Paying the order just placed (order digest §5.4–5.8, §8.3), through its door (the owner's,
// or the link for a guest). Every press is a new Idempotency-Key (one per click; the API's own
// "still starting" retries of that click keep it: `startPayment`). Then by route: confirmed on
// delivery or paid by the wallet → the thanks page (what the server said is recorded); card to
// card → its page; a bank → the pending payment saved FIRST, then the browser goes to the bank
// (the redirect's code loads only now). A refusal never loses the order: the page stays with
// the order, says what happened and offers the routes again (or, for a pay-on-delivery
// confirmation, the thanks page offers to confirm again).

/**
 * - `starting`: the order's own route is about to run (the page says it is preparing);
 * - `choosing`: the shopper chooses (the route chosen for the cart does not fit the order, or a
 *   bank handoff expired): the routes, nothing running;
 * - `paying`, `redirecting` (a bank took over), `failed` (its refusal on screen, the routes).
 */
export interface PayState {
  phase: 'starting' | 'choosing' | 'paying' | 'redirecting' | 'failed'
  error: IntentError | null
  handoff: RedirectPayload | null
  /** The redirect's code could not load (a deploy, the connection). */
  bankLoadFailed: boolean
}

const IDLE: PayState = { phase: 'choosing', error: null, handoff: null, bankLoadFailed: false }

/** The redirect, loaded on the click that needs it. Rejects when its chunk cannot load. */
const loadGoToBank = () => import('@/features/payment/go-to-bank').then((module) => module.goToBank)

export function usePayOrder(
  ctx: PlacedContext,
  catalog: PaymentCatalogState,
  { suggest }: { suggest: (route: PaymentRoute) => void },
) {
  const router = useRouter()
  const client = useQueryClient()
  const expire = useSessionExpired()
  const markFeatureDisabled = useMarkFeatureDisabled()
  const inFlight = useRef(false)
  const [state, setState] = useState<PayState>({ ...IDLE, phase: 'starting' })

  const toThanks = () => router.push(thanksPath(ctx.orderCode))
  const walletMoved = () => {
    void client.invalidateQueries({ queryKey: WALLET_KEY })
    void client.invalidateQueries({ queryKey: SUMMARY_KEY })
  }

  const redirect = (handoff: RedirectPayload) => {
    setState({ ...IDLE, phase: 'redirecting', handoff })
    loadGoToBank()
      .then((goToBank) => goToBank(handoff))
      .catch(() => setState({ ...IDLE, phase: 'redirecting', handoff, bankLoadFailed: true }))
  }

  function succeeded(intent: PaymentIntentResult, route: PaymentRoute) {
    const uuid = intent.payment?.uuid
    const pending = () =>
      uuid &&
      savePending(uuid, {
        kind: 'order',
        orderCode: ctx.orderCode,
        ...(ctx.guest ? { linkToken: ctx.linkToken ?? undefined } : { orderUuid: ctx.orderUuid }),
        route,
        amount: intent.payment!.amount,
        startedAt: Date.now(),
      })
    if (route === 'pay_on_delivery') {
      updatePlaced(ctx.orderCode, { outcome: 'confirmed', free: intent.payment === null })
      return toThanks()
    }
    if (route === 'wallet') {
      walletMoved()
      if (intent.payment?.status === 'settled') updatePlaced(ctx.orderCode, { outcome: 'paid' })
      return toThanks()
    }
    if (route === 'card_transfer' && uuid) {
      // Its uuid is a guest's only handle on the receipt's outcome (digest §5.7). The page's URL
      // holds it: a full page load, never the client router (credential-routes.ts).
      pending()
      return loadPage(`/payment/card-transfer/${uuid}/`)
    }
    if (route === 'wallet_and_gateway') walletMoved()
    if (!uuid || !intent.handoff) throw new IntentError('other', null)
    // Saved before the browser leaves: the result page finds the order from it.
    pending()
    redirect(intent.handoff)
  }

  function failed(error: IntentError, route: PaymentRoute, gatewayCode: string | undefined) {
    switch (error.problem) {
      case 'session':
        return expire()
      case 'gateway_broken':
        catalog.withdraw(BANK_ROUTES)
        break
      case 'gateway_refresh': {
        // The gateway tried (no code: the shop's default) is left out for this page, and the
        // list read again; with none left, the bank routes close with their reason.
        const tried =
          gatewayCode ??
          (catalog.gateways.find((gateway) => gateway.is_default) ?? catalog.gateways[0])?.code
        if (tried) catalog.withdrawGateway(tried)
        void catalog.refreshGateways()
        break
      }
      case 'feature_off':
        if (error.feature) markFeatureDisabled(error.feature, error.detail)
        void catalog.refreshMethods()
        break
      case 'method_refresh':
        void catalog.refreshMethods()
        break
      case 'card_unavailable':
        catalog.withdraw(['card_transfer'])
        break
      case 'wallet_short':
      case 'wallet_frozen':
        walletMoved()
        break
      case 'use_wallet':
        suggest('wallet')
        break
      case 'settled':
        updatePlaced(ctx.orderCode, { outcome: 'settled', failure: error.detail })
        return toThanks()
    }
    if (route === 'pay_on_delivery') {
      // The order waits for its confirmation: the thanks page offers it again.
      updatePlaced(ctx.orderCode, { outcome: 'unconfirmed', failure: error.detail })
      return toThanks()
    }
    setState({ ...IDLE, phase: 'failed', error })
  }

  const pay = async (route: PaymentRoute, gatewayCode?: string) => {
    const door = doorOf(ctx)
    if (inFlight.current || !door) return
    inFlight.current = true
    setState({ ...IDLE, phase: 'paying' })
    announce(
      route === 'pay_on_delivery' ? 'در حال تأیید سفارش…' : 'در حال آماده\u{200C}سازی پرداخت…',
    )
    const send = () => startPayment({ door, route, gatewayCode, key: newIdempotencyKey() })
    try {
      let intent: PaymentIntentResult
      try {
        intent = await send()
      } catch (error) {
        // A replayed key whose handoff expired: a new key, a new intent (digest §5.4).
        if (!(error instanceof IntentError && error.problem === 'token_expired')) throw error
        intent = await send()
      }
      succeeded(intent, route)
    } catch (error) {
      failed(
        error instanceof IntentError ? error : new IntentError('other', error),
        route,
        gatewayCode,
      )
    } finally {
      inFlight.current = false
    }
  }

  return {
    state,
    pay,
    /** The manual «انتقال به درگاه» (the automatic one did not happen, or was too slow). */
    goToBankAgain: () => state.handoff && redirect(state.handoff),
    /** The shopper chooses: after a handoff that expired, or a route that does not fit. */
    choose: () => setState(IDLE),
  }
}
