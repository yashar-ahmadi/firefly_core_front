import type { CartAdjustment, Toman } from './cart'

/**
 * Wire types of the checkout's cart endpoints (`cart/destination/`, `cart/shipping/option/list/`,
 * `cart/shipping/select/`), copied from the cart digest §4 (docs/backend-integration/
 * cart-address.md), verified against live JSON (2026-10-17). Pure types: safe in any bundle.
 */

/** One active shipping method, priced for this cart or refused with a `reason`. */
export interface ShippingOption {
  /** Sent to `cart/shipping/select/`. */
  code: string
  title: string
  /** Plain text. */
  description: string | null
  /** The only criterion for offering it: a price of 0 means nothing when this is false. */
  is_available: boolean
  reason: string | null
  /** 0 when unavailable, or with a free-shipping coupon. */
  price: Toman
  packaging_cost: Toman
  /** price + packaging_cost: what is shown next to the name. */
  total: Toman
  /** Business days; may be 0; null hides the delivery time. */
  delivery_min_days: number | null
  delivery_max_days: number | null
  /** `recipient`: «پس‌کرایه», the fare is collected at the door (never «رایگان»). */
  freight_payer: 'sender' | 'recipient'
  /** false: no COD box for it. */
  supports_cash_on_delivery: boolean
  cod_fee: Toman
  /** null: no ceiling. The list never checks it against this cart; the select does. */
  cod_max_amount: Toman | null
  /** 0..100 of the at-the-door amount, moved to the online payment. */
  prepayment_percentage: number
}

/** `GET cart/shipping/option/list/`: also carries a post-login merge's one-time adjustments. */
export interface ShippingOptionList {
  options: ShippingOption[]
  adjustments: CartAdjustment[]
}

/** `POST cart/destination/`: a saved address (signed in only), or a city (its province too). */
export type DestinationRequest = { address: number } | { province?: number; city: number }

/** `POST cart/shipping/select/`. */
export interface ShippingSelectionRequest {
  code: string
  cash_on_delivery?: boolean
}
