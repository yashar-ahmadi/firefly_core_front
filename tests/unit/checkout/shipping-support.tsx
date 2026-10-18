import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Mock } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { ShippingSection } from '@/features/checkout/shipping-section'
import { useCheckout } from '@/features/checkout/use-checkout'
import { FeatureProvider } from '@/features/settings/feature-context'
import type { Cart } from '@/lib/api/types/cart'
import type { ShippingOption, ShippingOptionList } from '@/lib/api/types/shipping'
import { clientProviders } from '../support/providers'
import { address, addressCart, codCart, tehranOptions } from './fixtures'

// What the shipping step's tests share: the API answered through the test file's mocked
// `bffFetch` (the cart, the option list, the select), the section rendered with the checkout's
// own state, and builders for option lists and chosen carts.

export const SELECT = 'cart/shipping/select/'
export const OPTIONS = 'cart/shipping/option/list/'
export const ok = (data: unknown) => ({ data, msg: '', status: 200 })

export interface Api {
  cart: Cart
  options?: () => ShippingOptionList
  select?: (body: { code: string; cash_on_delivery: boolean }) => Promise<unknown>
}

/** `cart/` answers the cart the last select returned (the cart given until then). */
export function serve(bffFetch: Mock, { cart, options = tehranOptions, select }: Api) {
  let current = cart
  bffFetch.mockImplementation((path: string, init?: { body?: never }) => {
    if (path === 'cart/') return Promise.resolve(ok(current))
    if (path === OPTIONS) return Promise.resolve(ok(options()))
    if (path === SELECT && select) {
      return select(init!.body!).then((answer) => {
        current = (answer as { data: Cart }).data
        return answer
      })
    }
    return new Promise(() => {})
  })
}

function Harness() {
  return <ShippingSection checkout={useCheckout()} />
}

export function renderSection(cart: Cart) {
  const { client, wrapper: Wrapper } = clientProviders({ hasSession: true })
  client.setQueryData(CART_KEY, cart)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FeatureProvider initial={{}}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
  return { client, ...render(<Harness />, { wrapper }) }
}

export const selects = (bffFetch: Mock) =>
  bffFetch.mock.calls.filter(([path]) => path === SELECT).map(([, init]) => init.body)
export const optionRow = (name: RegExp | string) =>
  screen.getByRole('radio', { name }).closest<HTMLElement>('[data-option]')!
export const list =
  (...options: ShippingOption[]): (() => ShippingOptionList) =>
  () => ({ options, adjustments: [] })

/** The signed-in cart with a saved address and peyk-tehran chosen (with COD, unless changed). */
export const chosen = (shipping: Partial<Cart['shipping']> = {}) =>
  addressCart(address(), { shipping: { ...codCart().shipping, ...shipping } })
export const answerChosen = (body: { code: string; cash_on_delivery: boolean }) =>
  Promise.resolve(ok(chosen({ code: body.code, cash_on_delivery: body.cash_on_delivery })))
