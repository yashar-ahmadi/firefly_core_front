'use client'

import { CreditCard } from 'lucide-react'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { Countdown } from '@/components/ui/countdown'
import { Spinner } from '@/components/ui/spinner'
import type { OpenAttempt as Attempt, PaymentRoute } from '@/lib/api/types/payment'
import { formatToman } from '@/lib/format'
import { formatJalaliDateTime } from '@/lib/format/date-time'
import type { PaymentDoor } from './api'
import { cancelAttempt } from './attempt-api'
import { attemptRow, type AttemptRow } from './attempt-row'
import {
  AttemptButton,
  AttemptError,
  AttemptNote,
  BANK_LOAD_FAILED,
  PARKED_NOTE,
  POLL_EXHAUSTED,
  POLL_UNREADABLE,
  ROW_TEXTS,
  ROW_TITLES,
  SMS_NOTE,
} from './open-attempt-parts'
import { savePending } from './pending-payments'
import { useAttemptStatus } from './use-attempt-status'

// The order's one open online attempt (order digest §5.9; the 409 `payment_attempt_open` body,
// or the payment link page's `open_attempt`), exactly the table's rows (attempt-row.ts). Hosts:
// the checkout after a 409, the payment link's page, the account's order detail. It never opens
// an attempt itself: «انصراف» abandons this one (`POST payment/<uuid>/cancel/`, one press at a
// time) and hands the order back (`onResolved`): the host pays again (`repay`: a new intent,
// a new key) or offers its routes. «ادامه در …» saves the pending payment, then goes to the bank
// with the handoff the server still holds (no intent at all). The uuid is a credential: the
// card-transfer page is a full page load, and nothing here logs it.

export type AttemptResolution =
  /** Abandoned: pay again at once (`repay`), or offer the routes; `notice`: the shop's sentence. */
  | { kind: 'cancelled'; repay: boolean; notice?: string }
  /** It is not open any more (closed meanwhile, or not this order's attempt): read the order. */
  | { kind: 'ended' }
  | { kind: 'settled' }

export interface OpenAttemptProps {
  attempt: Attempt
  /** The order's door: kept with the pending payment, for the result page to pay again. */
  door: PaymentDoor
  orderCode?: string
  onResolved: (resolution: AttemptResolution) => void
}

/** How long a press that sent the browser to the bank keeps the button busy (a stuck load). */
const LEAVING_MS = 4_000

export function OpenAttempt({ attempt, door, orderCode, onResolved }: OpenAttemptProps) {
  const [underReview, setUnderReview] = useState(false)
  const [handoffGone, setHandoffGone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'cancel' | 'bank' | null>(null)
  const inFlight = useRef(false)
  const own = attemptRow(attempt)
  const row: AttemptRow = underReview ? 'review' : own === 'bank' && handoffGone ? 'expired' : own
  const polled = useAttemptStatus(attempt.payment, row === 'verifying')
  const resolve = useEffectEvent(onResolved)
  useEffect(() => {
    if (polled.status === 'settled') resolve({ kind: 'settled' })
    else if (polled.status && polled.status !== 'pending') resolve({ kind: 'ended' })
  }, [polled.status])

  const savePendingAs = (route: PaymentRoute) =>
    savePending(attempt.payment, {
      kind: 'order',
      ...(orderCode ? { orderCode } : {}),
      ...(door.kind === 'link' ? { linkToken: door.token } : { orderUuid: door.orderUuid }),
      route,
      amount: attempt.amount,
      startedAt: Date.now(),
    })

  async function cancel(repay: boolean) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy('cancel')
    setError(null)
    const outcome = await cancelAttempt(attempt.payment)
    setBusy(null)
    // Handed back (cancelled, or not open any more): never a second cancel from this panel.
    if (outcome.ok) {
      if (outcome.status === 'settled') return onResolved({ kind: 'settled' })
      if (outcome.parked)
        return onResolved({ kind: 'cancelled', repay: false, notice: outcome.parked })
      return onResolved({ kind: 'cancelled', repay })
    }
    if (outcome.problem === 'stale') return onResolved({ kind: 'ended' })
    inFlight.current = false
    if (outcome.problem === 'under_review') return setUnderReview(true)
    setError(outcome.detail)
  }

  async function continueAtBank() {
    const handoff = attempt.handoff
    if (inFlight.current || !handoff) return
    inFlight.current = true
    setBusy('bank')
    setError(null)
    // Saved before the browser leaves: the result page finds the order from it.
    savePendingAs('bank_gateway')
    try {
      const { goToBank } = await import('./go-to-bank')
      goToBank(handoff)
      setTimeout(() => {
        inFlight.current = false
        setBusy(null)
      }, LEAVING_MS)
    } catch {
      inFlight.current = false
      setBusy(null)
      setError(BANK_LOAD_FAILED)
    }
  }

  const cancelButton = (label = 'انصراف', repay = false) => (
    <AttemptButton busy={busy === 'cancel'} onClick={() => void cancel(repay)}>
      {label}
    </AttemptButton>
  )
  return (
    <section
      aria-label="پرداخت باز این سفارش"
      className="flex flex-col gap-3 rounded-card border border-warning/40 bg-warning/5 p-4 md:p-5"
    >
      <h3 className="flex items-center gap-2 text-lg leading-8 font-bold text-ink-900">
        {row === 'verifying' && <Spinner aria-hidden />}
        {ROW_TITLES[row]}
      </h3>
      <p className="text-base leading-7 text-ink-800">{ROW_TEXTS[row]}</p>
      <p className="text-base leading-7 text-ink-700">
        {'مبلغ: '}
        <span className="font-bold text-ink-900">{formatToman(attempt.amount)}</span>
      </p>
      {row === 'bank' && attempt.handoff?.expires_at && (
        <p className="text-sm leading-6 text-ink-700">
          {'مهلت انتقال به درگاه: '}
          <Countdown endsAt={attempt.handoff.expires_at} onEnd={() => setHandoffGone(true)} />
        </p>
      )}
      {(row === 'expired' || row === 'card') && attempt.expires_at && (
        <p className="text-sm leading-6 text-ink-700">
          {row === 'card' ? 'مهلت ثبت رسید: ' : 'این تلاش بسته می\u{200C}شود در: '}
          <time dateTime={attempt.expires_at}>{formatJalaliDateTime(attempt.expires_at)}</time>
        </p>
      )}
      {row !== 'review' && (
        <div className="flex flex-wrap items-center gap-3">
          {row === 'bank' && attempt.handoff && (
            <AttemptButton
              busy={busy === 'bank'}
              variant="primary"
              onClick={() => void continueAtBank()}
            >
              {`ادامه در ${attempt.handoff.gateway_title}`}
            </AttemptButton>
          )}
          {row === 'card' && (
            // A full page load: the page's URL holds the payment's uuid (credential-routes.ts).
            <a
              href={`/payment/card-transfer/${attempt.payment}/`}
              onClick={() => savePendingAs('card_transfer')}
              className={cn(buttonClasses({ variant: 'primary' }), 'w-full sm:w-auto')}
            >
              <CreditCard aria-hidden />
              ادامهٔ کارت به کارت و ثبت رسید
            </a>
          )}
          {row === 'expired' ? cancelButton('انصراف و پرداخت دوباره', true) : cancelButton()}
        </div>
      )}
      {(row === 'bank' || row === 'expired' || row === 'card') && (
        <AttemptNote>{SMS_NOTE}</AttemptNote>
      )}
      {row === 'verifying' && <AttemptNote>{PARKED_NOTE}</AttemptNote>}
      {error && <AttemptError>{error}</AttemptError>}
      {row === 'verifying' && (
        <p role="status" className="text-sm leading-6 text-ink-700 empty:-mt-3">
          {polled.unreadable ? POLL_UNREADABLE : polled.exhausted ? POLL_EXHAUSTED : ''}
        </p>
      )}
    </section>
  )
}
