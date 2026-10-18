import { describe, expect, it } from 'vitest'
import { payAgainDoor, payAgainRoute } from '@/features/payment/pay-again'
import type { PendingPayment } from '@/features/payment/pending-payments'
import { LINK_TOKEN } from './fixtures'

// «پرداخت دوباره» on the result page needs the order's door (order digest §5.10 step 4): its
// confirmed owner (its order read for this account), the order's uuid; anyone else (a guest, or a
// signed-in payer of someone else's order or of a guest's: §11 #7), the link's token (from the
// pending payment or this device's recent guest orders). The status never says either, so with
// none known (another device) there is no door: never one made up.

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
  it('the confirmed owner: the owner’s door, with the uuid read for this account', () => {
    for (const kept of [
      null,
      pending({ orderUuid: 'stale' }),
      pending({ linkToken: LINK_TOKEN }),
    ]) {
      const door = payAgainDoor({
        pending: kept,
        orderCode: '0404614013',
        ownOrderUuid: ORDER_UUID,
        guestToken: null,
      })
      expect(door).toEqual({ kind: 'known', door: { kind: 'uuid', orderUuid: ORDER_UUID } })
    }
  })

  it('not the confirmed owner, the pending payment’s link token: the link door', () => {
    const door = payAgainDoor({
      pending: pending({ linkToken: LINK_TOKEN }),
      orderCode: '0404614013',
      ownOrderUuid: null,
      guestToken: null,
    })
    expect(door).toEqual({ kind: 'known', door: { kind: 'link', token: LINK_TOKEN } })
  })

  it('not the owner, no pending payment here: the recent guest order’s token', () => {
    const door = payAgainDoor({
      pending: null,
      orderCode: '0404614013',
      ownOrderUuid: null,
      guestToken: LINK_TOKEN,
    })
    expect(door).toEqual({ kind: 'known', door: { kind: 'link', token: LINK_TOKEN } })
  })

  it('a pending uuid door is not used without a confirmed owner (signed out, another account)', () => {
    const door = payAgainDoor({
      pending: pending({ orderUuid: ORDER_UUID }),
      orderCode: '0404614013',
      ownOrderUuid: null,
      guestToken: null,
    })
    expect(door).toEqual({ kind: 'none' })
  })

  it.each<[string, string | null]>([
    ['not the owner (a guest, or another account’s payer), on another device', '0404614013'],
    ['no order code', null],
  ])('%s: no door', (_, orderCode) => {
    expect(
      payAgainDoor({ pending: null, orderCode, ownOrderUuid: null, guestToken: null }),
    ).toEqual({ kind: 'none' })
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
