// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  COPY,
  resultCopy,
  type PaymentStatusView,
  type ReturnResult,
} from '@/features/payment/result-copy'

// The result page's words (order digest §5.10): every row of the table, with its Persian copied
// verbatim, and the status as the truth (Review Focus #3): the return's `result` and `code` only
// choose among the sentences the status allows.

const view = (
  status: PaymentStatusView['status'],
  changes: Partial<PaymentStatusView> = {},
): PaymentStatusView => ({
  status,
  applies_to: 'online_charge',
  failure_reason: '',
  order_code: '0404614013',
  ...changes,
})
const failed = (reason: string) => view('failed', { failure_reason: reason, result: 'failed' })
const cancelled = (reason: string) => view('cancelled', { failure_reason: reason })
const topUp = (status: PaymentStatusView['status'], changes: Partial<PaymentStatusView> = {}) =>
  view(status, { applies_to: 'wallet_topup', order_code: null, ...changes })

describe('resultCopy, an order payment', () => {
  it('failed + gateway_capture_not_bookable: exactly the 72-hour sentence, no pay again', () => {
    const copy = resultCopy(failed('gateway_capture_not_bookable'), 'gateway_capture_not_bookable')
    expect(copy.body).toBe(
      'پرداخت روی سفارش ثبت نشد. اگر مبلغی از حساب شما کسر شده، بانک حداکثر ظرف ۷۲ ساعت آن را برمی\u{200C}گرداند.',
    )
    expect(copy.tone).toBe('error')
    expect(copy.actions).not.toContain('pay_again')
  })

  it('settled: success with the order code, a link to the order', () => {
    const copy = resultCopy(view('settled', { result: 'success' }), null)
    expect(copy).toMatchObject({ tone: 'success', actions: ['order'] })
    expect(copy.body).toBe('پرداخت با موفقیت انجام شد. سفارش ۰۴۰۴۶۱۴۰۱۳ در حال انجام است.')
  })

  it.each<[string, string, string]>([
    ['gateway_rejected', COPY.rejected, 'the bank said no'],
    ['gateway_unavailable', COPY.unavailable, 'the gateway did not answer'],
  ])('failed + %s: its sentence, pay again (a new key) or another route', (reason, body) => {
    const copy = resultCopy(failed(reason), reason)
    expect(copy).toMatchObject({ tone: 'error', body, actions: ['pay_again', 'other_route'] })
  })

  it('failed with a code it does not know: the generic failure', () => {
    const copy = resultCopy(failed(''), 'gateway_not_configured')
    expect(copy.tone).toBe('error')
    expect(copy.body).toMatch(/^پرداخت انجام نشد\./)
    expect(copy.actions).toEqual(['pay_again', 'other_route'])
  })

  it('pending + gateway_verification_pending: being checked, nothing to press', () => {
    const copy = resultCopy(view('pending', { result: 'pending' }), 'gateway_verification_pending')
    expect(copy).toMatchObject({ tone: 'pending', body: COPY.verifying, actions: [] })
  })

  it.each(['gateway_capture_parked', 'gateway_amount_mismatch'])(
    'pending + %s: received but not booked, the reference for support, no pay again',
    (code) => {
      const copy = resultCopy(view('pending', { result: 'pending' }), code)
      expect(copy).toMatchObject({ body: COPY.parked, reference: true })
      expect(copy.actions).toEqual(['order', 'support'])
    },
  )

  it('result=failed without a code, still pending: unknown, being checked', () => {
    const copy = resultCopy(view('pending', { result: 'failed' }), null)
    expect(copy).toMatchObject({ tone: 'pending', body: COPY.unknown, actions: [] })
  })

  it('cancelled + payment_attempt_expired after a pending return: support', () => {
    const copy = resultCopy(cancelled('payment_attempt_expired'), 'gateway_verification_pending')
    expect(copy).toMatchObject({ body: COPY.expired, actions: ['support', 'order'] })
  })

  it.each(['payment_attempt_abandoned', 'payment_attempt_order_cancelled'])(
    'cancelled + %s: the order’s state, no pay again',
    (reason) => {
      const copy = resultCopy(cancelled(reason), null)
      expect(copy).toMatchObject({ tone: 'info', actions: ['order'] })
    },
  )

  it('refunded (+ gateway_capture_refunded): the money is back', () => {
    const copy = resultCopy(view('refunded'), 'gateway_capture_refunded')
    expect(copy).toMatchObject({ tone: 'info', body: COPY.refunded, actions: [] })
  })

  it.each(['gateway_callback_invalid', 'gateway_transaction_state_invalid'])(
    'result=failed + %s with a payment: the status decides',
    (code) => {
      expect(resultCopy(view('settled', { result: 'failed' }), code).tone).toBe('success')
      expect(resultCopy(view('pending', { result: 'failed' }), code).body).toBe(COPY.verifying)
    },
  )
})

describe('the status is the truth (Review Focus #3)', () => {
  it.each<[ReturnResult]>([['success'], ['pending']])(
    'result=%s with the payment still pending: checking, never success',
    (result) => {
      const copy = resultCopy(view('pending', { result }), null)
      expect(copy.tone).toBe('pending')
      expect(copy.body).toBe(COPY.verifying)
      expect(copy.body).not.toContain('موفقیت')
    },
  )

  it('a code never turns a settled payment into a failure, nor a failure into success', () => {
    expect(resultCopy(view('settled', { result: 'failed' }), 'gateway_rejected').tone).toBe(
      'success',
    )
    expect(resultCopy(failed('gateway_rejected'), null).tone).toBe('error')
    expect(resultCopy(view('failed', { result: 'success' }), null).tone).toBe('error')
  })
})

describe('resultCopy, a wallet top-up', () => {
  it('settled: the wallet is charged, a link to it', () => {
    expect(resultCopy(topUp('settled'), null)).toMatchObject({
      tone: 'success',
      body: COPY.topUp,
      actions: ['wallet'],
    })
  })

  it.each([
    'gateway_rejected',
    'gateway_capture_not_bookable',
    'gateway_unavailable',
    'payment_attempt_expired',
    '',
  ])('failed + %s: about the wallet, never an order, never pay again here', (reason) => {
    const copy = resultCopy(topUp('failed', { failure_reason: reason }), null)
    expect(copy.tone).toBe('error')
    expect(copy.body).not.toContain('سفارش')
    expect(copy.actions).toContain('wallet')
    expect(copy.actions).not.toContain('pay_again')
  })

  it('pending + gateway_capture_parked: received, not added to the wallet; support', () => {
    const copy = resultCopy(topUp('pending'), 'gateway_capture_parked')
    expect(copy.body).toContain('کیف پول')
    expect(copy).toMatchObject({ reference: true, actions: ['wallet', 'support'] })
  })

  it('pending: being checked', () => {
    expect(resultCopy(topUp('pending', { result: 'success' }), null).body).toBe(COPY.verifying)
  })
})

describe('the table’s sentences', () => {
  const digest = readFileSync('docs/backend-integration/order-payment.md', 'utf8')
  it.each(Object.entries(COPY))('%s is the digest’s own, character for character', (_, text) => {
    expect(digest).toContain(`«${text}»`)
  })
})
