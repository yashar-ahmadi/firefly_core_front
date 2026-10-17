import type { Cart } from '@/lib/api/types/cart'
import couponMinSpend from '../../fixtures/cart-coupon-min-spend.json'
import couponInvalid from '../../fixtures/cart-coupon-invalid.json'
import couponCart from '../../fixtures/cart-guest-coupon.json'
import emptyCart from '../../fixtures/cart-guest-empty.json'
import freeshipCart from '../../fixtures/cart-guest-freeship.json'
import itemsCart from '../../fixtures/cart-guest-items.json'
import notFound from '../../fixtures/cart-not-found.json'

// Guest carts captured live from the dev API (2026-10-17, a fresh guest cart token, never an
// account; the token stripped as the BFF strips it): tea 500 g × 2 (variant 10119) and instant
// coffee × 1 (variant 10123), then TEA30 (30% of the Ahmad Tea lines, capped at 200,000),
// FREESHIP (free shipping, min spend 2,000,000) and the empty cart. The error envelopes are
// the API's own answers to `VIP1M` (min spend 20,000,000), an unknown code, and a write with a
// dead cart token.

interface Envelope<T> {
  msg: string
  code: number
  data: T
}

const copy = <T>(value: unknown): T => structuredClone(value) as T

/** tea × 2 and coffee × 1, no coupon: goods 2,130,000, tax 213,000, total 2,343,000. */
export const itemsEnvelope = () => copy<Envelope<Cart>>(itemsCart)
/** The same with TEA30 (`coupon/apply/`): coupon 200,000, total 2,123,000. */
export const couponEnvelope = () => copy<Envelope<Cart>>(couponCart)
/** The same with FREESHIP instead: `coupon_discount` 0, the saving only after a shipping choice. */
export const freeshipEnvelope = () => copy<Envelope<Cart>>(freeshipCart)
/** `GET cart/` without a cart. */
export const emptyEnvelope = () => copy<Envelope<Cart>>(emptyCart)

export const itemsCartFixture = (changes: Partial<Cart> = {}): Cart => ({
  ...itemsEnvelope().data,
  ...changes,
})
export const couponCartFixture = (changes: Partial<Cart> = {}): Cart => ({
  ...couponEnvelope().data,
  ...changes,
})
export const freeshipCartFixture = (changes: Partial<Cart> = {}): Cart => ({
  ...freeshipEnvelope().data,
  ...changes,
})
export const emptyCartFixture = (): Cart => emptyEnvelope().data

/** 400 `coupon_min_spend_not_met` (VIP1M), the API's body. */
export const couponMinSpendBody = () => copy<Record<string, unknown>>(couponMinSpend)
/** 400 `coupon_invalid`. */
export const couponInvalidBody = () => copy<Record<string, unknown>>(couponInvalid)
/** 404 `cart_not_found` (a write with a dead guest token). */
export const cartNotFoundBody = () => copy<Record<string, unknown>>(notFound)
