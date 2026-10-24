import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IntentError } from '@/features/payment/api'
import { applyIntentRefusal } from '@/features/payment/intent-refusal'
import { intentMessage } from '@/features/payment/intent-messages'
import { availableRoutes, type RouteInput } from '@/features/payment/routes'
import { usePaymentCatalog, type PaymentCatalogState } from '@/features/payment/use-payment-catalog'
import { ApiError } from '@/lib/api/errors'
import { catalog, FEATURES_ON, gateways, methods, wallet } from './fixtures'

// `gateway_amount_not_supported` (order digest §5.4: «other gateway / route»): the gateway tried
// does not take the amount asked of it, under its floor or over its ceiling. It used to withdraw
// that gateway for the whole page, as `gateway_unknown` (a gateway the shop cannot use at all)
// does (Plan 4 final review, carried to Plan 5 Task 9). Now it is left out for that amount only:
// another amount (the wallet's share taken off, a top-up's other sum) offers it again.

vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn(() => new Promise(() => {})) }))

const ONLINE = 1_049_000
const input = (changes: Partial<RouteInput> = {}): RouteInput => ({
  methods: methods(),
  isGuest: false,
  wallet: wallet({ balance: 500_000 }),
  online: ONLINE,
  onDelivery: 0,
  gateways: gateways(),
  features: FEATURES_ON,
  ...changes,
})
const offered = (changes: Partial<RouteInput>, route: string) =>
  availableRoutes(input(changes))
    .find((choice) => choice.route === route)!
    .gateways.map(({ code }) => code)

describe('the routes, a gateway refused at an amount', () => {
  it('is not offered for that amount, and is for another', () => {
    const refused = [{ code: 'ZIBAL', amount: ONLINE }]
    expect(offered({ refused }, 'bank_gateway')).toEqual(['ZARINPAL'])
    expect(offered({ refused, online: 2_000_000 }, 'bank_gateway')).toEqual(['ZARINPAL', 'ZIBAL'])
  })

  it('the wallet and the bank: the bank’s share is the amount it is compared at', () => {
    // 1,049,000 owed, 500,000 in the wallet: the bank is asked for 549,000.
    const refused = [{ code: 'ZIBAL', amount: 549_000 }]
    expect(offered({ refused }, 'wallet_and_gateway')).toEqual(['ZARINPAL'])
    expect(offered({ refused }, 'bank_gateway')).toEqual(['ZARINPAL', 'ZIBAL'])
  })

  it('refused for any amount (`gateway_unknown`): offered for none', () => {
    const refused = [{ code: 'ZIBAL' }]
    expect(offered({ refused }, 'bank_gateway')).toEqual(['ZARINPAL'])
    expect(offered({ refused, online: 2_000_000 }, 'bank_gateway')).toEqual(['ZARINPAL'])
  })

  it('every gateway refused at the amount: the bank closes for it, saying none is available', () => {
    const refused = ['ZARINPAL', 'ZIBAL'].map((code) => ({ code, amount: ONLINE }))
    const bank = availableRoutes(input({ refused })).find((r) => r.route === 'bank_gateway')!
    expect(bank).toMatchObject({ enabled: false, reason: 'درگاه بانکی در دسترس نیست.' })
  })
})

describe('the catalog', () => {
  it('a gateway withdrawn at an amount stays listed, refused at that amount; without one, gone', () => {
    const served = catalog()
    const { result } = renderHook(() => usePaymentCatalog(served))
    act(() => result.current.withdrawGateway('ZIBAL', ONLINE))
    expect(result.current.gateways.map(({ code }) => code)).toEqual(['ZARINPAL', 'ZIBAL'])
    expect(result.current.refused).toEqual([{ code: 'ZIBAL', amount: ONLINE }])
    act(() => result.current.withdrawGateway('ZIBAL'))
    expect(result.current.gateways.map(({ code }) => code)).toEqual(['ZARINPAL'])
  })
})

describe('a refused intent', () => {
  const refusal = (code: string) =>
    new IntentError(
      code === 'gateway_unknown' ? 'gateway_refresh' : 'gateway_amount',
      ApiError.fromBody(400, {
        msg: 'خطا',
        code: 400,
        data: {
          type: 'client_error',
          errors: [{ code, detail: 'مبلغ پرداخت از حداکثر مجاز این درگاه بیشتر است.', attr: null }],
        },
      }),
    )
  const deps = () => {
    const state = {
      gateways: gateways(),
      withdrawGateway: vi.fn(),
      refreshGateways: vi.fn(async () => true),
    } as unknown as PaymentCatalogState
    return { catalog: state, markFeatureDisabled: vi.fn(), walletMoved: vi.fn(), suggest: vi.fn() }
  }

  it('`gateway_amount_not_supported`: the gateway tried left out at the amount asked of it', () => {
    const d = deps()
    applyIntentRefusal(refusal('gateway_amount_not_supported'), 'ZIBAL', d, 549_000)
    expect(d.catalog.withdrawGateway).toHaveBeenCalledWith('ZIBAL', 549_000)
    expect(d.catalog.refreshGateways).toHaveBeenCalled()
    // No code sent: the shop's default was tried.
    const unnamed = deps()
    applyIntentRefusal(refusal('gateway_amount_not_supported'), undefined, unnamed, ONLINE)
    expect(unnamed.catalog.withdrawGateway).toHaveBeenCalledWith('ZARINPAL', ONLINE)
  })

  it('`gateway_unknown`: left out for any amount', () => {
    const d = deps()
    applyIntentRefusal(refusal('gateway_unknown'), 'ZIBAL', d, 549_000)
    expect(d.catalog.withdrawGateway).toHaveBeenCalledWith('ZIBAL', undefined)
  })

  it('says the API’s own sentence (the bound), and to choose another gateway or route', () => {
    expect(intentMessage(refusal('gateway_amount_not_supported'))).toBe(
      'مبلغ پرداخت از حداکثر مجاز این درگاه بیشتر است. درگاه یا روش دیگری را انتخاب کنید.',
    )
  })
})
