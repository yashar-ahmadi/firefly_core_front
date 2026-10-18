'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { ADDRESSES_KEY } from '@/features/account/addresses/use-addresses'
import { CART_KEY, CART_WRITES, errorDetail, storeCart } from '@/features/cart/cart-cache'
import { refreshGeo } from '@/features/geo/api'
import { useMarkFeatureDisabled } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import type { Cart } from '@/lib/api/types/cart'
import type { DestinationRequest } from '@/lib/api/types/shipping'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { checkoutApi } from './checkout-api'
import { SHIPPING_OPTIONS_KEY } from './use-shipping-options'

// The checkout's cart writes (cart digest §3.8, §3.10): in the cart writes' scope (one at a
// time, in the order made, after any quantity change still on its way), each storing the cart it
// returns. A choice that a newer one of its kind overtook while it waited in the queue is never
// sent (arrow keys through a radio group choose at every step: only the last one counts).

export interface WriteOutcome {
  status: 'done' | 'superseded' | 'failed'
  /** What to say about a refusal (the API's detail), or about a choice made instead. */
  message?: string
  /** The refusal itself (a 429's `retry_after`, its code). */
  error?: unknown
  /** The city went: the lists were stale (`cart_city_not_in_province`, `does_not_exist`). */
  resetCity?: boolean
  /** COD was refused (its ceiling, not offered, switched off): the method was chosen prepaid. */
  codDropped?: boolean
}

const codeOf = (error: unknown) => (error instanceof ApiError ? error.code : null)

/** One kind of write, collapsing a queue of them to the one in flight and the last one. */
function useLatestWrite<B>(send: (body: B) => Promise<Cart>) {
  const client = useQueryClient()
  const latest = useRef(0)
  const mutation = useMutation({
    scope: CART_WRITES,
    mutationFn: async ({ seq, body }: { seq: number; body: B }) =>
      seq === latest.current ? send(body) : null,
    onSuccess: async (cart) => {
      if (cart) await storeCart(client, cart)
    },
  })
  const write = async (body: B): Promise<Cart | null> => {
    latest.current += 1
    return mutation.mutateAsync({ seq: latest.current, body })
  }
  return { write, isPending: mutation.isPending }
}

/**
 * What every refusal does first: a cart that is gone is read again (the page shows it empty;
 * the action is never replayed), a session that is gone ends (login, on the checkout).
 */
function useCommonFailure() {
  const client = useQueryClient()
  const expire = useSessionExpired()
  return (error: unknown): WriteOutcome | null => {
    if (codeOf(error) === 'cart_not_found') {
      void client.invalidateQueries({ queryKey: CART_KEY })
      return { status: 'failed', error }
    }
    if (isSessionExpiredError(error)) {
      expire()
      return { status: 'failed', error }
    }
    return null
  }
}

export function useDestinationWrite() {
  const client = useQueryClient()
  const common = useCommonFailure()
  const { write, isPending } = useLatestWrite((body: DestinationRequest) =>
    checkoutApi.destination(body),
  )
  const setDestination = async (body: DestinationRequest): Promise<WriteOutcome> => {
    try {
      return { status: (await write(body)) ? 'done' : 'superseded' }
    } catch (error) {
      const handled = common(error)
      if (handled) return handled
      const failure: WriteOutcome = { status: 'failed', error, message: errorDetail(error) }
      const stale =
        error instanceof ApiError &&
        error.errors.some(({ code, attr }) => code === 'does_not_exist' && attr !== 'address')
      if (codeOf(error) === 'cart_city_not_in_province' || stale) {
        refreshGeo(client)
        return { ...failure, resetCity: true }
      }
      // Someone else's or a deleted address: the book is read again.
      if (error instanceof ApiError && error.errors.some(({ attr }) => attr === 'address')) {
        void client.invalidateQueries({ queryKey: ADDRESSES_KEY })
      }
      return failure
    }
  }
  return { setDestination, isPending }
}

const COD_REFUSED = new Set(['cart_cod_limit_exceeded', 'cart_cod_not_supported'])
const OPTION_GONE = new Set(['cart_shipping_method_unavailable', 'cart_shipping_method_not_found'])

export function useShippingWrite() {
  const client = useQueryClient()
  const common = useCommonFailure()
  const markFeatureDisabled = useMarkFeatureDisabled()
  const { write, isPending } = useLatestWrite(checkoutApi.selectShipping)

  const select = async (code: string, cod: boolean): Promise<WriteOutcome> => {
    try {
      return { status: (await write({ code, cash_on_delivery: cod })) ? 'done' : 'superseded' }
    } catch (error) {
      const handled = common(error)
      if (handled) return handled
      const message = errorDetail(error)
      const switchedOff = error instanceof ApiError && error.isFeatureDisabled()
      if (cod && (COD_REFUSED.has(codeOf(error) ?? '') || switchedOff)) {
        // (The QueryClient marks the switch off too; idempotent.)
        if (switchedOff) markFeatureDisabled(error.feature ?? 'pay_on_delivery', message)
        const prepaid = await select(code, false)
        return { ...prepaid, message: prepaid.message ?? message, codDropped: true }
      }
      if (OPTION_GONE.has(codeOf(error) ?? '')) {
        void client.invalidateQueries({ queryKey: SHIPPING_OPTIONS_KEY })
      }
      return { status: 'failed', error, message }
    }
  }
  return { select, isPending }
}
