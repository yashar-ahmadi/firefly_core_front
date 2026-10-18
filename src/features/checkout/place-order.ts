import { bffFetch } from '@/lib/api/client'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { CartAdjustment } from '@/lib/api/types/cart'
import type {
  OrderItemUnavailable,
  OrderPlacementRequest,
  OrderPlacementResult,
  OrderReceiverInput,
} from '@/lib/api/types/order'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import type { GuestField } from './guest-receiver'

// `POST order/place/` through the BFF (order digest §3.1.1, §5.1–5.2, §8.1): it sends the guest's
// cart token or the session. The body carries no amounts, method or shipping (all on the cart):
// a guest's receiver (never one for a cart with a saved address: `order_receiver_forbidden`),
// the buyer's own mobile with it, the note and `expected_total`, the cart's `total` the shopper
// confirmed. The placement key goes as the Idempotency-Key. Every refusal becomes what the page
// does about it (`PlacementError.problem`); a total that changed is its own `TotalChangedError`
// (the "total changed" dialog). A 500 the backend says may pass is sent once more, same key.

export type PlacementProblem =
  /** 409 `order_total_changed`: re-read the cart, confirm the new total. */
  | 'total_changed'
  /** `order_cart_empty`: back to the cart. */
  | 'cart_empty'
  /** `order_destination_required`: the receiver step. */
  | 'destination'
  /** `order_shipping_method_required`/`_unavailable`: the shipping step, its options read again. */
  | 'shipping'
  /** `order_receiver_required`, `receiver.*` checks: the guest form, its fields marked. */
  | 'receiver'
  /** `order_receiver_forbidden`: a receiver for a cart with a saved address (a client bug). */
  | 'receiver_forbidden'
  /** The note's own check (`customer_note`). */
  | 'note'
  /** A coupon or the stock changed meanwhile: re-read the cart, show what changed. */
  | 'cart_refresh'
  /** `order_item_unavailable`: mark `items` in the cart and go back there. */
  | 'items_unavailable'
  /** `order_cart_changed`: re-read, choose shipping again, show `adjustments`, confirm again. */
  | 'cart_changed'
  /** `order_unpaid_limit_reached`: the detail as it is, and the way to those orders. */
  | 'unpaid_limit'
  /** `cart_not_found`: back to the shop. */
  | 'cart_gone'
  /** 500 twice: support. */
  | 'server'
  /** 503 `feature_disabled` (guest_checkout): log in or register. */
  | 'guest_closed'
  /** 429: wait `retryAfter`. */
  | 'throttled'
  /** 401: the session is gone. */
  | 'session'
  /** `order_idempotency_key_invalid` (a client bug). */
  | 'invalid_key'
  | 'other'

const PROBLEMS: Record<string, PlacementProblem> = {
  order_total_changed: 'total_changed',
  order_cart_empty: 'cart_empty',
  order_destination_required: 'destination',
  order_shipping_method_required: 'shipping',
  order_shipping_method_unavailable: 'shipping',
  order_receiver_required: 'receiver',
  order_receiver_forbidden: 'receiver_forbidden',
  order_coupon_no_longer_valid: 'cart_refresh',
  coupon_usage_limit_reached: 'cart_refresh',
  coupon_user_limit_reached: 'cart_refresh',
  order_out_of_stock: 'cart_refresh',
  order_stock_reservation_failed: 'cart_refresh',
  order_item_unavailable: 'items_unavailable',
  order_cart_changed: 'cart_changed',
  order_unpaid_limit_reached: 'unpaid_limit',
  order_idempotency_key_invalid: 'invalid_key',
  cart_not_found: 'cart_gone',
}

/** The 500s the backend says another try may pass (digest §8.1). */
const RETRY_ONCE = new Set(['order_money_snapshot_invalid', 'order_code_unavailable'])

/** The API's receiver attributes as the guest form's fields. */
const RECEIVER_FIELDS: Record<string, GuestField> = {
  'receiver.first_name': 'firstName',
  'receiver.last_name': 'lastName',
  'receiver.mobile': 'mobile',
  'receiver.address': 'address',
  'receiver.plaque': 'plaque',
  'receiver.unit': 'unit',
  'receiver.postal_code': 'postalCode',
  customer_mobile: 'customerMobile',
}

const SUPPORT = 'ثبت سفارش انجام نشد. لطفاً کمی بعد دوباره تلاش کنید یا با پشتیبانی تماس بگیرید.'

export class PlacementError extends Error {
  readonly problem: PlacementProblem
  /** What to say (the API's Persian detail, or a sentence of ours). */
  readonly detail: string
  /** The guest form's fields the API refused, with its messages. */
  readonly fields: Partial<Record<GuestField, string>>
  readonly items: OrderItemUnavailable[]
  readonly adjustments: CartAdjustment[]
  readonly retryAfter: number | null

  constructor(problem: PlacementProblem, cause: unknown, detail?: string) {
    const api = cause instanceof ApiError ? cause : null
    const message = detail ?? api?.detail ?? GENERIC_ERROR_DETAIL
    super(message, { cause })
    this.name = 'PlacementError'
    this.problem = problem
    this.detail = message
    this.fields = {}
    for (const { attr, detail: text } of api?.errors ?? []) {
      const field = attr ? RECEIVER_FIELDS[attr] : undefined
      if (field && !this.fields[field]) this.fields[field] = text
    }
    this.items = Array.isArray(api?.data.items) ? (api.data.items as OrderItemUnavailable[]) : []
    this.adjustments = Array.isArray(api?.data.adjustments)
      ? (api.data.adjustments as CartAdjustment[])
      : []
    this.retryAfter = api?.retryAfter ?? null
  }
}

/** 409 `order_total_changed`: nothing was created; the same key is fine for the next try. */
export class TotalChangedError extends PlacementError {
  constructor(cause: unknown) {
    super('total_changed', cause)
    this.name = 'TotalChangedError'
  }
}

function problemOf(error: unknown): PlacementError {
  // First: a session gone is never a branch of its own code.
  if (isSessionExpiredError(error)) return new PlacementError('session', error)
  if (!(error instanceof ApiError)) return new PlacementError('other', error)
  if (error.code === 'order_total_changed') return new TotalChangedError(error)
  const known = PROBLEMS[error.code]
  if (known) return new PlacementError(known, error)
  if (error.status === 429) return new PlacementError('throttled', error)
  if (error.isFeatureDisabled()) return new PlacementError('guest_closed', error)
  if (error.errors.some(({ attr }) => attr === 'customer_note')) {
    return new PlacementError('note', error)
  }
  if (error.errors.some(({ attr }) => attr !== null && attr in RECEIVER_FIELDS)) {
    return new PlacementError('receiver', error)
  }
  if (RETRY_ONCE.has(error.code)) return new PlacementError('server', error, SUPPORT)
  return new PlacementError('other', error)
}

export interface PlaceOrderInput {
  isGuest: boolean
  /** A guest's (the cart has no saved address). Dropped for a signed-in shopper. */
  receiver?: OrderReceiverInput
  /** The buyer's own mobile (only with a receiver). */
  customerMobile?: string
  note?: string
  /** The cart's `total` on screen. */
  expectedTotal: number
  /** The placement key. */
  key: string
}

export interface PlacedOrder {
  order: OrderPlacementResult
  /** 200: a retry met the order it had already placed. */
  replayed: boolean
}

function bodyOf(input: PlaceOrderInput): OrderPlacementRequest {
  const body: OrderPlacementRequest = { expected_total: input.expectedTotal }
  // A cart with a saved address (every signed-in checkout here) must not get one.
  if (input.isGuest && input.receiver) {
    body.receiver = input.receiver
    const own = input.customerMobile?.trim()
    if (own) body.customer_mobile = own
  }
  const note = input.note?.trim()
  if (note) body.customer_note = note
  return body
}

/** Places the order; throws `PlacementError` (or `TotalChangedError`) for every refusal. */
export async function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  const send = () =>
    bffFetch<OrderPlacementResult>('order/place/', {
      method: 'POST',
      idempotencyKey: input.key,
      body: bodyOf(input),
    })
  try {
    let answer
    try {
      answer = await send()
    } catch (error) {
      if (!(error instanceof ApiError && RETRY_ONCE.has(error.code))) throw error
      answer = await send()
    }
    return { order: answer.data, replayed: answer.status === 200 }
  } catch (error) {
    throw problemOf(error)
  }
}
