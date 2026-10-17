import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notify } from '@/components/ui/toaster'
import { cartApi } from './api'
import { CART_KEY, CART_WRITES, errorDetail, storeCart } from './cart-cache'
import { isCartGone } from './coupon-hooks'
import { tell } from './tell'

// Clearing the cart from the cart page (cart digest §3.5), in a module of its own (ruling
// P4-R1). The lines, the coupon and the shipping choice go; the destination stays.

const CLEARED = 'سبد خرید خالی شد.'

export interface ClearCart {
  /** `DELETE cart/clear/`; resolves true once the empty cart is stored. Never rejects. */
  clear: () => Promise<boolean>
  isPending: boolean
}

/**
 * Runs in the cart writes' scope (after any change still on its way) and stores the empty cart
 * the API returns, with its message. A cart that is gone is empty already: it is read again. Any
 * other refusal shows its detail and reads the cart again.
 */
export function useClearCart(): ClearCart {
  const client = useQueryClient()
  const mutation = useMutation({
    scope: CART_WRITES,
    mutationFn: () => cartApi.clear(),
    onSuccess: async ({ data, msg }) => {
      await storeCart(client, data)
      tell(msg || CLEARED)
    },
  })
  const clear = async () => {
    try {
      await mutation.mutateAsync()
      return true
    } catch (error) {
      if (!isCartGone(error)) notify.error(errorDetail(error))
      void client.invalidateQueries({ queryKey: CART_KEY })
      return false
    }
  }
  return { clear, isPending: mutation.isPending }
}
