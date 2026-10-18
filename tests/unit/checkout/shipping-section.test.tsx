import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { ShippingSection } from '@/features/checkout/shipping-section'
import { useCheckout } from '@/features/checkout/use-checkout'
import { FeatureProvider } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import type { Cart } from '@/lib/api/types/cart'
import type { ShippingOption, ShippingOptionList } from '@/lib/api/types/shipping'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import {
  address,
  addressCart,
  codCart,
  codLimitBody,
  option,
  tehranOptions,
  unavailableBody,
} from './fixtures'

// The shipping step (cart digest §3.9–3.10, §6.7–6.8): every option the API lists, priced from
// its `total`, a fare collected at the door never called free, the cheapest available one chosen
// for the shopper (never with COD), and the API's refusals handled by their code.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

const SELECT = 'cart/shipping/select/'
const OPTIONS = 'cart/shipping/option/list/'
const ok = (data: unknown) => ({ data, msg: '', status: 200 })

interface Api {
  cart: Cart
  options?: () => ShippingOptionList
  select?: (body: { code: string; cash_on_delivery: boolean }) => Promise<unknown>
}

function serve({ cart, options = tehranOptions, select }: Api) {
  let current = cart
  mocks.bffFetch.mockImplementation((path: string, init?: { body?: never }) => {
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

function renderSection(cart: Cart) {
  const { client, wrapper: Wrapper } = clientProviders({ hasSession: true })
  client.setQueryData(CART_KEY, cart)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FeatureProvider initial={{}}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
  return { client, ...render(<Harness />, { wrapper }) }
}

const selects = () =>
  mocks.bffFetch.mock.calls.filter(([path]) => path === SELECT).map(([, init]) => init.body)
const optionRow = (name: RegExp | string) =>
  screen.getByRole('radio', { name }).closest<HTMLElement>('[data-option]')!
const list =
  (...options: ShippingOption[]): (() => ShippingOptionList) =>
  () => ({
    options,
    adjustments: [],
  })
/** The signed-in cart with a saved address and peyk-tehran chosen (with COD, unless changed). */
const chosen = (shipping: Partial<Cart['shipping']> = {}) =>
  addressCart(address(), { shipping: { ...codCart().shipping, ...shipping } })
const answerChosen = (body: { code: string; cash_on_delivery: boolean }) =>
  Promise.resolve(ok(chosen({ code: body.code, cash_on_delivery: body.cash_on_delivery })))

beforeEach(() => {
  mocks.bffFetch.mockReset()
})

describe('ShippingSection', () => {
  it('chooses the cheapest available option when nothing is chosen, without COD', async () => {
    // hozouri is free in Tehran: the cheapest available (bar-sangin's 0 is unavailable).
    serve({ cart: addressCart(), select: answerChosen })
    renderSection(addressCart())
    await waitFor(() => expect(selects()).toEqual([{ code: 'hozouri', cash_on_delivery: false }]))
  })

  it('ties go to the API’s order; COD is never ticked for the shopper', async () => {
    const options = list(
      option('bar-sangin'),
      option('peyk-tehran', { total: 15_000 }),
      option('tipax'),
    )
    serve({ cart: addressCart(), options, select: answerChosen })
    renderSection(addressCart())
    await waitFor(() =>
      expect(selects()).toEqual([{ code: 'peyk-tehran', cash_on_delivery: false }]),
    )
  })

  it('a door-paid fare of 0 (tipax) says «پس‌کرایه», never «رایگان»', async () => {
    const tipax = option('tipax', { price: 0, packaging_cost: 0, total: 0 })
    serve({ cart: chosen(), options: list(tipax) })
    renderSection(chosen())
    const row = await waitFor(() => optionRow(/تیپاکس/))
    expect(within(row).getAllByText('پس\u{200C}کرایه').length).toBeGreaterThan(0)
    expect(row).not.toHaveTextContent('رایگان')
  })

  it('«رایگان» only for an available option at 0 its sender pays; unavailable ones are disabled with their reason', async () => {
    serve({ cart: chosen() })
    renderSection(chosen())
    const free = await waitFor(() => optionRow(/تحویل حضوری/))
    expect(free).toHaveTextContent('رایگان')
    const heavy = optionRow(/باربری/)
    expect(heavy).not.toHaveTextContent('رایگان')
    expect(heavy).toHaveTextContent(option('bar-sangin').reason!)
    expect(within(heavy).getByRole('radio')).toBeDisabled()
    // tipax: 15,000 of packaging, the fare at the door.
    const tipax = optionRow(/تیپاکس/)
    expect(tipax).toHaveTextContent('پس\u{200C}کرایه')
    expect(tipax).toHaveTextContent('۱۵٬۰۰۰ تومان')
    expect(optionRow(/پیک موتوری/)).toHaveTextContent('۷۰٬۰۰۰ تومان')
  })

  it('the COD ceiling: its detail, COD unticked, and the same option chosen prepaid', async () => {
    const user = userEvent.setup()
    const prepaid = chosen({ cash_on_delivery: false })
    const select = vi.fn((body: { cash_on_delivery: boolean }) =>
      body.cash_on_delivery
        ? Promise.reject(ApiError.fromBody(400, codLimitBody()))
        : Promise.resolve(ok(prepaid)),
    )
    serve({ cart: prepaid, select })
    renderSection(prepaid)
    const cod = await screen.findByRole('checkbox', { name: /پرداخت در محل/ })
    expect(cod).not.toBeChecked()
    await user.click(cod)
    const detail = 'مبلغ قابل دریافت در محل برای این روش ارسال حداکثر ۲۰٬۰۰۰٬۰۰۰ تومان است.'
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(selects()).toEqual([
      { code: 'peyk-tehran', cash_on_delivery: true },
      { code: 'peyk-tehran', cash_on_delivery: false },
    ])
    expect(screen.getByRole('checkbox', { name: /پرداخت در محل/ })).not.toBeChecked()
  })

  it('an option no longer available on select: the list is read again and the reason shown', async () => {
    const user = userEvent.setup()
    serve({
      cart: chosen(),
      select: () => Promise.reject(ApiError.fromBody(400, unavailableBody())),
    })
    renderSection(chosen())
    await user.click(await screen.findByRole('radio', { name: /پست سفارشی/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'برای این وزن روش های ارسال ارزان تری در دسترس است.',
    )
    await waitFor(() =>
      expect(mocks.bffFetch.mock.calls.filter(([path]) => path === OPTIONS)).toHaveLength(2),
    )
  })

  it('COD switched off by the operator (503): COD goes away and the option is chosen prepaid', async () => {
    const user = userEvent.setup()
    const prepaid = chosen({ cash_on_delivery: false })
    const off = new ApiError({
      status: 503,
      code: 'feature_disabled',
      detail: 'پرداخت در محل موقتاً غیرفعال است.',
      feature: 'pay_on_delivery',
    })
    serve({
      cart: prepaid,
      select: (body) =>
        body.cash_on_delivery ? Promise.reject(off) : Promise.resolve(ok(prepaid)),
    })
    renderSection(prepaid)
    await user.click(await screen.findByRole('checkbox', { name: /پرداخت در محل/ }))
    await waitFor(() => expect(selects()).toHaveLength(2))
    expect(selects()[1]).toEqual({ code: 'peyk-tehran', cash_on_delivery: false })
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: /پرداخت در محل/ })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('پرداخت در محل موقتاً غیرفعال است.')
  })

  it('a chosen option shows its ETA and the prepayment note', async () => {
    const heavy = option('bar-sangin', { is_available: true, reason: null, total: 30_000 })
    serve({ cart: chosen(), options: list(heavy) })
    renderSection(chosen())
    const row = await waitFor(() => optionRow(/باربری/))
    expect(row).toHaveTextContent('تحویل ۳ تا ۷ روز کاری')
    expect(row).toHaveTextContent('۳۰٪')
    await act(async () => {})
  })
})
