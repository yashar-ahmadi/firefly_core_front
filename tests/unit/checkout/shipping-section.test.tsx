import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { codLimitBody, codRouteDisabledBody, option, unavailableBody } from './fixtures'
import {
  chosen,
  list,
  ok,
  OPTIONS,
  optionRow,
  renderSection,
  selects,
  serve,
} from './shipping-support'

// The shipping step (cart digest §3.9–3.10, §6.7–6.8): every option the API lists, priced from
// its `total`, a fare collected at the door never called free, the COD box from the API's verdict
// for this cart (`cash_on_delivery_available`, J-28/M-8: never a comparison of ours), and the
// API's refusals handled by their code. The option chosen for the shopper:
// shipping-auto-select.test.tsx.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
})

describe('ShippingSection', () => {
  it('a door-paid fare of 0 (tipax) says «پس‌کرایه», never «رایگان»', async () => {
    const tipax = option('tipax', { price: 0, packaging_cost: 0, total: 0 })
    serve(mocks.bffFetch, { cart: chosen(), options: list(tipax) })
    renderSection(chosen())
    const row = await waitFor(() => optionRow(/تیپاکس/))
    expect(within(row).getAllByText('پس\u{200C}کرایه').length).toBeGreaterThan(0)
    expect(row).not.toHaveTextContent('رایگان')
  })

  it('«رایگان» only for an available option at 0 its sender pays; unavailable ones are disabled with their reason', async () => {
    serve(mocks.bffFetch, { cart: chosen() })
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
    serve(mocks.bffFetch, { cart: prepaid, select })
    renderSection(prepaid)
    const cod = await screen.findByRole('checkbox', { name: /پرداخت در محل/ })
    expect(cod).not.toBeChecked()
    await user.click(cod)
    const detail = 'مبلغ قابل پرداخت در محل در این فروشگاه حداکثر ۲۰٬۰۰۰٬۰۰۰ تومان است.'
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(selects(mocks.bffFetch)).toEqual([
      { code: 'peyk-tehran', cash_on_delivery: true },
      { code: 'peyk-tehran', cash_on_delivery: false },
    ])
    expect(screen.getByRole('checkbox', { name: /پرداخت در محل/ })).not.toBeChecked()
    // The list that offered the box was out of date: read again for its verdict.
    await waitFor(() =>
      expect(mocks.bffFetch.mock.calls.filter(([path]) => path === OPTIONS)).toHaveLength(2),
    )
  })

  it('the API refuses COD for this cart (its ceiling): the box disabled, the ceiling named, nothing sent', async () => {
    const user = userEvent.setup()
    const prepaid = chosen({ cash_on_delivery: false })
    const peyk = option('peyk-tehran', {
      cash_on_delivery_available: false,
      cash_on_delivery_refusal: 'cart_cod_limit_exceeded',
    })
    serve(mocks.bffFetch, {
      cart: prepaid,
      options: list(peyk),
      select: () => new Promise(() => {}),
    })
    renderSection(prepaid)
    const cod = await screen.findByRole('checkbox', { name: /پرداخت در محل/ })
    expect(cod).toBeDisabled()
    expect(cod).not.toBeChecked()
    const row = optionRow(/پیک موتوری/)
    expect(row).toHaveTextContent(
      'مبلغ پرداخت در محل این سفارش از سقف ۲۰٬۰۰۰٬۰۰۰ تومان بیشتر است؛ با پرداخت آنلاین ادامه دهید.',
    )
    // The method's «امکان پرداخت در محل» is not said for a cart that cannot have it.
    expect(row).not.toHaveTextContent('امکان پرداخت در محل')
    await user.click(cod)
    expect(selects(mocks.bffFetch)).toEqual([])
  })

  it('nothing online and the shop’s «پرداخت در محل» method off (route disabled): disabled, said', async () => {
    const prepaid = chosen({ cash_on_delivery: false })
    const peyk = option('peyk-tehran', {
      cash_on_delivery_available: false,
      cash_on_delivery_refusal: 'cart_cod_route_disabled',
    })
    serve(mocks.bffFetch, { cart: prepaid, options: list(peyk) })
    renderSection(prepaid)
    const cod = await screen.findByRole('checkbox', { name: /پرداخت در محل/ })
    expect(cod).toBeDisabled()
    expect(optionRow(/پیک موتوری/)).toHaveTextContent(
      'پرداخت کامل سفارش هنگام تحویل اکنون ممکن نیست؛ با پرداخت آنلاین ادامه دهید.',
    )
  })

  it('an API older than the COD verdict (no cash_on_delivery_*): the method’s own flag, the box open', async () => {
    const prepaid = chosen({ cash_on_delivery: false })
    const peyk = option('peyk-tehran')
    delete peyk.cash_on_delivery_available
    delete peyk.cash_on_delivery_refusal
    serve(mocks.bffFetch, { cart: prepaid, options: list(peyk) })
    renderSection(prepaid)
    const cod = await screen.findByRole('checkbox', { name: /پرداخت در محل/ })
    expect(cod).toBeEnabled()
    expect(optionRow(/پیک موتوری/)).toHaveTextContent('امکان پرداخت در محل')
  })

  it('a COD tick the list no longer backs (cart_cod_route_disabled): the same option prepaid, the API’s sentence', async () => {
    const user = userEvent.setup()
    const prepaid = chosen({ cash_on_delivery: false })
    const select = vi.fn((body: { cash_on_delivery: boolean }) =>
      body.cash_on_delivery
        ? Promise.reject(ApiError.fromBody(400, codRouteDisabledBody()))
        : Promise.resolve(ok(prepaid)),
    )
    serve(mocks.bffFetch, { cart: prepaid, select })
    renderSection(prepaid)
    await user.click(await screen.findByRole('checkbox', { name: /پرداخت در محل/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'پرداخت کامل سفارش هنگام تحویل در حال حاضر ممکن نیست.',
    )
    expect(selects(mocks.bffFetch)).toEqual([
      { code: 'peyk-tehran', cash_on_delivery: true },
      { code: 'peyk-tehran', cash_on_delivery: false },
    ])
  })

  it('the COD the cart already has stays its own to untick, whatever the list now says', async () => {
    const user = userEvent.setup()
    const withCod = chosen({ cash_on_delivery: true })
    const peyk = option('peyk-tehran', {
      cash_on_delivery_available: false,
      cash_on_delivery_refusal: 'cart_cod_limit_exceeded',
    })
    serve(mocks.bffFetch, {
      cart: withCod,
      options: list(peyk),
      select: () => Promise.resolve(ok(chosen({ cash_on_delivery: false }))),
    })
    renderSection(withCod)
    const cod = await screen.findByRole('checkbox', { name: /پرداخت در محل/ })
    expect(cod).toBeChecked()
    expect(cod).toBeEnabled()
    await user.click(cod)
    expect(selects(mocks.bffFetch)).toEqual([{ code: 'peyk-tehran', cash_on_delivery: false }])
  })

  it('an option no longer available on select: the list is read again and the reason shown', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, {
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
    serve(mocks.bffFetch, {
      cart: prepaid,
      select: (body) =>
        body.cash_on_delivery ? Promise.reject(off) : Promise.resolve(ok(prepaid)),
    })
    renderSection(prepaid)
    await user.click(await screen.findByRole('checkbox', { name: /پرداخت در محل/ }))
    await waitFor(() => expect(selects(mocks.bffFetch)).toHaveLength(2))
    expect(selects(mocks.bffFetch)[1]).toEqual({ code: 'peyk-tehran', cash_on_delivery: false })
    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: /پرداخت در محل/ })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('پرداخت در محل موقتاً غیرفعال است.')
  })

  it('a chosen option shows its ETA and the prepayment note', async () => {
    const heavy = option('bar-sangin', { is_available: true, reason: null, total: 30_000 })
    serve(mocks.bffFetch, { cart: chosen(), options: list(heavy) })
    renderSection(chosen())
    const row = await waitFor(() => optionRow(/باربری/))
    expect(row).toHaveTextContent('تحویل ۳ تا ۷ روز کاری')
    expect(row).toHaveTextContent('۳۰٪')
    await act(async () => {})
  })
})
