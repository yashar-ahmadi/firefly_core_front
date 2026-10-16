import {
  MutationObserver,
  useMutation,
  useQuery,
  useQueryClient,
  type MutationOptions,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useRef } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { notify } from '@/components/ui/toaster'
import { useHydrated } from '@/components/ui/use-media-query'
import { ApiError } from '@/lib/api/errors'
import type { Cart, CartLine } from '@/lib/api/types/cart'
import { cartApi } from './api'
import { CART_KEY, CART_WRITES, errorDetail, storeCart } from './cart-cache'
import { showAddedToCartToast } from './components/added-to-cart-toast'

// The shopper's cart in Client Components. Pages are cached for everyone, so the cart is read on
// the client: `useCart` is the one query, and every write stores the whole priced cart it gets
// back (cart digest §0), so nothing is summed or guessed here. The line quantity hook lives in
// ./use-update-cart-line, re-exported here.

export { CART_KEY } from './cart-cache'
export {
  QUANTITY_DEBOUNCE_MS,
  useUpdateCartLine,
  type CartLineQuantity,
} from './use-update-cart-line'

const REMOVED = 'کالا از سبد خرید حذف شد.'
/** Read out after an add, followed by the product's name. */
export const ADDED_ANNOUNCEMENT = 'به سبد خرید اضافه شد'

/** Items in the cart: the API's `item_count` (the sum of the line quantities); 0 without one. */
export function cartCount(cart: Cart | undefined): number {
  return cart?.item_count ?? 0
}

/** The stepper's bounds for a line: its own minimum, and what it can hold now (never 0). */
export function lineLimits(
  line: Pick<CartLine, 'order_limit_min' | 'order_limit_max' | 'available_quantity'>,
): { min: number; max: number } {
  const min = Math.max(1, line.order_limit_min)
  const max =
    line.order_limit_max > 0
      ? Math.min(line.available_quantity, line.order_limit_max)
      : line.available_quantity
  return { min, max: Math.max(min, max) }
}

/**
 * `GET cart/`, always stale: read again on mount and when the window regains focus, since prices
 * and stock are live. A guest without a cart gets an empty cart from the API, not an error.
 */
export function useCart(): UseQueryResult<Cart> {
  return useQuery({
    queryKey: CART_KEY,
    queryFn: async ({ signal }) => (await cartApi.get(signal)).data,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}

/**
 * The badge count: 0 on the server and during hydration (the server never knows the cart), the
 * real count from the first client render after. Badges are absolutely placed, so nothing moves.
 */
export function useCartCount(): number {
  const hydrated = useHydrated()
  const { data } = useCart()
  return hydrated ? cartCount(data) : 0
}

export interface AddOptions {
  /** Show the «added» toast (default). Buy now goes on to checkout instead. */
  toast?: boolean
}

export interface AddToCart {
  /**
   * Adds `quantity` of a variant; resolves true once the cart has it. Never rejects: a refusal
   * is shown as a toast and resolves false, as does a call while another add is in flight.
   */
  add: (
    variant: number,
    quantity: number,
    meta: { name: string; image: string },
    options?: AddOptions,
  ) => Promise<boolean>
  isPending: boolean
}

export interface AddVariables {
  variant: number
  quantity: number
  meta: { name: string; image: string }
  toast: boolean
}

/**
 * `POST cart/item/add/` as mutation options. Success stores the returned cart, shows the
 * «added» toast and reads «به سبد خرید اضافه شد: <name>» out through the shell's live region; a
 * refusal (limit, stock, a switched-off feature, throttling) shows the API's Persian detail and
 * leaves the cache alone.
 */
function addToCartOptions(
  client: QueryClient,
): MutationOptions<Awaited<ReturnType<typeof cartApi.add>>, Error, AddVariables> {
  return {
    scope: CART_WRITES,
    mutationFn: ({ variant, quantity }) => cartApi.add(variant, quantity),
    onSuccess: async ({ data, msg }, { meta, toast }) => {
      await storeCart(client, data)
      if (!toast) return
      showAddedToCartToast({ ...meta, message: msg })
      // Also through the shell's own region: Sonner's is only created with its first toast.
      announce(`${ADDED_ANNOUNCEMENT}: ${meta.name}`)
    },
    onError: (error) => notify.error(errorDetail(error)),
  }
}

/**
 * One add without a hook: the mutation is created when it is called (a product card creates
 * none until its button is pressed). Resolves true once the cart has it; never rejects.
 */
export function addToCartOnce(client: QueryClient, variables: AddVariables): Promise<boolean> {
  return new MutationObserver(client, addToCartOptions(client)).mutate(variables).then(
    () => true,
    () => false,
  )
}

/**
 * `POST cart/item/add/` (see `addToCartOptions`). Adding is not idempotent, so a second call
 * while one is in flight is ignored.
 */
export function useAddToCart(): AddToCart {
  const client = useQueryClient()
  const inFlight = useRef(false)
  const mutation = useMutation(addToCartOptions(client))

  const add: AddToCart['add'] = async (variant, quantity, meta, options = {}) => {
    if (inFlight.current) return false
    inFlight.current = true
    try {
      await mutation.mutateAsync({ variant, quantity, meta, toast: options.toast ?? true })
      return true
    } catch {
      // Already shown by onError.
      return false
    } finally {
      inFlight.current = false
    }
  }

  return { add, isPending: mutation.isPending }
}

export interface RemoveCartLine {
  /**
   * Removes a variant's line; resolves true once the line is gone (or was already). Never
   * rejects: a refusal is shown as a toast and resolves false.
   */
  remove: (variant: number) => Promise<boolean>
  isPending: boolean
}

/**
 * `DELETE cart/item/{variant}/remove/`: stores the returned cart and confirms with the API's
 * message. A line that is already gone (`cart_item_not_found`) is what the shopper wanted, so it
 * only reads the cart again; any other refusal shows the detail and reads the cart again too.
 */
export function useRemoveCartLine(): RemoveCartLine {
  const client = useQueryClient()
  const mutation = useMutation({
    scope: CART_WRITES,
    mutationFn: (variant: number) => cartApi.remove(variant),
    onSuccess: async ({ data, msg }) => {
      await storeCart(client, data)
      notify.success(msg || REMOVED)
    },
    onError: (error) => {
      if (!(error instanceof ApiError && error.code === 'cart_item_not_found')) {
        notify.error(errorDetail(error))
      }
      void client.invalidateQueries({ queryKey: CART_KEY })
    },
  })

  const remove = async (variant: number) => {
    try {
      await mutation.mutateAsync(variant)
      return true
    } catch (error) {
      // Shown by onError; a line already gone is what the shopper wanted.
      return error instanceof ApiError && error.code === 'cart_item_not_found'
    }
  }

  return { remove, isPending: mutation.isPending }
}
