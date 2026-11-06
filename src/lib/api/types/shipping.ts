import type { CartAdjustment, Toman } from './cart'

/**
 * Wire types of the checkout's cart endpoints (`cart/destination/`, `cart/shipping/option/list/`,
 * `cart/shipping/select/`), copied from the cart digest §4 (docs/backend-integration/
 * cart-address.md), verified against live JSON (2026-10-17; the COD verdict 2026-11-06). Pure
 * types: safe in any bundle.
 */

/**
 * Why `cart/shipping/select/` would refuse this option with `cash_on_delivery: true`, in the
 * order it asks (cart digest §3.9–3.10): `pay_on_delivery` off, the option itself unavailable, a
 * method that collects nothing at the door, nothing online with the shop's «پرداخت در محل»
 * payment method off (`cart_cod_route_disabled`), the door amount over `cod_max_amount`.
 */
export type CodRefusal =
  | 'feature_disabled'
  | 'cart_shipping_method_unavailable'
  | 'cart_cod_not_supported'
  | 'cart_cod_route_disabled'
  | 'cart_cod_limit_exceeded'

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
  /**
   * The door ceiling for THIS cart with THIS option (null: none, or `pay_on_delivery` off): the
   * method's own, and with nothing charged online the lower of it and the «پرداخت در محل»
   * payment method's. It may differ between two options of one cart; never compared here.
   */
  cod_max_amount: Toman | null
  /** 0..100 of the at-the-door amount, moved to the online payment. */
  prepayment_percentage: number
  /**
   * The select would take this option with `cash_on_delivery: true` for this cart now (absent
   * from an API older than the 2026-11-05 round: `supports_cash_on_delivery` stands in, and the
   * select's refusal says the rest).
   */
  cash_on_delivery_available?: boolean
  /** Why it would not (null when it would): the select's own code. Absent as the one above. */
  cash_on_delivery_refusal?: CodRefusal | null
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
