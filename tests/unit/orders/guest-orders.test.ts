import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findGuestOrder,
  GUEST_ORDERS_KEY,
  readGuestOrders,
  saveGuestOrder,
  type GuestOrder,
} from '@/features/orders/guest-orders'
import { linkTokenOf, payLinkPath } from '@/features/orders/pay-link'

// A guest's recent orders (order digest §5.2; Plan 4 Global Constraints): the last 10 in
// `ff-guest-orders`, newest first, the guest's only way back to them on this device besides the
// SMS. A storage that refuses never throws.

const order = (code: string, changes: Partial<GuestOrder> = {}): GuestOrder => ({
  orderCode: code,
  linkToken: `token-${code}`,
  paymentUrl: `http://localhost:3000/order/pay/token-${code}`,
  expiresAt: '2026-10-21T05:38:01.005632+03:30',
  A: 1_049_000,
  D: 0,
  placedAt: '2026-10-18T05:38:01.111517+03:30',
  ...changes,
})

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('guest orders', () => {
  it('keeps the last 10, newest first; the same code again moves to the top', () => {
    for (let index = 0; index < 12; index++) saveGuestOrder(order(String(1_000_000_000 + index)))
    const codes = readGuestOrders().map((item) => item.orderCode)
    expect(codes).toHaveLength(10)
    expect(codes[0]).toBe('1000000011')
    expect(codes).not.toContain('1000000000')
    expect(codes).not.toContain('1000000001')
    saveGuestOrder(order('1000000005', { A: 5 }))
    expect(readGuestOrders()[0]).toEqual(order('1000000005', { A: 5 }))
    expect(readGuestOrders()).toHaveLength(10)
    expect(findGuestOrder('1000000005')?.A).toBe(5)
    expect(findGuestOrder('0000000000')).toBeNull()
  })

  it('malformed storage reads as empty; a refusing storage never throws', () => {
    localStorage.setItem(GUEST_ORDERS_KEY, '{oops')
    expect(readGuestOrders()).toEqual([])
    localStorage.setItem(GUEST_ORDERS_KEY, JSON.stringify([{ orderCode: 5 }, order('1234567890')]))
    expect(readGuestOrders().map((item) => item.orderCode)).toEqual(['1234567890'])
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(() => saveGuestOrder(order('1234567890'))).not.toThrow()
    expect(readGuestOrders()).toEqual([])
  })
})

describe('the payment link', () => {
  it('its token is the last path segment; our page is /order/pay/<token>/', () => {
    const token = 'ubiClbz6wHu1G-pJ9F98soBsfDqrITpZULlnO_4bi3U'
    expect(linkTokenOf(`http://localhost:3000/order/pay/${token}`)).toBe(token)
    expect(linkTokenOf(`https://shop.ir/order/pay/${token}/`)).toBe(token)
    expect(linkTokenOf(null)).toBeNull()
    expect(linkTokenOf('not a url')).toBeNull()
    expect(linkTokenOf('https://shop.ir/')).toBeNull()
    expect(payLinkPath(token)).toBe(`/order/pay/${token}/`)
  })
})
