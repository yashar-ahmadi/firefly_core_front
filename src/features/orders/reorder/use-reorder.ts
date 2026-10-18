'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useSubmitWait, type SubmitLock } from '@/components/form/code-timers'
import { notify } from '@/components/ui/toaster'
import { CART_KEY, CART_WRITES, errorDetail, storeCart } from '@/features/cart/cart-cache'
import { bffFetch } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import type { CartReorderResult } from '@/lib/api/types/cart'
import { NO_WAIT, restartWait, type Wait } from '@/lib/forms/waits'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { REORDER_LOST, REORDER_THROTTLED, reorderNotice } from './reorder-copy'
import { showReorderToast } from './reorder-toast'

// «خرید دوباره» (cart digest §3.12; any order, any status, signed in): `POST cart/reorder/
// {order_code}` adds the order's lines to the cart. It is NOT idempotent, so one request per
// press however fast the presses (an in-flight guard; the button says it is busy), never an
// automatic retry, in the cart writes' scope (after any cart change on its way). The cart it
// answers is stored and read again (the shipping choice was cleared), then the toast says what
// went in. No answer (a timeout, the connection): the cart is read again instead of sending it
// twice. 429 (10 a minute): the button waits out `retry_after`.

export interface Reorder {
  reorder: (orderCode: string) => void
  busy: boolean
  /** A 429's wait on the button. */
  lock: SubmitLock
}

/** No answer at all, or none from the API: the request may or may not have been applied. */
const isLost = (error: unknown) =>
  !(error instanceof ApiError) || error.status === 0 || error.status >= 500

export function useReorder(): Reorder {
  const client = useQueryClient()
  const expire = useSessionExpired()
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState<Wait>(NO_WAIT)
  const lock = useSubmitWait(wait)
  const mutation = useMutation({
    scope: CART_WRITES,
    retry: false,
    mutationFn: async (orderCode: string) =>
      (
        await bffFetch<CartReorderResult>('cart/reorder/', {
          method: 'POST',
          body: { order_code: orderCode },
        })
      ).data,
  })

  async function reorder(orderCode: string) {
    if (inFlight.current || lock.locked) return
    inFlight.current = true
    setBusy(true)
    try {
      const result = await mutation.mutateAsync(orderCode)
      await storeCart(client, result)
      void client.invalidateQueries({ queryKey: CART_KEY })
      showReorderToast(reorderNotice(result))
    } catch (error) {
      if (isSessionExpiredError(error)) return expire()
      if (error instanceof ApiError && error.status === 429) {
        setWait((previous) => restartWait(previous, Date.now(), error.retryAfter ?? 60))
        return notify.error(REORDER_THROTTLED)
      }
      if (isLost(error)) {
        void client.invalidateQueries({ queryKey: CART_KEY })
        return notify.error(REORDER_LOST)
      }
      notify.error(errorDetail(error))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return { reorder: (orderCode) => void reorder(orderCode), busy, lock }
}
