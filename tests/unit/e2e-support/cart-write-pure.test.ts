import { describe, expect, it } from 'vitest'
import { cartState, lockLogged } from '../../e2e/support/cart-write'
import { cart, line, lockRecord } from './cart-write-support'

// The cart-write helper's pure parts (tests/e2e/support/cart-write.ts): finding the dev SQLite
// lock in the backend's log, and what of a cart a failed write must have left as it was.

describe('lockLogged', () => {
  it('finds the lock in the error record of this API path', () => {
    expect(lockLogged(lockRecord('cart/item/add/'), 'cart/item/add/')).toBe(true)
  })

  it('ignores another path’s lock, and another error of this path', () => {
    expect(lockLogged(lockRecord('cart/clear/'), 'cart/item/add/')).toBe(false)
    const other = lockRecord('cart/item/add/').replaceAll('database is locked', 'no such table')
    expect(lockLogged(other, 'cart/item/add/')).toBe(false)
    expect(lockLogged('', 'cart/item/add/')).toBe(false)
  })
})

describe('cartState', () => {
  it('keeps what a write changes: lines, coupon, shipping choice, destination', () => {
    const before = cart([line(2, 1), line(1, 2)])
    expect(cartState(before)).toBe(cartState(cart([line(1, 2), line(2, 1)])))
    expect(cartState(before)).not.toBe(cartState(cart([line(1, 2)])))
    expect(cartState({ ...before, coupon: { code: 'TEA30' } })).not.toBe(cartState(before))
    expect(cartState({ ...before, destination: { city_id: 301 } })).not.toBe(cartState(before))
  })
})
