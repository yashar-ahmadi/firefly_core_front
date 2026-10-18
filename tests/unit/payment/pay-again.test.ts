import { describe, expect, it } from 'vitest'
import { payAgainDoor, payAgainRoute } from '@/features/payment/pay-again'
import type { PendingPayment } from '@/features/payment/pending-payments'
import { LINK_TOKEN } from './fixtures'

// «پرداخت دوباره» on the result page needs the order's door (order digest §5.10 step 4): signed
// in, the order's uuid (from the pending payment, else `GET order/<code>/`); a guest, the link's
// token (from the pending payment or this device's recent guest orders). The status never says
// either, so with none known (another device) there is no door: never one made up.

const ORDER_UUID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const pending = (changes: Partial<PendingPayment> = {}): PendingPayment => ({
  kind: 'order',
  orderCode: '0404614013',
  route: 'bank_gateway',
  amount: 1_049_000,
  startedAt: Date.now(),
  ...changes,
})

describe('payAgainDoor', () => {
  it('signed in, the pending payment’s order uuid: the owner’s door', () => {
    const door = payAgainDoor({
      pending: pending({ orderUuid: ORDER_UUID }),
      orderCode: '0404614013',
      hasSession: true,
      guestToken: null,
    })
    expect(door).toEqual({ kind: 'known', door: { kind: 'uuid', orderUuid: ORDER_UUID } })
  })

  it('the pending payment’s link token: the link door, signed in or not', () => {
    for (const hasSession of [true, false]) {
      const door = payAgainDoor({
        pending: pending({ linkToken: LINK_TOKEN }),
        orderCode: '0404614013',
        hasSession,
        guestToken: null,
      })
      expect(door).toEqual({ kind: 'known', door: { kind: 'link', token: LINK_TOKEN } })
    }
  })

  it('a guest with no pending payment here: the recent guest order’s token', () => {
    const door = payAgainDoor({
      pending: null,
      orderCode: '0404614013',
      hasSession: false,
      guestToken: LINK_TOKEN,
    })
    expect(door).toEqual({ kind: 'known', door: { kind: 'link', token: LINK_TOKEN } })
  })

  it('signed in with nothing kept here: the order is looked up by its code', () => {
    const door = payAgainDoor({
      pending: null,
      orderCode: '0404614013',
      hasSession: true,
      guestToken: null,
    })
    expect(door).toEqual({ kind: 'lookup', orderCode: '0404614013' })
  })

  it('a uuid door needs the session: signed out since, it is not used', () => {
    const door = payAgainDoor({
      pending: pending({ orderUuid: ORDER_UUID }),
      orderCode: '0404614013',
      hasSession: false,
      guestToken: null,
    })
    expect(door).toEqual({ kind: 'none' })
  })

  it.each<[string, string | null]>([
    ['a guest on another device', '0404614013'],
    ['no order code', null],
  ])('%s: no door', (_, orderCode) => {
    expect(payAgainDoor({ pending: null, orderCode, hasSession: false, guestToken: null })).toEqual(
      { kind: 'none' },
    )
  })
})

describe('payAgainRoute', () => {
  it('the bank again, or the wallet and the bank for a signed-in shopper who chose them', () => {
    expect(payAgainRoute(null, true)).toBe('bank_gateway')
    expect(payAgainRoute(pending({ route: 'wallet_and_gateway' }), true)).toBe('wallet_and_gateway')
    expect(payAgainRoute(pending({ route: 'wallet_and_gateway' }), false)).toBe('bank_gateway')
    expect(payAgainRoute(pending({ route: 'card_transfer' }), true)).toBe('bank_gateway')
  })
})
