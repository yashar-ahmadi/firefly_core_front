import { useMutation, useQueryClient } from '@tanstack/react-query'
import { notify } from '@/components/ui/toaster'
import { ApiError } from '@/lib/api/errors'
import type { CartLine } from '@/lib/api/types/cart'
import { cartApi } from './api'
import { CART_KEY, CART_WRITES, errorDetail, storeCart } from './cart-cache'
import { isCartGone } from './coupon-hooks'
import { addToCartOnce } from './hooks'
import { tell } from './tell'

// Removing a line from the cart page, with «بازگردانی» (ruling P4-R1: a module of its own; the
// mini-cart removes with `useRemoveCartLine`, without undo).

/** How long the toast offers «بازگردانی» (Sonner waits while it is hovered or focused). */
export const UNDO_MS = 10_000

const isLineGone = (error: unknown) =>
  error instanceof ApiError && error.code === 'cart_item_not_found'

export interface RemoveLineWithUndo {
  /** Resolves true once the line is gone (or already was). Never rejects. */
  remove: (line: CartLine) => Promise<boolean>
  isPending: boolean
}

/**
 * `DELETE cart/item/{variant}/remove/` in the cart writes' scope. Once the returned cart is
 * stored, a toast names the product and offers «بازگردانی», which adds the same variant and
 * quantity back (`POST cart/item/add/`, the add's own refusal shown as any add's). One toast per
 * line: removing two lines leaves both undos. A line already gone is what the shopper wanted (the
 * cart is read again); a cart that is gone is read again (empty); any other refusal is said.
 */
export function useRemoveLineWithUndo(): RemoveLineWithUndo {
  const client = useQueryClient()
  const mutation = useMutation({
    scope: CART_WRITES,
    mutationFn: (line: CartLine) => cartApi.remove(line.variant_id),
    onSuccess: async ({ data }, line) => {
      await storeCart(client, data)
      const { variant_id: variant, quantity, product_name: name, image } = line
      tell(`«${name}» از سبد خرید حذف شد.`, {
        id: `cart-removed-${variant}`,
        duration: UNDO_MS,
        action: {
          label: 'بازگردانی',
          onClick: () => {
            void addToCartOnce(client, {
              variant,
              quantity,
              meta: { name, image },
              toast: false,
            }).then((added) => {
              if (added) tell(`«${name}» به سبد خرید برگشت.`)
            })
          },
        },
      })
    },
  })
  const remove = async (line: CartLine) => {
    try {
      await mutation.mutateAsync(line)
      return true
    } catch (error) {
      if (!isLineGone(error) && !isCartGone(error)) notify.error(errorDetail(error))
      void client.invalidateQueries({ queryKey: CART_KEY })
      return isLineGone(error)
    }
  }
  return { remove, isPending: mutation.isPending }
}
