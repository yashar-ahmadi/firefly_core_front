'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { notify } from '@/components/ui/toaster'
import { ADJUSTMENTS_TITLE, adjustmentText } from '@/features/cart/adjustments'
import { cartApi } from '@/features/cart/api'
import { CART_KEY } from '@/features/cart/cart-cache'
import { ApiError } from '@/lib/api/errors'
import type { AuthenticatedResponse } from '@/lib/api/types/account'
import type { Cart } from '@/lib/api/types/cart'
import { useSession } from '@/lib/session/session-context'
import { clearViewerQueries, ME_KEY } from '@/lib/session/viewer-queries'
import { safeNext } from '../safe-next'

/** Signs the page in after any successful login (`requires_totp` false); never rejects. */
export type CompleteLogin = (res: AuthenticatedResponse, next: string) => Promise<void>

const MERGE_FAILED = 'ورود انجام شد، اما سبد خرید پیش از ورود به حساب شما منتقل نشد.'
const MERGE_FAILED_HINT = 'سبد خرید را بررسی کنید و در صورت نیاز کالاها را دوباره اضافه کنید.'

/** The user's cart after `POST cart/merge/`, or null (logged and said softly) when it failed. */
async function mergeGuestCart(): Promise<Cart | null> {
  try {
    return (await cartApi.merge()).data
  } catch (error) {
    // Never blocks the login: the cart is read again on the next page anyway.
    const reason = error instanceof ApiError ? [error.status, error.code] : [error]
    console.warn('[login] cart merge failed:', ...reason)
    notify.info(MERGE_FAILED, { description: MERGE_FAILED_HINT })
    return null
  }
}

/**
 * `completeLogin(res, next)`, for every way of signing in (password, code, Google, registration):
 *
 * 1. `POST cart/merge/` once (the BFF sends the guest cart token for it); its `adjustments`, when
 *    there are any, in one toast. A failed merge is logged and said softly, never in the way.
 * 2. The previous visitor's queries are dropped (`clearViewerQueries`) and the page is signed in
 *    (`setHasSession(true)`); the profile and the merged cart are stored, then `['cart']`,
 *    `['me']` and `['summary']` are invalidated so whatever shows them reads them again.
 * 3. `router.replace(safeNext(next))`: a path on this site, else `/account/`.
 */
export function useCompleteLogin(): CompleteLogin {
  const client = useQueryClient()
  const router = useRouter()
  const { setHasSession } = useSession()
  return useCallback(
    async (res, next) => {
      const cart = await mergeGuestCart()
      await clearViewerQueries(client)
      setHasSession(true)
      if (res.user) client.setQueryData(ME_KEY, res.user)
      if (cart) client.setQueryData(CART_KEY, cart)
      for (const queryKey of [CART_KEY, ME_KEY, ['summary']]) {
        void client.invalidateQueries({ queryKey })
      }
      if (cart && cart.adjustments.length > 0) {
        notify.info(ADJUSTMENTS_TITLE, {
          description: cart.adjustments.map(adjustmentText).join(' '),
        })
      }
      router.replace(safeNext(next))
    },
    [client, router, setHasSession],
  )
}
