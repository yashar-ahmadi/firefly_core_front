import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { OrderActions } from '@/features/orders/account/order-actions'
import { reorderNotice } from '@/features/orders/reorder/reorder-copy'
import { ApiError } from '@/lib/api/errors'
import type { Cart, CartReorderResult } from '@/lib/api/types/cart'
import cartFixture from '../../fixtures/cart-guest-items.json'
import { catalog } from '../payment/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { calls, detail, ok, refuse, renderAccount, serve } from './account-support'

// «خرید دوباره» (cart digest §3.12): `POST cart/reorder/ {order_code}` is NOT idempotent: one
// request however fast the presses (busy meanwhile), never retried by itself; the cart it answers
// is stored and read again; the toast is built from `added_lines`, `adjustments` and
// `reorder_skipped` (never `msg`), with «مشاهدهٔ سبد خرید». No answer: the cart is read again
// instead. 429: the button waits.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/toaster', () => ({ notify: mocks.notify, toastRegionReady: () => true }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/account/orders/7010868573/',
}))

const REORDER = 'cart/reorder/'
const cart = () => structuredClone((cartFixture as { data: Cart }).data)
const result = (changes: Partial<CartReorderResult> = {}): CartReorderResult => ({
  ...cart(),
  added_lines: 2,
  reorder_skipped: [],
  ...changes,
})

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  serve(mocks.bffFetch, { [REORDER]: () => ok(result()) })
})

const button = () => screen.getByRole('button', { name: 'خرید دوباره' })
function renderActions() {
  const view = renderAccount(<OrderActions order={detail('delivered')} catalog={catalog()} />)
  return { ...view, user: userEvent.setup() }
}

describe('reorderNotice', () => {
  it('how many lines went in, each lowered or dropped line, each line no longer sold', () => {
    const notice = reorderNotice(
      result({
        added_lines: 2,
        adjustments: [
          { variant_id: 1, product_name: 'چای', requested: 5, applied: 3, was_dropped: false },
        ],
        reorder_skipped: [
          { product_name: 'قهوه', variant_name: '۲۵۰ گرمی' },
          { product_name: 'کتری', variant_name: null },
        ],
      }),
    )
    expect(notice.tone).toBe('success')
    expect(notice.title).toBe('۲ قلم کالا از این سفارش به سبد خرید اضافه شد.')
    expect(notice.lines).toEqual([
      'تعداد «چای» از ۵ به ۳ کاهش یافت.',
      '«قهوه (۲۵۰ گرمی)» دیگر فروخته نمی\u{200C}شود.',
      '«کتری» دیگر فروخته نمی\u{200C}شود.',
    ])
  })

  it('nothing could go in: said as information', () => {
    const notice = reorderNotice(
      result({ added_lines: 0, reorder_skipped: [{ product_name: 'قهوه', variant_name: null }] }),
    )
    expect(notice.tone).toBe('info')
    expect(notice.title).toBe('هیچ\u{200C}کدام از اقلام این سفارش اکنون قابل خرید نیست.')
  })
})

describe('خرید دوباره', () => {
  it('one request however fast the presses, busy meanwhile; the cart stored and read again', async () => {
    let answer: (value: unknown) => void = () => {}
    serve(mocks.bffFetch, { [REORDER]: () => new Promise((resolve) => (answer = resolve)) })
    const { user, client } = renderActions()
    await user.dblClick(button())
    await user.click(button())
    expect(calls(mocks.bffFetch, REORDER)).toHaveLength(1)
    const [, init] = calls(mocks.bffFetch, REORDER)[0]!
    expect(init).toMatchObject({ method: 'POST', body: { order_code: '7010868573' } })
    expect(button()).toHaveAttribute('aria-busy', 'true')
    answer({ data: result(), msg: 'اقلام قابل خرید این سفارش به سبد خرید اضافه شد.', status: 200 })
    await vi.waitFor(() => expect(button()).not.toHaveAttribute('aria-busy'))
    expect(client.getQueryData(CART_KEY)).toMatchObject({ item_count: cart().item_count })
    expect(client.getQueryState(CART_KEY)?.isInvalidated).toBe(true)
    // The presses made while it was on its way were not queued to go after it (not idempotent).
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls(mocks.bffFetch, REORDER)).toHaveLength(1)
  })

  it('the toast: built from the answer, with «مشاهدهٔ سبد خرید»', async () => {
    serve(mocks.bffFetch, {
      [REORDER]: () =>
        ok(
          result({
            added_lines: 1,
            reorder_skipped: [{ product_name: 'قهوه', variant_name: null }],
          }),
        ),
    })
    const { user } = renderActions()
    await user.click(button())
    await vi.waitFor(() => expect(mocks.notify.success).toHaveBeenCalledTimes(1))
    const [body] = mocks.notify.success.mock.calls[0]!
    render(body as ReactElement)
    expect(screen.getByText('۱ قلم کالا از این سفارش به سبد خرید اضافه شد.')).toBeVisible()
    expect(screen.getByText('«قهوه» دیگر فروخته نمی\u{200C}شود.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'مشاهده\u{0654} سبد خرید' })).toHaveAttribute(
      'href',
      '/cart/',
    )
  })

  it('no answer: never sent again by itself; the cart is read again, and said so', async () => {
    serve(mocks.bffFetch, { [REORDER]: () => Promise.reject(ApiError.network()) })
    const { user, client } = renderActions()
    client.setQueryData(CART_KEY, cart())
    await user.click(button())
    await vi.waitFor(() => expect(mocks.notify.error).toHaveBeenCalled())
    expect(calls(mocks.bffFetch, REORDER)).toHaveLength(1)
    expect(client.getQueryState(CART_KEY)?.isInvalidated).toBe(true)
    expect(String(mocks.notify.error.mock.calls[0]![0])).toContain('سبد خرید دوباره خوانده شد')
  })

  it('429: the button waits out retry_after; nothing sent meanwhile', async () => {
    serve(mocks.bffFetch, {
      [REORDER]: () => refuse(429, 'throttled', 'زیاد', { retry_after: 55 }),
    })
    const { user } = renderActions()
    await user.click(button())
    expect(await screen.findByText(/زمان باقی‌مانده تا تلاش دوباره/)).toBeVisible()
    await user.click(button())
    expect(calls(mocks.bffFetch, REORDER)).toHaveLength(1)
  })

  it('not this account’s order (404): the API’s sentence', async () => {
    serve(mocks.bffFetch, {
      [REORDER]: () =>
        refuse(404, 'cart_reorder_order_not_found', 'سفارشی با این کد برای شما پیدا نشد.'),
    })
    const { user } = renderActions()
    await user.click(button())
    await vi.waitFor(() =>
      expect(mocks.notify.error).toHaveBeenCalledWith('سفارشی با این کد برای شما پیدا نشد.'),
    )
  })
})
