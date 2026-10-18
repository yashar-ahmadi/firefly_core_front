import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IntentError, startPayment, type IntentProblem } from '@/features/payment/api'
import { ApiError } from '@/lib/api/errors'
import codNotAvailable from '../../fixtures/payment-intent-cod-not-available.json'
import gatewayUnknown from '../../fixtures/payment-intent-gateway-unknown.json'
import notConfigured from '../../fixtures/payment-intent-not-configured.json'
import { intent, LINK_TOKEN } from './fixtures'

// A payment intent (order digest §3.2.3–3.2.4, §5.4–5.8, §8.3): through the signed-in door
// (`payment/order/<uuid>/intent/`) or the link (`payment/link/<token>/intent/`), the click's key
// as the Idempotency-Key, resent with the SAME key while the server says the first is still
// starting (`payment_attempt_starting`, ~2 s apart, a few times); every refusal turned into what
// the page does about it (`IntentError.problem`).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

const ORDER_UUID = '7c43e2f6-54c6-445a-b703-a67d3ebb4f4f'
const created = (data: unknown) => ({ data, msg: '', status: 201 })
const refusal = (status: number, code: string, extra: Record<string, unknown> = {}) =>
  ApiError.fromBody(status, {
    msg: '',
    code: status,
    data: {
      type: 'client_error',
      errors: [{ code, detail: `detail of ${code}`, attr: null }],
      ...extra,
    },
  })

async function problemOf(promise: Promise<unknown>): Promise<IntentError> {
  const error = await promise.catch((caught: unknown) => caught)
  expect(error).toBeInstanceOf(IntentError)
  return error as IntentError
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('startPayment', () => {
  it('the signed-in door: the order uuid, the route, a chosen gateway, the click’s key', async () => {
    mocks.bffFetch.mockResolvedValueOnce(created(intent('bank_gateway')))
    const answer = await startPayment({
      door: { kind: 'uuid', orderUuid: ORDER_UUID },
      route: 'bank_gateway',
      gatewayCode: 'ZIBAL',
      key: 'click-1',
    })
    expect(answer).toEqual(intent('bank_gateway'))
    expect(mocks.bffFetch).toHaveBeenCalledWith(`payment/order/${ORDER_UUID}/intent/`, {
      method: 'POST',
      idempotencyKey: 'click-1',
      body: { route: 'bank_gateway', gateway_code: 'ZIBAL' },
    })
  })

  it('the link door, and no gateway code unless one is given', async () => {
    mocks.bffFetch.mockResolvedValueOnce(created(intent('card_transfer')))
    await startPayment({
      door: { kind: 'link', token: LINK_TOKEN },
      route: 'card_transfer',
      key: 'k',
    })
    expect(mocks.bffFetch).toHaveBeenCalledWith(`payment/link/${LINK_TOKEN}/intent/`, {
      method: 'POST',
      idempotencyKey: 'k',
      body: { route: 'card_transfer' },
    })
  })

  it('payment_attempt_starting: waits ~2 s and resends the same key, a few times at most', async () => {
    vi.useFakeTimers()
    // Refused when called (a rejection made ahead would be unhandled while the timers wait).
    const starting = async () => {
      throw refusal(409, 'payment_attempt_starting')
    }
    mocks.bffFetch
      .mockImplementationOnce(starting)
      .mockImplementationOnce(starting)
      .mockResolvedValueOnce(created(intent('bank_gateway')))
    const started = startPayment({
      door: { kind: 'link', token: LINK_TOKEN },
      route: 'bank_gateway',
      key: 'click-7',
    })
    await vi.advanceTimersByTimeAsync(1_900)
    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(2_200)
    await vi.advanceTimersByTimeAsync(2_200)
    await expect(started).resolves.toEqual(intent('bank_gateway'))
    expect(mocks.bffFetch.mock.calls.map(([, init]) => init.idempotencyKey)).toEqual([
      'click-7',
      'click-7',
      'click-7',
    ])
  })

  it('still starting after the retries: «starting», four requests in all', async () => {
    vi.useFakeTimers()
    mocks.bffFetch.mockImplementation(async () => {
      throw refusal(409, 'payment_attempt_starting')
    })
    const stuck = startPayment({
      door: { kind: 'link', token: LINK_TOKEN },
      route: 'bank_gateway',
      key: 'click-8',
    }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await stuck).toMatchObject({ problem: 'starting' })
    expect(mocks.bffFetch).toHaveBeenCalledTimes(4)
  })

  it('gateway_not_configured (503, live): the shop’s bank cannot run', async () => {
    mocks.bffFetch.mockRejectedValueOnce(ApiError.fromBody(503, notConfigured))
    const error = await problemOf(
      startPayment({ door: { kind: 'link', token: LINK_TOKEN }, route: 'bank_gateway', key: 'k' }),
    )
    expect(error.problem).toBe('gateway_broken')
    expect(error.detail).toBe('درگاه پرداخت پیکربندی نشده است.')
    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)
  })

  it('live refusals: gateway_unknown re-reads the gateways; COD not available', async () => {
    mocks.bffFetch.mockRejectedValueOnce(ApiError.fromBody(400, gatewayUnknown))
    const door = { kind: 'link' as const, token: LINK_TOKEN }
    expect((await problemOf(startPayment({ door, route: 'bank_gateway', key: 'k' }))).problem).toBe(
      'gateway_refresh',
    )
    mocks.bffFetch.mockRejectedValueOnce(ApiError.fromBody(409, codNotAvailable))
    expect(
      (await problemOf(startPayment({ door, route: 'pay_on_delivery', key: 'k' }))).problem,
    ).toBe('cod_unavailable')
  })

  it.each<[string, number, IntentProblem]>([
    ['payment_attempt_open', 409, 'attempt_open'],
    ['payment_idempotency_conflict', 409, 'conflict'],
    ['payment_method_disabled', 409, 'method_refresh'],
    ['payment_method_not_found', 404, 'method_refresh'],
    ['payment_method_amount_exceeded', 409, 'amount_exceeded'],
    ['payment_no_active_bank_card', 409, 'card_unavailable'],
    ['payment_online_charge_outstanding', 409, 'online_outstanding'],
    ['payment_wallet_covers_full_amount', 409, 'use_wallet'],
    ['wallet_insufficient_funds', 409, 'wallet_short'],
    ['payment_wallet_required_authentication', 403, 'wallet_login'],
    ['payment_forbidden', 403, 'forbidden'],
    ['wallet_frozen', 403, 'wallet_frozen'],
    ['gateway_amount_not_supported', 400, 'gateway_refresh'],
    ['gateway_rejected', 502, 'gateway_rejected'],
    ['gateway_unavailable', 503, 'gateway_unavailable'],
    ['gateway_result_url_invalid', 503, 'gateway_broken'],
    ['gateway_token_expired', 410, 'token_expired'],
    ['order_hold_expired', 409, 'unpayable'],
    ['order_payment_link_expired', 410, 'unpayable'],
    ['order_payment_link_invalid', 404, 'unpayable'],
    ['order_not_payable', 409, 'unpayable'],
    ['order_already_settled', 409, 'settled'],
    ['order_collected_on_delivery', 409, 'settled'],
    ['order_stock_reservation_failed', 409, 'stock'],
  ])('%s (%i) → %s', async (code, status, problem) => {
    mocks.bffFetch.mockRejectedValueOnce(refusal(status, code))
    const error = await problemOf(
      startPayment({
        door: { kind: 'uuid', orderUuid: ORDER_UUID },
        route: 'bank_gateway',
        key: 'k',
      }),
    )
    expect(error.problem).toBe(problem)
    expect(error.detail).toBe(`detail of ${code}`)
  })

  it('the open attempt comes with payment_attempt_open; switches, 429 and the session', async () => {
    const open = {
      payment: 'p-1',
      method: 'bank_gateway',
      status: 'pending',
      amount: 1,
      expires_at: null,
      handoff: null,
      destination_cards: [],
    }
    mocks.bffFetch.mockRejectedValueOnce(
      refusal(409, 'payment_attempt_open', { open_attempt: open }),
    )
    const door = { kind: 'uuid' as const, orderUuid: ORDER_UUID }
    expect(
      (await problemOf(startPayment({ door, route: 'bank_gateway', key: 'k' }))).openAttempt,
    ).toEqual(open)
    mocks.bffFetch.mockRejectedValueOnce(
      new ApiError({
        status: 503,
        code: 'feature_disabled',
        detail: 'کیف پول خاموش است.',
        feature: 'wallet',
      }),
    )
    const off = await problemOf(startPayment({ door, route: 'wallet', key: 'k' }))
    expect([off.problem, off.feature]).toEqual(['feature_off', 'wallet'])
    mocks.bffFetch.mockRejectedValueOnce(
      new ApiError({ status: 429, code: 'throttled', retryAfter: 30 }),
    )
    const throttled = await problemOf(startPayment({ door, route: 'wallet', key: 'k' }))
    expect([throttled.problem, throttled.retryAfter]).toEqual(['throttled', 30])
    mocks.bffFetch.mockRejectedValueOnce(new ApiError({ status: 401, code: 'not_authenticated' }))
    expect((await problemOf(startPayment({ door, route: 'wallet', key: 'k' }))).problem).toBe(
      'session',
    )
    mocks.bffFetch.mockRejectedValueOnce(ApiError.network())
    expect((await problemOf(startPayment({ door, route: 'wallet', key: 'k' }))).problem).toBe(
      'other',
    )
  })
})
