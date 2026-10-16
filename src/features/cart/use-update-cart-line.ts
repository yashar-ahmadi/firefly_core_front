import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { notify } from '@/components/ui/toaster'
import type { Cart, CartLine } from '@/lib/api/types/cart'
import { cartApi } from './api'
import { CART_KEY, CART_WRITES, errorDetail, storeCart } from './cart-cache'

/** The stepper sends its final value this long after the last tap. */
export const QUANTITY_DEBOUNCE_MS = 400

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
    scope: CART_WRITES,
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
