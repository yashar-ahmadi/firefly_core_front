import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  findGuestOrder,
  findGuestOrderByToken,
  GUEST_ORDER_MAX_AGE_MS,
  GUEST_ORDERS_KEY,
  pruneGuestOrders,
  readGuestOrders,
  removeGuestOrder,
  saveGuestOrder,
  type GuestOrder,
} from '@/features/orders/guest-orders'
import { linkTokenOf, payLinkPath } from '@/features/orders/pay-link'

// A guest's recent orders (order digest §5.2; Plan 4 Global Constraints): the last 10 in
// `ff-guest-orders`, newest first, the guest's only way back to them on this device besides the
// SMS. A storage that refuses never throws. Each is kept 30 days on this device (Plan 4 final fix
// wave): its link only pays or cancels until the payment deadline (72 h, a week after a receipt),
// and the code stays a month for tracking; the link's URL is never kept twice (`payLinkPath`).

const DAY = 24 * 60 * 60 * 1000
const order = (code: string, changes: Partial<GuestOrder> = {}): GuestOrder => ({
  orderCode: code,
  linkToken: `token-${code}`,
  expiresAt: '2026-10-21T05:38:01.005632+03:30',
  A: 1_049_000,
  D: 0,
  placedAt: new Date(Date.now() - 60_000).toISOString(),
  ...changes,
})
/** What the store holds for `order` saved now (its time on this device added). */
const kept = (code: string, changes: Partial<GuestOrder> = {}) => ({
  ...order(code, changes),
  savedAt: expect.any(Number),
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
    expect(readGuestOrders()[0]).toEqual(kept('1000000005', { A: 5 }))
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

describe('kept 30 days on this device', () => {
  it('the bound: 30 days', () => {
    expect(GUEST_ORDER_MAX_AGE_MS).toBe(30 * DAY)
  })

  it('an order kept longer is no longer read, and the next write drops it from storage', () => {
    const old = { ...order('1000000001'), savedAt: Date.now() - 31 * DAY }
    localStorage.setItem(GUEST_ORDERS_KEY, JSON.stringify([old]))
    expect(readGuestOrders()).toEqual([])
    expect(findGuestOrderByToken('token-1000000001')).toBeNull()
    saveGuestOrder(order('1000000002'))
    const stored = JSON.parse(localStorage.getItem(GUEST_ORDERS_KEY)!) as GuestOrder[]
    expect(stored.map((item) => item.orderCode)).toEqual(['1000000002'])
  })

  it('pruning on its own drops the old ones and keeps the rest', () => {
    const old = { ...order('1000000001'), savedAt: Date.now() - 31 * DAY }
    const young = { ...order('1000000002'), savedAt: Date.now() - 29 * DAY }
    localStorage.setItem(GUEST_ORDERS_KEY, JSON.stringify([young, old]))
    pruneGuestOrders()
    const stored = JSON.parse(localStorage.getItem(GUEST_ORDERS_KEY)!) as GuestOrder[]
    expect(stored.map((item) => item.orderCode)).toEqual(['1000000002'])
  })

  it('an entry kept before (its payment URL kept twice, no time): read, timed by its placement, rewritten without the URL', () => {
    const legacy = (code: string, placedAt: string) => ({
      ...order(code, { placedAt }),
      paymentUrl: `http://localhost:3000/order/pay/token-${code}`,
    })
    localStorage.setItem(
      GUEST_ORDERS_KEY,
      JSON.stringify([
        legacy('1000000001', new Date(Date.now() - DAY).toISOString()),
        legacy('1000000002', new Date(Date.now() - 31 * DAY).toISOString()),
      ]),
    )
    expect(readGuestOrders().map((item) => item.orderCode)).toEqual(['1000000001'])
    expect(readGuestOrders()[0]).not.toHaveProperty('paymentUrl')
    expect(findGuestOrder('1000000001')?.linkToken).toBe('token-1000000001')
    saveGuestOrder(order('1000000003'))
    const stored = localStorage.getItem(GUEST_ORDERS_KEY)!
    expect(stored).not.toContain('paymentUrl')
    expect((JSON.parse(stored) as GuestOrder[]).map((item) => item.orderCode)).toEqual([
      '1000000003',
      '1000000001',
    ])
  })
})

describe('on the tracking page', () => {
  it('finds an order by its link token, and forgets one order («حذف از این دستگاه»)', () => {
    saveGuestOrder(order('1000000001', { linkToken: 'token-one' }))
    saveGuestOrder(order('1000000002', { linkToken: 'token-two', total: 359_000 }))
    expect(findGuestOrderByToken('token-one')?.orderCode).toBe('1000000001')
    expect(findGuestOrderByToken('nope')).toBeNull()
    expect(findGuestOrder('1000000002')?.total).toBe(359_000)
    expect(removeGuestOrder('1000000002')).toBe(true)
    expect(readGuestOrders().map((item) => item.orderCode)).toEqual(['1000000001'])
  })

  it('an entry with a total that is not a number is not ours', () => {
    localStorage.setItem(GUEST_ORDERS_KEY, JSON.stringify([{ ...order('1000000001'), total: '1' }]))
    expect(readGuestOrders()).toEqual([])
  })

  it('a refusing storage: the removal says so, never throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(removeGuestOrder('1000000001')).toBe(false)
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
