/**
 * Wire types of the cart endpoints (`cart/*`), copied from the cart digest §4
 * (docs/backend-integration/cart-address.md), which was verified against live JSON.
 *
 * One difference from the digest: the BFF moves `data.token` into the httpOnly `ff_cart` cookie
 * and deletes it from the body, so the `Cart` the browser receives has no `token`. `ApiCart` is
 * the API's own shape, with it. Pure types: safe in any bundle.
 */

/** Always integer toman, never null in money fields. */
export type Toman = number
/** Always `website` from this API (operator carts may differ). */
export type CartChannel = 'website' | 'social_media' | 'store'
export type LineIssue =
  'unavailable' | 'insufficient_stock' | 'above_order_limit' | 'below_order_limit'
export type CouponDiscountType = 'percentage' | 'fixed_amount' | 'free_shipping'
export type CouponErrorCode =
  | 'coupon_invalid'
  | 'coupon_inactive'
  | 'coupon_not_started'
  | 'coupon_expired'
  | 'coupon_usage_limit_reached'
  | 'coupon_user_limit_reached'
  | 'coupon_first_order_only'
  | 'coupon_min_spend_not_met'
  | 'coupon_max_spend_exceeded'
  | 'coupon_not_applicable'

export interface CartLine {
  /** Use for the PUT and DELETE paths. */
  variant_id: number
  product_id: number
  product_name: string
  /** Builds the product page link. */
  product_slug: string
  /** e.g. «وزن بسته: ۵۰۰ گرم | طعم: کلاسیک»; null for a simple product. */
  variant_name: string | null
  sku: string | null
  /** Absolute URL, never null (variant, then product, then /static/defaults/default.png). */
  image: string
  /** «عدد», «کیلوگرم». */
  unit_name: string | null
  /** At least 1. */
  quantity: number
  /** Before the catalogue discount. */
  unit_price: Toman
  /** Active discount only (an expired window gives 0). */
  unit_discount: Toman
  /** unit_price - unit_discount: show big; equals the product API's final_price. */
  unit_final_price: Toman
  /** unit_price × quantity (struck through). */
  line_subtotal: Toman
  /** unit_discount × quantity. */
  line_discount: Toman
  /** unit_final_price × quantity (before the coupon). */
  line_total: Toman
  /** null: the store's default weight. */
  weight_grams: number | null
  /** The manual availability flag only; NOT a quantity guarantee. */
  in_stock: boolean
  /** The most this line can hold now; never null; ≤ order_limit_max (if set) and ≤ 10000. */
  available_quantity: number
  /** Why the line cannot be ordered as it is; null means OK. */
  issue: LineIssue | null
  /** 0 means unlimited. */
  order_limit_max: number
  /** 1 means no floor; the stepper starts here. */
  order_limit_min: number
}

/** Never null; with no coupon every field is null or 0. */
export interface CouponBlock {
  /** A code means a coupon is on the cart (NOT coupon_discount > 0). */
  code: string | null
  title: string | null
  /** null when detached. */
  discount_type: CouponDiscountType | null
  /** Equals the top-level coupon_discount; 0 for free_shipping. */
  amount: Toman
  /** Cap for percentage coupons. */
  max_discount_amount: Toman | null
  /** ONE-SHOT: present only in the response that detached the coupon. */
  detached_reason: CouponErrorCode | null
}

/** Never null. */
export interface ShippingBlock {
  code: string | null
  title: string | null
  is_selected: boolean
  /** Selected but not available: stale, force a new choice and show `reason`. */
  is_available: boolean
  /** Equals shipping_cost. */
  price: Toman
  /** Equals the top-level packaging_cost. */
  packaging_cost: Toman
  reason: string | null
  /** A property of the method: the recipient pays the fare on delivery. */
  freight_paid_by_recipient: boolean
  /** The shopper asked for COD and the method supports it. */
  cash_on_delivery: boolean
  cod_fee: Toman
}

/** The address book's address (digest §7). */
export interface Address {
  id: number
  title: string
  receiver_first_name: string
  receiver_last_name: string
  receiver_full_name: string
  /** E.164, «+989…». */
  receiver_mobile: string
  province: number
  province_name: string
  city: number
  city_name: string
  address: string
  plaque: string | null
  unit: string | null
  /** «استان، شهر، نشانی، پلاک X، واحد Y» (no postal code or receiver). */
  full_address: string
  /** "" or 10 Latin digits; never null. */
  postal_code: string
  /** Both or neither; JSON numbers with 6 decimals. */
  latitude: number | null
  longitude: number | null
  is_default: boolean
  /** ISO 8601 with +03:30. */
  created: string
  updated: string
}

export interface CartDestination {
  /** null for guests and for a raw province/city pair. */
  address: Address | null
  province_id: number | null
  province_name: string | null
  /** null only when the city was deleted: ask again. */
  city_id: number | null
  city_name: string | null
}

export interface CartAdjustment {
  variant_id: number
  product_name: string
  /** Both carts summed (merge), or order quantity plus existing (reorder). */
  requested: number
  /** Always less than requested. */
  applied: number
  /** applied === 0: the line was removed entirely. */
  was_dropped: boolean
}

/** The priced cart every cart call returns, as the browser receives it (no `token`). */
export interface Cart {
  channel: CartChannel
  /** Σ quantities: the badge. */
  item_count: number
  /** lines.length === 0. */
  is_empty: boolean
  /** No line has an issue (true for an empty cart too). */
  is_orderable: boolean
  lines: CartLine[]
  goods_subtotal: Toman
  item_discount: Toman
  /** goods_subtotal - item_discount; the coupon's min/max spend basis. */
  goods_total: Toman
  coupon: CouponBlock
  coupon_discount: Toman
  /** max(0, goods_total - coupon_discount); the tax basis and the shipping rules' money basis. */
  goods_payable: Toman
  shipping: ShippingBlock
  shipping_cost: Toman
  packaging_cost: Toman
  /** Fare waived by a free-shipping coupon (only with a selected, available method). */
  shipping_discount: Toman
  /** percentage_of(goods_payable, tax_rate). */
  tax_amount: Toman
  cod_fee: Toman
  total: Toman
  /** The online share BEFORE prepayment (informational). */
  amount_payable_online: Toman
  /** The door share BEFORE prepayment (informational). */
  amount_due_on_delivery: Toman
  /** Moved from the door to the online payment. */
  prepayment: Toman
  /** The gateway amount. */
  amount_charged_online: Toman
  /** What the courier collects. */
  amount_to_collect_on_delivery: Toman
  /** item_discount + coupon_discount + shipping_discount. */
  total_savings: Toman
  total_weight_grams: number
  destination: CartDestination | null
  /** Almost always []. */
  adjustments: CartAdjustment[]
}

/** The API's own cart: `token` is "" when there is no cart. Only the BFF ever sees it. */
export interface ApiCart extends Cart {
  token: string
}

/** `POST cart/item/add/`: `quantity` is 1..10000, default 1. Additive, so never auto-retry. */
export interface CartItemAddRequest {
  variant: number
  quantity?: number
}

/** `PUT cart/item/{variant_id}/`: the absolute quantity, 0..10000 (0 removes the line). */
export interface CartItemQuantityRequest {
  quantity: number
}

/** A line of the old order that is no longer sold (deleted variant, unpublished product). */
export interface ReorderSkippedLine {
  product_name: string
  variant_name: string | null
}

/**
 * `POST cart/reorder/` (signed in, 10/min, NOT idempotent: cart digest §3.12): the cart after the
 * order's lines were added. `added_lines` counts the variants whose quantity grew (build the
 * sentence from it, never from `msg`); `adjustments` and `reorder_skipped` come back once only.
 */
export interface CartReorderResult extends Cart {
  added_lines: number
  reorder_skipped: ReorderSkippedLine[]
}
