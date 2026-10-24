'use client'

import { useRef, useState } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { newIdempotencyKey } from '@/features/checkout/idempotency'
import { savePending } from '@/features/payment/pending-payments'
import type { PaymentCatalogState } from '@/features/payment/use-payment-catalog'
import { useMarkFeatureDisabled } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import type { GatewayOption, RedirectPayload, WalletBalance } from '@/lib/api/types/payment'
import { NO_WAIT, restartWait, type Wait } from '@/lib/forms/waits'
import { BANK_LEAVING_MS, useReleaseIfStillHere } from '@/lib/navigation/leaving'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { toPersianDigits } from '@/lib/format/digits'
import { postTopUp } from './api'
import {
  closedForToday,
  dayClosed,
  gatewayOutOfRange,
  topUpBounds,
  topUpProblem,
} from './top-up-bounds'
import { topUpRefusal, type TopUpRefusal } from './top-up-refusal'

// A top-up's press (order digest §3.3.3, §5.4, §5.12): one request however fast the presses (an
// in-flight guard), a NEW Idempotency-Key per press, resent as it is only while the server says
// that press is still starting (`payment_attempt_starting`, about 2 s apart) and replaced once if
// a replayed key's handoff expired. 201: the pending top-up is saved FIRST (the result page finds
// it), then the bank (its code loaded now), the press held while the browser leaves (12 s at
// most: a bank's page can be slow). Each refusal becomes what the box shows (§8.3, §8.5).

export const STARTING_RETRY_MS = 2_000
const STARTING_RETRIES = 3

export type TopUpPhase =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'redirecting'; handoff: RedirectPayload; loadFailed: boolean }

export interface TopUpIssue {
  /** Under the amount (a bound). */
  field?: string
  /** For the whole box (role alert). */
  alert?: string
  /** The box is done for this page (top-ups off, the bank unusable): this sentence instead. */
  closed?: string
  /** Offer the support line with it. */
  support?: boolean
}

export interface TopUpRequest {
  amount: number
  gatewayCode: string | undefined
  gateway: GatewayOption | null
}

const WORDS = {
  gateway: 'این درگاه در حال حاضر در دسترس نیست؛ درگاه دیگری را انتخاب کنید.',
  gatewayNext: (title: string) =>
    `این درگاه در حال حاضر در دسترس نیست؛ برای پرداخت با ${title} دوباره «افزایش موجودی» را بزنید.`,
  next: (title: string) => `برای پرداخت با ${title} دوباره «افزایش موجودی» را بزنید.`,
  other: 'درگاه دیگری را انتخاب کنید یا مبلغ دیگری وارد کنید.',
  broken:
    'شارژ کیف پول با درگاه بانکی در این فروشگاه اکنون ممکن نیست. کمی بعد دوباره سر بزنید یا با پشتیبانی تماس بگیرید.',
  unavailable: 'درگاه بانک پاسخ نداد؛ کمی بعد دوباره تلاش کنید.',
  rejected: 'بانک تراکنش را نپذیرفت. می\u{200C}توانید با درگاه دیگری دوباره تلاش کنید.',
  conflict: 'تلاش قبلی شارژ پایان یافته است؛ برای شارژ تازه دوباره بزنید.',
  expired: 'مهلت انتقال به درگاه تمام شد؛ دوباره تلاش کنید.',
  starting: 'شارژ قبلی شما هنوز در حال آماده شدن است؛ چند لحظه بعد دوباره تلاش کنید.',
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * The gateways a top-up of `amount` may use: those not withdrawn for the page, nor refused at
 * that amount (`gateway_amount_not_supported`). No amount yet: every one not withdrawn.
 */
export const usableAt = (catalog: PaymentCatalogState, amount: number | null): GatewayOption[] =>
  catalog.gateways.filter(
    ({ code }) => !catalog.refused.some((r) => r.code === code && r.amount === amount),
  )
const codeOf = (error: unknown) => (error instanceof ApiError ? error.code : null)
const loadGoToBank = () => import('@/features/payment/go-to-bank').then((module) => module.goToBank)

export function useTopUp({
  catalog,
  refreshWallet,
}: {
  catalog: PaymentCatalogState
  /** `GET wallet/` again; the fresh answer (undefined: it could not be read). */
  refreshWallet: () => Promise<WalletBalance | undefined>
}) {
  const expire = useSessionExpired()
  const markFeatureDisabled = useMarkFeatureDisabled()
  const holdWhileLeaving = useReleaseIfStillHere(BANK_LEAVING_MS)
  const inFlight = useRef(false)
  const [phase, setPhase] = useState<TopUpPhase>({ kind: 'idle' })
  const [issue, setIssue] = useState<TopUpIssue | null>(null)
  const [wait, setWait] = useState<Wait>(NO_WAIT)

  /** The bank: its code loaded now; a code that cannot load leaves the manual button. */
  const redirect = (handoff: RedirectPayload) => {
    setPhase({ kind: 'redirecting', handoff, loadFailed: false })
    loadGoToBank()
      .then((goToBank) => goToBank(handoff))
      .catch(() => setPhase({ kind: 'redirecting', handoff, loadFailed: true }))
  }

  async function send({ amount, gatewayCode }: TopUpRequest) {
    let key = newIdempotencyKey()
    let renewed = false
    for (let attempt = 0; ; attempt++) {
      try {
        return await postTopUp(
          gatewayCode ? { amount, gateway_code: gatewayCode } : { amount },
          key,
        )
      } catch (error) {
        const code = codeOf(error)
        if (code === 'payment_attempt_starting' && attempt < STARTING_RETRIES) {
          await sleep(STARTING_RETRY_MS)
          continue
        }
        if (code === 'gateway_token_expired' && !renewed) {
          renewed = true
          key = newIdempotencyKey()
          continue
        }
        throw error
      }
    }
  }

  async function refused(refusal: TopUpRefusal, request: TopUpRequest) {
    switch (refusal.kind) {
      case 'session':
        return expire()
      case 'feature_off':
        markFeatureDisabled(refusal.feature, refusal.reason)
        return setIssue({ closed: refusal.reason })
      case 'disabled':
        void refreshWallet()
        return setIssue({ closed: refusal.message })
      case 'frozen':
        void refreshWallet()
        return setIssue({ alert: refusal.message })
      case 'amount': {
        // The shop's limits may have moved: said from the wallet read again.
        const fresh = await refreshWallet()
        if (!fresh) return setIssue({ field: toPersianDigits(refusal.message) })
        const bounds = topUpBounds(fresh, request.gateway)
        const field = dayClosed(fresh)
          ? closedForToday(fresh)
          : !bounds.open && request.gateway
            ? gatewayOutOfRange(fresh, request.gateway, catalog.gateways.length > 1)
            : topUpProblem(request.amount, bounds) || toPersianDigits(refusal.message)
        return setIssue({ field })
      }
      case 'gateway_unknown': {
        const left = catalog.gateways.filter((gateway) => gateway.code !== request.gatewayCode)
        if (request.gatewayCode) catalog.withdrawGateway(request.gatewayCode)
        void catalog.refreshGateways()
        // One left: the next press goes through it (nothing to choose); none: the box closes.
        return setIssue({
          alert: left.length === 1 ? WORDS.gatewayNext(left[0]!.title) : WORDS.gateway,
        })
      }
      case 'gateway_amount': {
        // Left out at this amount only (another amount offers it again): another gateway takes
        // the next press; none, the bound is the amount's own issue (the box sends nothing).
        const tried = request.gateway?.code ?? request.gatewayCode
        if (tried) catalog.withdrawGateway(tried, request.amount)
        const left = usableAt(catalog, request.amount).filter(({ code }) => code !== tried)
        const said = toPersianDigits(refusal.message)
        if (left.length === 0) return setIssue({ field: said })
        return setIssue({
          alert: `${said} ${left.length === 1 ? WORDS.next(left[0]!.title) : WORDS.other}`,
        })
      }
      case 'gateway_broken':
        return setIssue({ closed: WORDS.broken, support: true })
      case 'gateway_unavailable':
        return setIssue({ alert: WORDS.unavailable })
      case 'gateway_rejected':
        return setIssue({ alert: WORDS.rejected })
      case 'conflict':
        return setIssue({ alert: WORDS.conflict })
      case 'token_expired':
        return setIssue({ alert: WORDS.expired })
      case 'starting':
        return setIssue({ alert: WORDS.starting })
      case 'throttled':
        setWait((previous) => restartWait(previous, Date.now(), refusal.retryAfter))
        return setIssue(null)
      default:
        return setIssue({ alert: refusal.message })
    }
  }

  async function submit(request: TopUpRequest) {
    if (inFlight.current) return
    inFlight.current = true
    setIssue(null)
    setPhase({ kind: 'sending' })
    announce('در حال آماده\u{200C}سازی پرداخت…')
    let leaving = false
    try {
      const intent = await send(request)
      if (!intent.payment || !intent.handoff) throw new Error('top-up without a handoff')
      // Saved before the browser leaves: the result page finds the top-up from it.
      savePending(intent.payment.uuid, {
        kind: 'topup',
        route: 'bank_gateway',
        amount: intent.payment.amount,
        startedAt: Date.now(),
      })
      redirect(intent.handoff)
      leaving = true
      // Taken while the browser leaves; given back if it did not (a stuck load, a cache restore).
      holdWhileLeaving(() => {
        inFlight.current = false
      })
    } catch (error) {
      setPhase({ kind: 'idle' })
      await refused(topUpRefusal(error), request)
    } finally {
      if (!leaving) inFlight.current = false
    }
  }

  return {
    phase,
    issue,
    wait,
    submit: (request: TopUpRequest) => void submit(request),
    /** The manual «انتقال به درگاه». */
    goAgain: () => phase.kind === 'redirecting' && redirect(phase.handoff),
    /** The handoff expired: back to the box, saying so. */
    expired: () => {
      inFlight.current = false
      setPhase({ kind: 'idle' })
      setIssue({ alert: WORDS.expired })
    },
    /** The amount or the gateway changed: what was said about the last press goes. */
    clearField: () => setIssue((current) => (current?.field ? null : current)),
  }
}
