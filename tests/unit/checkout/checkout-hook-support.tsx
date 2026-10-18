import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Mock } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { useCheckout } from '@/features/checkout/use-checkout'
import { FeatureProvider } from '@/features/settings/feature-context'
import type { Cart } from '@/lib/api/types/cart'
import { useSession } from '@/lib/session/session-context'
import { clientProviders } from '../support/providers'
import { tehranOptions } from './fixtures'

// What the `useCheckout` tests share: the API answered through the test file's mocked
// `bffFetch`, the client contexts with the feature switches, the hook beside the session.

export type Answer = { data: unknown; msg: string; status: number }
export const ok = (data: unknown): Answer => ({ data, msg: '', status: 200 })

/** The API: `cart/` answers `current()`, the writes their fixture, the option list Tehran's. */
export function serve(
  bffFetch: Mock,
  current: () => Cart,
  writes: Record<string, () => unknown> = {},
) {
  bffFetch.mockImplementation((path: string) => {
    if (path === 'cart/') return Promise.resolve(ok(current()))
    if (path === 'cart/shipping/option/list/') return Promise.resolve(ok(tehranOptions()))
    const write = writes[path]
    return write ? Promise.resolve(ok(write())) : new Promise(() => {})
  })
}

/** The client contexts with the feature switches (the checkout reads `pay_on_delivery`). */
export function withFeatures(hasSession = false) {
  const providers = clientProviders({ hasSession })
  const Wrapper = providers.wrapper
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FeatureProvider initial={{}}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
  return { client: providers.client, wrapper }
}

export function setup(cart: Cart, hasSession: boolean) {
  const providers = withFeatures(hasSession)
  providers.client.setQueryData(CART_KEY, cart)
  const hook = renderHook(() => ({ checkout: useCheckout(), session: useSession() }), {
    wrapper: providers.wrapper,
  })
  return { ...hook, client: providers.client }
}

export const VALID_RECEIVER = {
  firstName: 'سارا',
  lastName: 'احمدی',
  mobile: '۰۹۱۲۱۲۳۴۵۰۱',
  province: 8,
  city: 301,
  address: 'خیابان ولیعصر، کوچهٔ بهار',
  postalCode: '۱۲۳۴۵-۶۷۸۹۰',
}
