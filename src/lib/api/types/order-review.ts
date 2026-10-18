/**
 * Wire types of the purchases awaiting a review (`GET order/review/awaiting/list/`, paginated)
 * and of a purchase review (`POST order/<code>/review/`), copied from the order digest §2 and
 * §3.1.6–3.1.7 (docs/backend-integration/order-payment.md), verified against live JSON
 * (2026-10-18). Pure types: safe in any bundle.
 */

/** One product of a delivered order not reviewed yet (variants merged). */
export interface AwaitingReviewProduct {
  /** The id the review is sent with (`product_id`). */
  id: number
  name: string
  slug: string
  /** Absolute; the default picture when the product has none. */
  image: string
  /** The shopper reviewed this product before (another order): «ثبت دیدگاه جدید». */
  has_other_review: boolean
}

/** A delivered order with products still awaiting a review; newest delivery first. */
export interface AwaitingReviewOrder {
  order_code: string
  placed_at: string
  /** null for an order delivered before the stamp existed (listed last). */
  delivered_at: string | null
  products: AwaitingReviewProduct[]
}

/** `POST order/<code>/review/`: one review per order and product, forever. */
export interface PurchaseReviewRequest {
  product_id: number
  /** 1 to 5: required. */
  rating: number
  /** Required, not blank; ≤ 4096. */
  review: string
  /** ≤ 255; optional. */
  title?: string
  /** Each ≤ 10 items of ≤ 255, without repeats. */
  positive_points?: string[]
  negative_points?: string[]
}
