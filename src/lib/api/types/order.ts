import type { CartAdjustment, LineIssue, Toman } from './cart'

/**
 * Wire types of the order placement (`POST order/place/`) and the payment-link door the checkout
 * uses, copied from the order digest §2 and §3.1 (docs/backend-integration/order-payment.md),
 * verified against live JSON (2026-10-18). Pure types: safe in any bundle.
 */

export type OrderStatus =
  | 'awaiting_payment'
  | 'awaiting_review'
  | 'processing'
  | 'packing'
  | 'sent'
  | 'delivered'
  | 'cancelled'
  | 'returned'

/** Who takes the parcel: required when the cart has no saved address (every guest), forbidden when it has one. */
export interface OrderReceiverInput {
  first_name: string
  last_name: string
  /** 09… (Persian digits and +98 are accepted). */
  mobile: string
  email?: string
  /** Without the plaque and unit; ≤ 1000. */
  address: string
  plaque?: string
  unit?: string
  /** 10 digits: required here. */
  postal_code: string
  latitude?: number | null
  longitude?: number | null
}

/** The body: no amounts, no method, no shipping (all on the cart). */
export interface OrderPlacementRequest {
  receiver?: OrderReceiverInput
  /** The buyer's own number (a gift): read only with `receiver`. */
  customer_mobile?: string
  /** ≤ `CUSTOMER_NOTE_MAX`. */
  customer_note?: string
  /** The cart's `total` the shopper confirmed: a mismatch is a 409 `order_total_changed`. */
  expected_total: number
}

/** The backend's limit on `customer_note`. */
export const CUSTOMER_NOTE_MAX = 1000

/** 201: a new order; 200: the same shape, a replay of the order a retry already placed. */
export interface OrderPlacementResult {
  /** For `payment/order/<uuid>/intent/` (signed in) only. */
  uuid: string
  /** Exactly 10 digits, may start with 0: keep as a string. */
  order_code: string
  status: OrderStatus
  status_display: string
  placed_at: string
  item_count: number
  total: Toman
  /** A: includes the prepayment. */
  amount_charged_online: Toman
  /** D. */
  amount_to_collect_on_delivery: Toman
  /** P: already inside A, never added again. */
  prepayment: Toman
  /** A > 0. false: confirm at once with the `pay_on_delivery` intent. */
  requires_online_payment: boolean
  /** `${STOREFRONT_URL}/order/pay/<token>` (no trailing slash); the token is a guest credential. */
  payment_url: string | null
  payment_expires_at: string | null
}

/** `data.items` of 409 `order_item_unavailable`. */
export interface OrderItemUnavailable {
  variant_id: number
  product_name: string
  issue: LineIssue | string
  available_quantity: number
}

/** `data.adjustments` of 409 `order_cart_changed`. */
export type OrderCartAdjustment = CartAdjustment

/** `GET order/pay/<token>/` (and the cancel's answer). */
export interface OrderPaymentLink {
  order_code: string
  status: OrderStatus
  status_display: string
  placed_at: string
  item_count: number
  total: Toman
  prepayment: Toman
  amount_charged_online: Toman
  amount_to_collect_on_delivery: Toman
  amount_settled_online: Toman
  /** O: what a payment charges now. */
  amount_outstanding_online: Toman
  is_payable: boolean
  can_cancel: boolean
  expires_at: string | null
  open_attempt: unknown
}
