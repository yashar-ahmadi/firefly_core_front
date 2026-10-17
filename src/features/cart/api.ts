import { bffFetch, type BffFetchResult } from '@/lib/api/client'
import type { Cart, CartItemAddRequest, CartItemQuantityRequest } from '@/lib/api/types/cart'

// The cart endpoints, called from the browser through the BFF. The BFF owns the guest cart
// token: it sends the httpOnly `ff_cart` cookie as `X-Cart-Token`, stores the token a response
// carries and clears it when the cart is gone, so nothing here ever sees a token.
// Every call answers with the whole priced cart (cart digest §3); render straight from it.

export type CartResult = BffFetchResult<Cart>

export const cartApi = {
  /** `GET cart/`: a guest without a cart gets an empty cart (200), never an error. */
  get: (signal?: AbortSignal): Promise<CartResult> => bffFetch<Cart>('cart/', { signal }),

  /** `POST cart/item/add/`: adds to the variant's line (limits apply to the sum). */
  add: (variant: number, quantity: number): Promise<CartResult> =>
    bffFetch<Cart>('cart/item/add/', {
      method: 'POST',
      body: { variant, quantity } satisfies CartItemAddRequest,
    }),

  /** `PUT cart/item/{variant}/`: the absolute quantity. Any PUT clears the shipping choice. */
  setQuantity: (variant: number, quantity: number): Promise<CartResult> =>
    bffFetch<Cart>(`cart/item/${variant}/`, {
      method: 'PUT',
      body: { quantity } satisfies CartItemQuantityRequest,
    }),

  /** `DELETE cart/item/{variant}/remove/`. */
  remove: (variant: number): Promise<CartResult> =>
    bffFetch<Cart>(`cart/item/${variant}/remove/`, { method: 'DELETE' }),

  /** `DELETE cart/clear/`: drops the lines, the coupon and the shipping choice. */
  clear: (): Promise<CartResult> => bffFetch<Cart>('cart/clear/', { method: 'DELETE' }),

  /**
   * `POST cart/merge/`, once, right after a login: the BFF sends the guest cart token with this
   * call only (then drops it), and the answer is the user's cart with its one-time
   * `adjustments` (cart digest §3.11).
   */
  merge: (): Promise<CartResult> => bffFetch<Cart>('cart/merge/', { method: 'POST' }),
}
