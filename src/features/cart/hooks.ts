import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { notify } from '@/components/ui/toaster'
import { useHydrated } from '@/components/ui/use-media-query'
import { ApiError } from '@/lib/api/errors'
import type { Cart, CartLine } from '@/lib/api/types/cart'
import { cartApi } from './api'
import { showAddedToCartToast } from './components/added-to-cart-toast'

// The shopper's cart in Client Components. Pages are cached for everyone, so the cart is read on
// the client: `useCart` is the one query, and every write stores the whole priced cart it gets
// back (cart digest §0), so nothing is summed or guessed here.

/** The query holding the `Cart`. */
export const CART_KEY = ['cart'] as const
/** The stepper sends its final value this long after the last tap. */
export const QUANTITY_DEBOUNCE_MS = 400

const GENERIC_ERROR = 'خطایی رخ داد. لطفاً دوباره تلاش کنید.'
const REMOVED = 'کالا از سبد خرید حذف شد.'

const errorDetail = (error: unknown) => (error instanceof ApiError ? error.detail : GENERIC_ERROR)

/** Stores a cart a write returned. A read still in flight is older, so it is dropped first. */
async function storeCart(client: QueryClient, cart: Cart): Promise<void> {
  await client.cancelQueries({ queryKey: CART_KEY })
  client.setQueryData(CART_KEY, cart)
}

/** Items in the cart: the sum of the line quantities (the API's `item_count`). */
export function cartCount(cart: Cart | undefined): number {
  return cart?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0
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

export interface AddToCart {
  /** Adds `quantity` of a variant. Never rejects: a refusal is shown as a toast. */
  add: (variant: number, quantity: number, meta: { name: string; image: string }) => Promise<void>
  isPending: boolean
}

interface AddVariables {
  variant: number
  quantity: number
  meta: { name: string; image: string }
}

/**
 * `POST cart/item/add/`. Success stores the returned cart and shows the «added» toast; a refusal
 * (limit, stock, a switched-off feature, throttling) shows the API's Persian detail and leaves the
 * cache alone. Adding is not idempotent, so a second call while one is in flight is ignored.
 */
export function useAddToCart(): AddToCart {
  const client = useQueryClient()
  const inFlight = useRef(false)
  const mutation = useMutation({
    mutationFn: ({ variant, quantity }: AddVariables) => cartApi.add(variant, quantity),
    onSuccess: async ({ data, msg }, { meta }) => {
      await storeCart(client, data)
      showAddedToCartToast({ ...meta, message: msg })
    },
    onError: (error) => notify.error(errorDetail(error)),
  })

  const add: AddToCart['add'] = async (variant, quantity, meta) => {
    if (inFlight.current) return
    inFlight.current = true
    try {
      await mutation.mutateAsync({ variant, quantity, meta })
    } catch {
      // Already shown by onError.
    } finally {
      inFlight.current = false
    }
  }

  return { add, isPending: mutation.isPending }
}

export interface CartLineQuantity {
  /** What the stepper shows: the value waiting to be sent, else the line's. */
  quantity: number
  /** Shows `quantity` at once and sends it {@link QUANTITY_DEBOUNCE_MS} after the last call. */
  setQuantity: (quantity: number) => void
  /** Drops a value that has not been sent yet (before removing the line). */
  cancel: () => void
  /** A value is waiting or being sent. */
  isPending: boolean
  /** A PUT is in flight: the stepper is locked until the answer. */
  isSaving: boolean
}

/**
 * The quantity of one line (`PUT cart/item/{variant}/`, absolute). Taps are debounced and only
 * the final value is sent, and only when it differs from the cart's (any PUT clears the shipping
 * choice, digest §13.1). A refusal shows the detail and reads the cart again. A value still
 * waiting when the line unmounts (the mini-cart closed) is sent at once. It never sends 0: use
 * `useRemoveCartLine`.
 */
export function useUpdateCartLine(
  line: Pick<CartLine, 'variant_id' | 'quantity'>,
): CartLineQuantity {
  const client = useQueryClient()
  const variant = line.variant_id
  const [draft, setDraft] = useState<number | null>(null)
  const timer = useRef<{ id: ReturnType<typeof setTimeout>; send: () => void } | null>(null)

  const mutation = useMutation({
    mutationFn: (quantity: number) => cartApi.setQuantity(variant, quantity),
    onSuccess: ({ data }) => storeCart(client, data),
    onError: (error) => {
      notify.error(errorDetail(error))
      void client.invalidateQueries({ queryKey: CART_KEY })
    },
    onSettled: () => setDraft(null),
  })
  const { mutate } = mutation

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current.id)
    timer.current = null
    setDraft(null)
  }

  const setQuantity = (quantity: number) => {
    if (timer.current) clearTimeout(timer.current.id)
    setDraft(quantity)
    const send = () => {
      timer.current = null
      const current = client
        .getQueryData<Cart>(CART_KEY)
        ?.lines.find((candidate) => candidate.variant_id === variant)?.quantity
      if (quantity === current) setDraft(null)
      else mutate(quantity)
    }
    timer.current = { id: setTimeout(send, QUANTITY_DEBOUNCE_MS), send }
  }

  // Unmounting sends a waiting value instead of losing it.
  useEffect(
    () => () => {
      const pending = timer.current
      if (!pending) return
      clearTimeout(pending.id)
      pending.send()
    },
    [],
  )

  return {
    quantity: draft ?? line.quantity,
    setQuantity,
    cancel,
    isPending: draft !== null || mutation.isPending,
    isSaving: mutation.isPending,
  }
}

export interface RemoveCartLine {
  /** Removes a variant's line. Never rejects: a refusal is shown as a toast. */
  remove: (variant: number) => Promise<void>
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
    } catch {
      // Handled by onError.
    }
  }

  return { remove, isPending: mutation.isPending }
}
