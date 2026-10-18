'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { newIdempotencyKey } from '@/features/checkout/idempotency'
import { useMarkFeatureDisabled } from '@/features/settings/feature-context'
import type { OpenAttempt, PaymentRoute, RedirectPayload } from '@/lib/api/types/payment'
import { loadPage } from '@/lib/navigation/hard-navigation'
import { useReleaseIfStillHere } from '@/lib/navigation/leaving'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { SUMMARY_KEY, WALLET_KEY } from '@/lib/session/viewer-queries'
import { IntentError, startPayment, type PaymentDoor, type PaymentIntentResult } from './api'
import { intentMessage } from './intent-messages'
import { applyIntentRefusal } from './intent-refusal'
import { savePending } from './pending-payments'
import type { PaymentCatalogState } from './use-payment-catalog'

// Paying a placed order (order digest §3.2.3–3.2.4, §5.4–5.8) through its door: the link
// (`payment/link/<token>/intent/`; anyone with the link may pay, the wallet routes need the
// account), or the signed-in owner's uuid (`payment/order/<uuid>/intent/`: the account's order
// pages). One intent per press however fast the presses (an in-flight guard), a new
// Idempotency-Key per press (the API's own "still starting" retries keep it, `startPayment`; a
// replayed key whose handoff expired gets a new one). Then by route: confirmed at the door or
// paid by the wallet → said on the page; card to card → its page (a full page load: its URL
// holds the payment's uuid); a bank → the pending payment saved FIRST, then the bank. An attempt
// still open is no error: the page shows its resume UI. An order that cannot be paid any more
// is read again (the page then says why).

export type LinkPaid = { kind: 'confirmed'; free: boolean } | { kind: 'paid' }

export interface LinkPayState {
  phase: 'idle' | 'paying' | 'redirecting'
  error: IntentError | null
  handoff: RedirectPayload | null
  /** The redirect's code could not load (a deploy, the connection). */
  bankLoadFailed: boolean
}

const IDLE: LinkPayState = { phase: 'idle', error: null, handoff: null, bankLoadFailed: false }

const loadGoToBank = () => import('./go-to-bank').then((module) => module.goToBank)

export interface LinkPaymentOptions {
  /** The order's door: kept with a pending payment, for the result page to pay again. */
  door: PaymentDoor
  orderCode: string
  catalog: PaymentCatalogState
  suggest: (route: PaymentRoute) => void
  onPaid: (paid: LinkPaid) => void
  onAttemptOpen: (attempt: OpenAttempt) => void
  /** The order changed under the page (paid, expired, not payable): read it again. */
  onStale: () => void
}

export function useLinkPayment(options: LinkPaymentOptions) {
  const { door, orderCode, catalog, suggest, onPaid, onAttemptOpen, onStale } = options
  const client = useQueryClient()
  const expire = useSessionExpired()
  const markFeatureDisabled = useMarkFeatureDisabled()
  const inFlight = useRef(false)
  const [state, setState] = useState<LinkPayState>(IDLE)
  const holdWhileLeaving = useReleaseIfStillHere()

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

  /**
   * True when the page is leaving (card to card): the press stays taken until it has gone, or
   * until it is clear it has not (`holdWhileLeaving`).
   */
  function succeeded(intent: PaymentIntentResult, route: PaymentRoute): boolean {
    const payment = intent.payment
    const pending = () =>
      payment &&
      savePending(payment.uuid, {
        kind: 'order',
        orderCode,
        ...(door.kind === 'link' ? { linkToken: door.token } : { orderUuid: door.orderUuid }),
        route,
        amount: payment.amount,
        startedAt: Date.now(),
      })
    if (route === 'pay_on_delivery') {
      onPaid({ kind: 'confirmed', free: payment === null })
      return false
    }
    if (route === 'wallet') {
      walletMoved()
      if (payment?.status === 'settled') onPaid({ kind: 'paid' })
      else {
        // Not settled at once: the order says what it came to; the press is given back.
        setState(IDLE)
        onStale()
      }
      return false
    }
    if (route === 'card_transfer' && payment) {
      pending()
      loadPage(`/payment/card-transfer/${payment.uuid}/`)
      // Given back if the browser did not leave after all (an aborted load, a cache restore).
      holdWhileLeaving(() => {
        inFlight.current = false
        setState(IDLE)
      })
      return true
    }
    if (route === 'wallet_and_gateway') walletMoved()
    if (!payment || !intent.handoff) throw new IntentError('other', null)
    // Saved before the browser leaves: the result page finds the order from it.
    pending()
    redirect(intent.handoff)
    return false
  }

  function failed(error: IntentError, gatewayCode: string | undefined) {
    if (error.problem === 'session') return expire()
    applyIntentRefusal(error, gatewayCode, { catalog, markFeatureDisabled, walletMoved, suggest })
    if (error.problem === 'attempt_open' && error.openAttempt) {
      setState(IDLE)
      // Not an error: its resume UI takes the routes' place, said once.
      announce(intentMessage(error))
      return onAttemptOpen(error.openAttempt)
    }
    if (error.problem === 'settled' || error.problem === 'unpayable') {
      setState(IDLE)
      return onStale()
    }
    setState({ ...IDLE, error })
  }

  const pay = async (route: PaymentRoute, gatewayCode?: string) => {
    if (inFlight.current) return
    inFlight.current = true
    setState({ ...IDLE, phase: 'paying' })
    announce(
      route === 'pay_on_delivery' ? 'در حال تأیید سفارش…' : 'در حال آماده\u{200C}سازی پرداخت…',
    )
    const send = () => startPayment({ door, route, gatewayCode, key: newIdempotencyKey() })
    let leaving = false
    try {
      let intent: PaymentIntentResult
      try {
        intent = await send()
      } catch (error) {
        // A replayed key whose handoff expired: a new key, a new intent (digest §5.4).
        if (!(error instanceof IntentError && error.problem === 'token_expired')) throw error
        intent = await send()
      }
      leaving = succeeded(intent, route)
    } catch (error) {
      failed(error instanceof IntentError ? error : new IntentError('other', error), gatewayCode)
    } finally {
      // While the browser loads the next page, a press would only meet the attempt just opened.
      if (!leaving) inFlight.current = false
    }
  }

  return {
    state,
    pay,
    /** The manual «انتقال به درگاه» (the automatic one did not happen, or was too slow). */
    goToBankAgain: () => state.handoff && redirect(state.handoff),
    /** Back to the routes: a handoff that expired. */
    reset: () => setState(IDLE),
  }
}
