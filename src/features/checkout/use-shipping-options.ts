'use client'

import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect } from 'react'
import { notify } from '@/components/ui/toaster'
import { ADJUSTMENTS_TITLE, adjustmentText } from '@/features/cart/adjustments'
import { CART_KEY } from '@/features/cart/cart-cache'
import { ApiError } from '@/lib/api/errors'
import type { Cart } from '@/lib/api/types/cart'
import type { ShippingOptionList } from '@/lib/api/types/shipping'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { withSessionExpiry } from '@/lib/session/with-session-expiry'
import { checkoutApi } from './checkout-api'

// The shipping options of this cart (cart digest §3.9): read once the destination is set, and
// again whenever the cart changes in a way that can change them (its key holds what the rules
// read). Under `['cart']`: login and logout reset it with the cart (VIEWER_AWARE_QUERIES), and
// any re-read of the cart reads it too.

export const SHIPPING_OPTIONS_KEY = [...CART_KEY, 'shipping-options'] as const

/** What the options depend on: the destination, the lines, the coupon, the money and weight. */
export function optionsSignature(cart: Cart): string {
  const { destination } = cart
  return JSON.stringify([
    destination?.province_id ?? null,
    destination?.city_id ?? null,
    destination?.address?.id ?? null,
    cart.lines.map((line) => [line.variant_id, line.quantity]),
    cart.coupon.code,
    cart.goods_payable,
    cart.total_weight_grams,
  ])
}

/**
 * The list for `cart`, when `enabled`. A read that performed a post-login merge carries its
 * once-only `adjustments`: said in a toast (as the login's own merge does), and the cart is read
 * again (its lines changed). A cart that is gone is read again (empty); a session that is gone
 * ends (`useSessionExpired`: login, on the checkout).
 */
export function useShippingOptions(
  cart: Cart | undefined,
  enabled: boolean,
): UseQueryResult<ShippingOptionList> {
  const client = useQueryClient()
  const expire = useSessionExpired()
  const read = withSessionExpiry(async (signal: AbortSignal) => {
    try {
      return await checkoutApi.shippingOptions(signal)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'cart_not_found') {
        void client.invalidateQueries({ queryKey: CART_KEY, exact: true })
      }
      throw error
    }
  }, expire)
  const query = useQuery({
    queryKey: [...SHIPPING_OPTIONS_KEY, cart ? optionsSignature(cart) : null],
    queryFn: async ({ signal }) => {
      const list = await read(signal)
      if (list.adjustments.length > 0) {
        notify.info(ADJUSTMENTS_TITLE, {
          description: list.adjustments.map(adjustmentText).join(' '),
        })
        void client.invalidateQueries({ queryKey: CART_KEY, exact: true })
      }
      return list
    },
    enabled: enabled && cart !== undefined,
    // Prices are live: read again whenever the shipping step shows.
    staleTime: 0,
  })
  // A cart write stores its cart after cancelling the cart's reads in flight, this one's too
  // (`storeCart`): a read cancelled before it ever had data is started again.
  const { isPending, fetchStatus, refetch } = query
  const stranded = enabled && cart !== undefined && isPending && fetchStatus === 'idle'
  useEffect(() => {
    if (stranded) void refetch()
  }, [stranded, refetch])
  return query
}
