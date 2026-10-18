import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Mock } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { CheckoutPage, type CheckoutPageProps } from '@/features/checkout/checkout-page'
import { saveReceiverDraft } from '@/features/checkout/receiver-draft'
import { FeatureProvider, type FeatureMap } from '@/features/settings/feature-context'
import type { Cart } from '@/lib/api/types/cart'
import { checkoutProps, placement, wallet } from '../payment/fixtures'
import { clientProviders } from '../support/providers'
import { VALID_RECEIVER } from './checkout-hook-support'
import { address, addressCart, codCart, destinationCart, tehranOptions } from './fixtures'

// What the placement and payment tests share: a checkout whose steps are all done (a guest's
// confirmed receiver in Tehran, or k.yazdi's saved address; peyk-tehran chosen), so the review
// is the step; the API through the test file's mocked `bffFetch`, and the page rendered with
// the server's catalog.

export const ok = (data: unknown, status = 200) => ({ data, msg: '', status })
export const PLACE = 'order/place/'

/** peyk-tehran, prepaid: everything online (A = total, D = 0). */
const ONLINE = (): Partial<Cart> => ({
  shipping: { ...codCart().shipping, cash_on_delivery: false, cod_fee: 0 },
  cod_fee: 0,
  total: 2_413_000,
  amount_payable_online: 2_413_000,
  amount_due_on_delivery: 0,
  amount_charged_online: 2_413_000,
  amount_to_collect_on_delivery: 0,
})

export const onlineCart = (changes: Partial<Cart> = {}): Cart =>
  destinationCart({ ...ONLINE(), ...changes })

/** peyk-tehran with COD and nothing online (a pure pay-on-delivery order: A = 0). */
export const pureCodCart = (): Cart =>
  onlineCart({
    shipping: { ...codCart().shipping, price: 0, packaging_cost: 0 },
    amount_charged_online: 0,
    amount_to_collect_on_delivery: 2_438_000,
    total: 2_438_000,
  })

/** k.yazdi's cart: his saved address, everything online. */
export const signedInCart = (changes: Partial<Cart> = {}): Cart =>
  addressCart(address(), { ...ONLINE(), ...changes })

export type Route = (body: unknown, init: { idempotencyKey?: string }) => Promise<unknown>

/** `cart/` answers `cart()`; the routes given answer their paths; the rest never answers. */
export function serve(bffFetch: Mock, cart: () => Cart, routes: Record<string, Route> = {}) {
  bffFetch.mockImplementation(
    (path: string, init: { body?: unknown; idempotencyKey?: string } = {}) => {
      if (path === 'cart/') return Promise.resolve(ok(cart()))
      if (path === 'cart/shipping/option/list/') return Promise.resolve(ok(tehranOptions()))
      if (path === 'wallet/') return Promise.resolve(ok(wallet()))
      const route = routes[path]
      return route ? route(init.body, init) : new Promise(() => {})
    },
  )
}

export const placed =
  (changes = {}) =>
  () =>
    Promise.resolve(ok(placement(changes), 201))

export function renderCheckout({
  cart,
  hasSession = false,
  props = {},
  features = {},
  draft = true,
}: {
  cart: Cart
  hasSession?: boolean
  props?: Partial<CheckoutPageProps>
  features?: Partial<FeatureMap>
  /** A guest's receiver, confirmed (the receiver step done). */
  draft?: boolean
}) {
  if (draft && !hasSession) saveReceiverDraft({ values: VALID_RECEIVER, confirmed: true })
  const { client, wrapper: Wrapper } = clientProviders({ hasSession })
  client.setQueryData(CART_KEY, cart)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FeatureProvider initial={features}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
  const view = render(
    <>
      <h1 id="checkout-heading" tabIndex={-1}>
        تکمیل خرید
      </h1>
      <CheckoutPage {...checkoutProps()} {...props} />
    </>,
    { wrapper },
  )
  return { client, ...view }
}

export const placeButton = () =>
  screen.findByRole('button', { name: /ثبت سفارش و پرداخت|ثبت و تأیید سفارش/ })
export const calls = (bffFetch: Mock, path: string) =>
  bffFetch.mock.calls.filter(([called]) => called === path)
