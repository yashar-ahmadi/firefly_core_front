import { describe, expect, it } from 'vitest'
import { topUpRefusal } from '@/features/wallet/top-up-refusal'
import { withdrawalRefusal } from '@/features/wallet/withdrawal-refusal'
import { ApiError } from '@/lib/api/errors'
import { refusal } from './fixtures'

// What the wallet's writes do with each refusal (order digest §3.3.3–3.3.6, §8.3, §8.5), from
// the API's live answers where the dev backend gives them (tests/fixtures/wallet-refusals.json).

const live = (name: Parameters<typeof refusal>[0]) => {
  const { status, body } = refusal(name)
  return ApiError.fromBody(status, body)
}
const api = (status: number, code: string, extra: Record<string, unknown> = {}, attr = null) =>
  ApiError.fromBody(status, {
    data: { type: 'client_error', errors: [{ code, detail: 'رد شد.', attr }], ...extra },
  })

describe('topUpRefusal', () => {
  it.each([
    ['topup-below', 'amount'],
    ['topup-above', 'amount'],
    ['topup-zero', 'amount'],
    ['topup-named', 'gateway_unknown'],
    ['topup-unnamed', 'gateway_broken'],
  ] as const)('live %s → %s', (name, kind) => {
    expect(topUpRefusal(live(name)).kind).toBe(kind)
  })

  it.each([
    [400, 'wallet_top_up_disabled', 'disabled'],
    [400, 'wallet_top_up_daily_limit_exceeded', 'amount'],
    [403, 'wallet_frozen', 'frozen'],
    [400, 'gateway_amount_not_supported', 'gateway_amount'],
    [503, 'gateway_result_url_invalid', 'gateway_broken'],
    [503, 'gateway_unavailable', 'gateway_unavailable'],
    [502, 'gateway_rejected', 'gateway_rejected'],
    [409, 'payment_idempotency_conflict', 'conflict'],
    [410, 'gateway_token_expired', 'token_expired'],
    [409, 'payment_attempt_starting', 'starting'],
    [429, 'throttled', 'throttled'],
    [500, 'server_error', 'other'],
  ])('%i %s → %s', (status, code, kind) => {
    expect(topUpRefusal(api(status, code, status === 429 ? { retry_after: 30 } : {})).kind).toBe(
      kind,
    )
  })

  it('503 feature_disabled (wallet or online_payment): that switch, with the shop’s words', () => {
    const off = topUpRefusal(api(503, 'feature_disabled', { feature: 'online_payment' }))
    expect(off).toEqual({ kind: 'feature_off', feature: 'online_payment', reason: 'رد شد.' })
  })

  it('a 429 keeps its wait; a session gone is the session’s; a lost answer is other', () => {
    expect(topUpRefusal(api(429, 'throttled', { retry_after: 30 }))).toMatchObject({
      kind: 'throttled',
      retryAfter: 30,
    })
    expect(topUpRefusal(api(401, 'token_not_valid')).kind).toBe('session')
    expect(topUpRefusal(new TypeError('offline')).kind).toBe('other')
  })
})

describe('withdrawalRefusal', () => {
  it('live field errors land on their fields', () => {
    expect(withdrawalRefusal(live('wd-iban-invalid'))).toEqual({
      kind: 'fields',
      errors: { iban: 'شماره شبا معتبر نیست.' },
    })
    expect(withdrawalRefusal(live('wd-card-invalid'))).toEqual({
      kind: 'fields',
      errors: { card: 'شماره کارت معتبر نیست.' },
    })
    expect(withdrawalRefusal(live('wd-name-long'))).toMatchObject({
      kind: 'fields',
      errors: { holder: expect.stringContaining('120') },
    })
  })

  it.each([
    ['wd-below', 'below_minimum'],
    ['wd-over-balance', 'insufficient'],
  ] as const)('live %s → %s', (name, kind) => {
    expect(withdrawalRefusal(live(name)).kind).toBe(kind)
  })

  it.each([
    [400, 'wallet_withdrawal_disabled', 'disabled'],
    [409, 'wallet_withdrawal_pending_exists', 'pending_exists'],
    [403, 'wallet_frozen', 'frozen'],
    [429, 'throttled', 'throttled'],
    [500, 'server_error', 'other'],
  ])('%i %s → %s', (status, code, kind) => {
    expect(withdrawalRefusal(api(status, code)).kind).toBe(kind)
  })

  it('503 feature_disabled: the wallet switch is off', () => {
    expect(withdrawalRefusal(api(503, 'feature_disabled', { feature: 'wallet' }))).toEqual({
      kind: 'feature_off',
      feature: 'wallet',
      reason: 'رد شد.',
    })
  })
})
