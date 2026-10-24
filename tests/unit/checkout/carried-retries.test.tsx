import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import totalChanged from '../../fixtures/order-place-total-changed.json'
import { stubBrowserApis } from '../support/dom-stubs'
import { catalog, methods } from '../payment/fixtures'
import { ok, onlineCart, PLACE, placeButton, renderCheckout, serve } from './place-support'

// Two retries that used to fail in silence (Task 3's carried items): the cart read again after
// `409 order_total_changed` (its button busy while it reads, a polite «دوباره خوانده نشد» when it
// fails again), and the shop's gateway list (a failed read is said, never only the bank closing
// as «درگاه بانکی در دسترس نیست»).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  sessionStorage.clear()
  localStorage.clear()
})

const page = <T,>(results: T[]) => ({
  count: results.length,
  total_pages: 1,
  current_page: 1,
  page_size: 100,
  next: null,
  previous: null,
  results,
})

const review = () => screen.getByRole('region', { name: /بازبینی و ثبت سفارش/ })

describe('the cart read again after a total change', () => {
  it('is busy while it reads, says politely that it failed again, and can be pressed again', async () => {
    const user = userEvent.setup()
    let cart = onlineCart()
    let readable = true
    let release: (() => void) | null = null
    const place = vi.fn().mockImplementationOnce(async () => {
      cart = onlineCart({ total: 2_500_000, amount_charged_online: 2_500_000 })
      readable = false
      throw ApiError.fromBody(409, totalChanged)
    })
    serve(mocks.bffFetch, () => cart, { [PLACE]: place })
    const served = mocks.bffFetch.getMockImplementation()!
    mocks.bffFetch.mockImplementation((path: string, init: unknown) => {
      if (path !== 'cart/' || readable) return served(path, init)
      // The read waits for the test, then fails.
      return new Promise((_, reject) => {
        release = () => reject(new ApiError({ status: 400, code: 'bad_request', detail: 'خطا.' }))
      })
    })
    renderCheckout({ cart })
    const button = await placeButton()
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    await user.click(button)
    await waitFor(() => expect(release).not.toBeNull())
    release!()
    const notice = await within(review()).findByRole('alert')
    const reread = within(notice).getByRole('button', { name: 'خواندن دوباره\u{0654} سبد خرید' })
    release = null
    await user.click(reread)
    // While the cart is read: busy, never a second read on a second press.
    await waitFor(() => expect(reread).toHaveAttribute('aria-busy', 'true'))
    release!()
    await waitFor(() => expect(reread).not.toHaveAttribute('aria-busy'))
    expect(within(notice).getByRole('status')).toHaveTextContent('دوباره خوانده نشد')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Readable again: the next press opens the dialog on the live cart.
    readable = true
    await user.click(reread)
    expect(await screen.findByRole('dialog', { name: 'مبلغ سفارش تغییر کرد' })).toHaveTextContent(
      '۲٬۵۰۰٬۰۰۰ تومان',
    )
  })
})

describe('the gateway list', () => {
  // A list that could not be read leaves the bank's state unknown: the page says so, offers to
  // read it again, and chooses no route for the shopper meanwhile (never a silent fallback).
  it('a gateway read that fails on «تلاش دوباره» is said, though the routes came back', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, () => onlineCart(), {
      'payment/method/list/': async () => ok(page(methods())),
      'payment/gateway/list/': () => Promise.reject(ApiError.network()),
    })
    renderCheckout({
      cart: onlineCart(),
      props: { catalog: catalog({ methods: null, gateways: null }) },
    })
    const step = await screen.findByRole('region', { name: /۳.*پرداخت/ })
    await user.click(await within(step).findByRole('button', { name: 'تلاش دوباره' }))
    const routes = await within(step).findByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' })
    await waitFor(() =>
      expect(within(step).getByRole('status')).toHaveTextContent(
        'درگاه\u{200C}های بانکی باز هم بارگذاری نشد',
      ),
    )
    expect(within(step).getByText(/فهرست درگاه\u{200C}های بانکی خوانده نشد/u)).toBeVisible()
    expect(within(step).getByRole('button', { name: 'تلاش دوباره' })).toBeEnabled()
    expect(step).toHaveAttribute('data-state', 'active')
    expect(within(routes).queryByRole('radio', { checked: true })).toBeNull()
  })

  it('a gateway list the server could not read is said from the start', async () => {
    serve(mocks.bffFetch, () => onlineCart())
    renderCheckout({ cart: onlineCart(), props: { catalog: catalog({ gateways: null }) } })
    const step = await screen.findByRole('region', { name: /۳.*پرداخت/ })
    expect(await within(step).findByText(/فهرست درگاه\u{200C}های بانکی خوانده نشد/u)).toBeVisible()
    expect(within(step).getByRole('button', { name: 'تلاش دوباره' })).toBeEnabled()
    expect(step).toHaveAttribute('data-state', 'active')
  })
})
