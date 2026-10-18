'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { newIdempotencyKey } from '@/features/checkout/idempotency'
import { useMarkFeatureDisabled } from '@/features/settings/feature-context'
import type { OpenAttempt, PaymentRoute, RedirectPayload } from '@/lib/api/types/payment'
import { loadPage } from '@/lib/navigation/hard-navigation'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { SUMMARY_KEY, WALLET_KEY } from '@/lib/session/viewer-queries'
import { IntentError, startPayment, type PaymentIntentResult } from './api'
import { intentMessage } from './intent-messages'
import { applyIntentRefusal } from './intent-refusal'
import { savePending } from './pending-payments'
import type { PaymentCatalogState } from './use-payment-catalog'

// Paying an order through its payment link (order digest §3.2.4, §5.4–5.8): the link door
// (`payment/link/<token>/intent/`; anyone with the link may pay, the wallet routes need the
// account). One intent per press however fast the presses (an in-flight guard), a new
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
  token: string
  orderCode: string
  catalog: PaymentCatalogState
  suggest: (route: PaymentRoute) => void
  onPaid: (paid: LinkPaid) => void
  onAttemptOpen: (attempt: OpenAttempt) => void
  /** The order changed under the page (paid, expired, not payable): read it again. */
  onStale: () => void
}

export function useLinkPayment(options: LinkPaymentOptions) {
  const { token, orderCode, catalog, suggest, onPaid, onAttemptOpen, onStale } = options
  const client = useQueryClient()
  const expire = useSessionExpired()
  const markFeatureDisabled = useMarkFeatureDisabled()
  const inFlight = useRef(false)
  const [state, setState] = useState<LinkPayState>(IDLE)

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
    const payment = intent.payment
    const pending = () =>
      payment &&
      savePending(payment.uuid, {
        kind: 'order',
        orderCode,
        linkToken: token,
        route,
        amount: payment.amount,
        startedAt: Date.now(),
      })
    if (route === 'pay_on_delivery') return onPaid({ kind: 'confirmed', free: payment === null })
    if (route === 'wallet') {
      walletMoved()
      return payment?.status === 'settled' ? onPaid({ kind: 'paid' }) : onStale()
    }
    if (route === 'card_transfer' && payment) {
      pending()
      return loadPage(`/payment/card-transfer/${payment.uuid}/`)
    }
    if (route === 'wallet_and_gateway') walletMoved()
    if (!payment || !intent.handoff) throw new IntentError('other', null)
    // Saved before the browser leaves: the result page finds the order from it.
    pending()
    redirect(intent.handoff)
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
    const door = { kind: 'link', token } as const
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
      failed(error instanceof IntentError ? error : new IntentError('other', error), gatewayCode)
    } finally {
      inFlight.current = false
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
