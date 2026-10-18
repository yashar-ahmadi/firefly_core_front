import type { Toman } from './cart'
import type { OrderStatus } from './order'

/**
 * Wire types of guest tracking (`POST order/track/`) and of the account's order detail
 * (`GET order/<code>/`), copied from the order digest §2 (docs/backend-integration/order-payment.md)
 * and verified against live JSON (2026-10-18: tests/fixtures/order-track.json and
 * order-detail-*.json). Unknown enum values are possible (treat them gracefully). Pure types:
 * safe in any bundle.
 */

/** The five piles of the customer's history (the account's tabs). */
export type OrderStatusGroup =
  'awaiting_payment' | 'in_progress' | 'delivered' | 'returned' | 'cancelled'
export type OrderChannel = 'website' | 'social_media' | 'store'
export type ProgressStepState = 'completed' | 'current' | 'upcoming'
export type ReviewState = 'reviewed' | 'awaiting' | 'unavailable'

/** `POST order/track/`: the body. Both digit-normalised; the mobile is the buyer's or the receiver's. */
export interface OrderTrackingRequest {
  order_code: string
  mobile_number: string
}

/**
 * Everything a guest is told: no address, receiver, lines, money breakdown, progress or
 * timeline (by design: OrderTrackingResultSerializer).
 */
export interface OrderTrackingResult {
  order_code: string
  status: OrderStatus
  status_display: string
  placed_at: string
  paid_at: string | null
  packed_at: string | null
  dispatched_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  returned_at: string | null
  postal_tracking_code: string | null
  item_count: number
  total: Toman
}

/** One step of the server's progress bar (§6.2): drawn exactly as sent. */
export interface ProgressStep {
  status: OrderStatus
  label: string
  state: ProgressStepState
  /** null for upcoming steps, and always for `awaiting_review`. */
  reached_at: string | null
}

export interface Progress {
  /** Cancelled or returned: the path cut after the furthest stage, then the ending (current). */
  is_terminal: boolean
  steps: ProgressStep[]
}

/** One row of the order's factual history, oldest first (§6.4). */
export interface OrderTimelineEntry {
  to_status: OrderStatus
  to_status_display: string
  created: string
}

export interface OrderLine {
  product_name: string
  variant_name: string | null
  sku: string | null
  brand_name: string | null
  unit_name: string | null
  /** null when the variant was deleted: no link. */
  product_slug: string | null
  image: string | null
  quantity: number
  unit_price: Toman
  unit_discount: Toman
  unit_final_price: Toman
  line_subtotal: Toman
  line_discount: Toman
  line_total: Toman
  weight_grams: number | null
  review_state: ReviewState
}

export interface OrderMilestones {
  confirmed_at: string | null
  packed_at: string | null
  dispatched_at: string | null
  delivered_at: string | null
  cancelled_at: string | null
  returned_at: string | null
}

export interface OrderMoney {
  goods_subtotal: Toman
  item_discount: Toman
  goods_total: Toman
  coupon_discount: Toman
  goods_payable: Toman
  shipping_cost: Toman
  packaging_cost: Toman
  shipping_discount: Toman
  tax_rate: string
  tax_amount: Toman
  cod_fee: Toman
  total: Toman
  total_savings: Toman
  prepayment: Toman
  amount_charged_online: Toman
  amount_to_collect_on_delivery: Toman
  amount_settled_online: Toman
  amount_settled_on_delivery: Toman
  amount_outstanding_online: Toman
}

export interface OrderCoupon {
  code: string | null
  title: string | null
  discount_type: 'percentage' | 'fixed_amount' | 'free_shipping' | null
  max_discount_amount: Toman | null
}

export interface OrderDestination {
  receiver_full_name: string
  /** E.164: «+989121234501». */
  receiver_mobile: string
  receiver_email: string | null
  province_name: string
  city_name: string
  address: string
  plaque: string | null
  unit: string | null
  postal_code: string | null
  /** Strings: «35.756400». */
  latitude: string | null
  longitude: string | null
}

/** What the account's list and an order's detail both say of an order (§2 `OrderSummaryBase`). */
export interface OrderSummaryBase {
  /**
   * For `payment/order/<uuid>/intent/` only: owner-scoped (the API answers it to this account's
   * session only), not a bearer credential; never logged all the same.
   */
  uuid: string
  order_code: string
  status: OrderStatus
  status_display: string
  status_group: OrderStatusGroup
  progress: Progress
  /** «province، city، address» (no plaque, unit or postal code). */
  address_summary: string
  placed_at: string
  /** Online money fully arrived; null for a confirmed pure pay-on-delivery order. */
  paid_at: string | null
  is_confirmed: boolean
  is_fully_paid: boolean
  total: Toman
  /** The units ordered (Σ quantities), not the lines. */
  item_count: number
  shipping_method_title: string
  postal_tracking_code: string | null
  /** Owes online money now (the deadline is not checked). */
  is_payable: boolean
  /**
   * Present until cancelled, even after payment or expiry; holds the link token (a bearer
   * credential). The account order's first render carries a marker instead (order-read.ts).
   */
  payment_url: string | null
  /** status === awaiting_payment. */
  can_cancel: boolean
}

/** One of an order's first lines, as the list shows it. */
export interface OrderLinePreview {
  product_name: string
  variant_name: string | null
  image: string | null
}

/** `GET order/list/` (paginated): no money breakdown, no payment deadline. */
export interface OrderListItem extends OrderSummaryBase {
  /** The first three lines at most. */
  item_preview: OrderLinePreview[]
}

/** `GET order/list/`'s orders (`sort`; anything else is a 400 `invalid_choice`). */
export type OrderSort = 'date-desc' | 'date-asc' | 'total-desc' | 'total-asc'

/** `GET order/<code>/qr-code/`: the bare order code, as a PNG data URL. */
export interface OrderQRCode {
  order_code: string
  encoded_value: string
  content_type: 'image/png'
  /** `data:image/png;base64,…` */
  qr_code: string
}

/** `GET order/<code>/` (the account's own orders only: 404 otherwise). */
export interface OrderDetail extends OrderSummaryBase {
  channel: OrderChannel
  customer_note: string | null
  delivery_min_days: number | null
  delivery_max_days: number | null
  freight_paid_by_recipient: boolean
  cash_on_delivery: boolean
  milestones: OrderMilestones
  money: OrderMoney
  coupon: OrderCoupon
  receiver: OrderDestination
  lines: OrderLine[]
  timeline: OrderTimelineEntry[]
}
