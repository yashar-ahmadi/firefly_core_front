import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tell } from '@/components/ui/tell'
import { notify } from '@/components/ui/toaster'
import { bffFetch } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import type { Cart } from '@/lib/api/types/cart'
import { toLatinDigits } from '@/lib/format'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import type { CartResult } from './api'
import { CART_KEY, CART_WRITES, errorDetail, storeCart } from './cart-cache'

// The cart page's coupon writes (cart digest §3.6–3.7), in a module of their own: the mini-cart
// and the catalog never load them (ruling P4-R1). They run in the cart writes' scope, so they
// wait for a quantity change or a removal still on its way, and store the cart they get back.

/** The API's limit for a code (31 characters answer `max_length`). */
export const COUPON_MAX_LENGTH = 30

/** A code as the API reads it: Persian or Arabic digits as Latin, trimmed, upper case. */
export function normaliseCouponCode(raw: string): string {
  return toLatinDigits(raw).trim().toUpperCase()
}

const REMOVED = 'کوپن تخفیف حذف شد.'

/** The guest cart behind the cookie is gone (the BFF has dropped the cookie): the cart is empty. */
export const isCartGone = (error: unknown) =>
  error instanceof ApiError && error.code === 'cart_not_found'

export interface ApplyCoupon {
  /**
   * `POST cart/coupon/apply/` with a normalised code. Resolves with the API's answer once the
   * cart it returned is stored (nothing is said here: the coupon box moves the focus to the
   * applied coupon, which says it); rejects with the refusal (`coupon_*`, a 429, `503
   * feature_disabled`, a session that is gone) for the caller to show. A cart that is gone is
   * read again (empty), and the code is never sent again by itself.
   */
  apply: (code: string) => Promise<CartResult>
  isPending: boolean
}

export function useApplyCoupon(): ApplyCoupon {
  const client = useQueryClient()
  const mutation = useMutation({
    scope: CART_WRITES,
    mutationFn: (code: string) =>
      bffFetch<Cart>('cart/coupon/apply/', { method: 'POST', body: { code } }),
    onSuccess: ({ data }) => storeCart(client, data),
    onError: (error) => {
      if (isCartGone(error)) void client.invalidateQueries({ queryKey: CART_KEY })
    },
  })
  return { apply: (code) => mutation.mutateAsync(code), isPending: mutation.isPending }
}

export interface RemoveCoupon {
  /** `DELETE cart/coupon/remove/`; resolves true once done. Never rejects: a refusal is said. */
  remove: () => Promise<boolean>
  isPending: boolean
}

/**
 * Removes the cart's coupon (never switched off with `coupons`: a coupon on the cart can always
 * go). A refusal shows its detail and reads the cart again; a cart that is gone only reads it; a
 * session that is gone ends here too (`useSessionExpired`).
 */
export function useRemoveCoupon(): RemoveCoupon {
  const client = useQueryClient()
  const expire = useSessionExpired()
  const mutation = useMutation({
    scope: CART_WRITES,
    mutationFn: () => bffFetch<Cart>('cart/coupon/remove/', { method: 'DELETE' }),
    onSuccess: async ({ data, msg }) => {
      await storeCart(client, data)
      tell(msg || REMOVED)
    },
  })
  const remove = async () => {
    try {
      await mutation.mutateAsync()
      return true
    } catch (error) {
      if (isSessionExpiredError(error)) expire()
      else if (!isCartGone(error)) notify.error(errorDetail(error))
      void client.invalidateQueries({ queryKey: CART_KEY })
      return false
    }
  }
  return { remove, isPending: mutation.isPending }
}
