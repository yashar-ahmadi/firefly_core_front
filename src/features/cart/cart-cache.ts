import type { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/errors'
import type { Cart } from '@/lib/api/types/cart'

// What the cart hooks share: the query key, the write scope, and storing a returned cart.

/** The query holding the `Cart`. */
export const CART_KEY = ['cart'] as const

/**
 * Every cart write shares this mutation scope, so they run one at a time in the order made:
 * each answer is the whole cart after that write, and a later write's answer must land last.
 */
export const CART_WRITES = { id: 'cart' }

const GENERIC_ERROR = 'خطایی رخ داد. لطفاً دوباره تلاش کنید.'

/** The API's Persian reason, else a generic sentence (a network failure, say). */
export const errorDetail = (error: unknown) =>
  error instanceof ApiError ? error.detail : GENERIC_ERROR

/** Stores a cart a write returned. A read still in flight is older, so it is dropped first. */
export async function storeCart(client: QueryClient, cart: Cart): Promise<void> {
  await client.cancelQueries({ queryKey: CART_KEY })
  client.setQueryData(CART_KEY, cart)
}
