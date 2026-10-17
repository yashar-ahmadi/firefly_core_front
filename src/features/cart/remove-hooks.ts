import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tell } from '@/components/ui/tell'
import { notify } from '@/components/ui/toaster'
import { ApiError } from '@/lib/api/errors'
import type { CartLine } from '@/lib/api/types/cart'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { cartApi } from './api'
import { CART_KEY, CART_WRITES, errorDetail, storeCart } from './cart-cache'
import { isCartGone } from './coupon-hooks'
import { addToCartOnce } from './hooks'

// Removing a line from the cart page, with «بازگردانی» (ruling P4-R1: a module of its own; the
// mini-cart removes with `useRemoveCartLine`, without undo).

/** How long the toast offers «بازگردانی» (Sonner waits while it is hovered or focused). */
export const UNDO_MS = 10_000

const isLineGone = (error: unknown) =>
  error instanceof ApiError && error.code === 'cart_item_not_found'

export interface UndoCallbacks {
  /** «بازگردانی» was pressed: its toast is closing (the focus must go somewhere). */
  onUndo?: (line: CartLine) => void
  /** The line is back in the cart (stored). */
  onRestored?: (line: CartLine) => void
}

export interface RemoveLineWithUndo {
  /** Resolves true once the line is gone (or already was). Never rejects. */
  remove: (line: CartLine) => Promise<boolean>
  isPending: boolean
}

/**
 * `DELETE cart/item/{variant}/remove/` in the cart writes' scope. Once the returned cart is
 * stored, a toast names the product and offers «بازگردانی», which adds the same variant and
 * quantity back (`POST cart/item/add/`, the add's own refusal shown as any add's) once only: the
 * closing toast stays pressable for a moment, and an add is never repeated (it adds up). One
 * toast per line: removing two lines leaves both undos. A line already gone is what the shopper
 * wanted (the cart is read again); a cart that is gone is read again (empty); a session that is
 * gone ends here too; any other refusal is said.
 */
export function useRemoveLineWithUndo({
  onUndo,
  onRestored,
}: UndoCallbacks = {}): RemoveLineWithUndo {
  const client = useQueryClient()
  const expire = useSessionExpired()
  const mutation = useMutation({
    scope: CART_WRITES,
    mutationFn: (line: CartLine) => cartApi.remove(line.variant_id),
    onSuccess: async ({ data }, line) => {
      await storeCart(client, data)
      const { variant_id: variant, quantity, product_name: name, image } = line
      let undone = false
      const undo = async () => {
        if (undone) return
        undone = true
        onUndo?.(line)
        const meta = { name, image }
        if (!(await addToCartOnce(client, { variant, quantity, meta, toast: false }))) return
        tell(`«${name}» به سبد خرید برگشت.`)
        onRestored?.(line)
      }
      tell(`«${name}» از سبد خرید حذف شد.`, 'success', {
        id: `cart-removed-${variant}`,
        duration: UNDO_MS,
        action: { label: 'بازگردانی', onClick: () => void undo() },
      })
    },
  })
  const remove = async (line: CartLine) => {
    try {
      await mutation.mutateAsync(line)
      return true
    } catch (error) {
      if (isSessionExpiredError(error)) expire()
      else if (!isLineGone(error) && !isCartGone(error)) notify.error(errorDetail(error))
      void client.invalidateQueries({ queryKey: CART_KEY })
      return isLineGone(error)
    }
  }
  return { remove, isPending: mutation.isPending }
}
