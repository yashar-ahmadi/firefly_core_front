import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PLACEMENT_KEY_STORAGE } from '@/features/checkout/idempotency'
import { ApiError } from '@/lib/api/errors'
import receiverInvalid from '../../fixtures/order-place-receiver-invalid.json'
import totalChanged from '../../fixtures/order-place-total-changed.json'
import { stubBrowserApis } from '../support/dom-stubs'
import { TERMS } from '../payment/fixtures'
import { destinationCart } from './fixtures'
import {
  calls,
  ok,
  onlineCart,
  PLACE,
  placeButton,
  placed,
  renderCheckout,
  serve,
} from './place-support'

// The placement's refusals (order digest §8.1; Review Focus #1): the total changed between the
// review and the press → the cart read again, a dialog with the new amounts that starts on
// «بازبینی دوباره», and nothing of the receiver or the note lost; the API's receiver checks →
// the form again with its messages; a lost answer → the same key next time, a new one after a
// 2xx; the unpaid-orders ceiling → its sentence and the way to those orders.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: vi.fn() }))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  sessionStorage.clear()
  localStorage.clear()
})

const ready = async () => {
  const button = await placeButton()
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
  return button
}
const keys = () => calls(mocks.bffFetch, PLACE).map(([, init]) => init.idempotencyKey)
const review = () => screen.getByRole('region', { name: /بازبینی و ثبت سفارش/ })

describe('placement refusals', () => {
  it('the total changed: a dialog with the new total; the receiver and the note stay', async () => {
    const user = userEvent.setup()
    let cart = onlineCart()
    const place = vi
      .fn()
      .mockImplementationOnce(async () => {
        // Meanwhile the shop changed a price.
        cart = onlineCart({ total: 2_500_000, amount_charged_online: 2_500_000 })
        throw ApiError.fromBody(409, totalChanged)
      })
      .mockImplementationOnce(placed())
    serve(mocks.bffFetch, () => cart, { [PLACE]: place })
    renderCheckout({ cart })
    const button = await ready()
    await user.type(screen.getByLabelText(/توضیحات سفارش/), 'لطفاً عصر بیاورید')
    await user.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'مبلغ سفارش تغییر کرد' })
    expect(dialog).toHaveTextContent('از ۲٬۴۱۳٬۰۰۰ تومان به ۲٬۵۰۰٬۰۰۰ تومان تغییر کرد')
    const again = within(dialog).getByRole('button', { name: 'بازبینی دوباره' })
    expect(again).toHaveFocus()
    await user.click(again)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Nothing the shopper wrote is lost: the note, and the receiver (its form, reopened).
    expect(screen.getByLabelText(/توضیحات سفارش/)).toHaveValue('لطفاً عصر بیاورید')
    const receiver = screen.getByRole('region', { name: /گیرنده و آدرس/ })
    await user.click(within(receiver).getByRole('button', { name: /ویرایش/ }))
    // The form's code loads as its step opens (lazy-steps.tsx).
    expect(await within(receiver).findByLabelText(/^نام گیرنده/)).toHaveValue('سارا')
    expect(within(receiver).getByLabelText(/کد پستی/)).toHaveValue('۱۲۳۴۵-۶۷۸۹۰')
    await user.click(within(receiver).getByRole('button', { name: 'ادامه' }))

    // Pressed again: the new total, the same key (nothing was created).
    await user.click(await ready())
    await screen.findByRole('dialog', { name: 'مبلغ سفارش تغییر کرد' }).catch(() => null)
    await waitFor(() => expect(place).toHaveBeenCalledTimes(2))
    expect(place.mock.calls[1]![0]).toMatchObject({
      expected_total: 2_500_000,
      customer_note: 'لطفاً عصر بیاورید',
    })
    expect(new Set(keys()).size).toBe(1)
  })

  it('the dialog can place at the new total itself (a second, deliberate press)', async () => {
    const user = userEvent.setup()
    let cart = onlineCart()
    const place = vi
      .fn()
      .mockImplementationOnce(async () => {
        cart = onlineCart({ total: 2_500_000, amount_charged_online: 2_500_000 })
        throw ApiError.fromBody(409, totalChanged)
      })
      .mockImplementationOnce(placed())
    serve(mocks.bffFetch, () => cart, { [PLACE]: place })
    renderCheckout({ cart })
    await user.click(await ready())
    const dialog = await screen.findByRole('dialog', { name: 'مبلغ سفارش تغییر کرد' })
    await user.click(within(dialog).getByRole('button', { name: 'ثبت سفارش با مبلغ جدید' }))
    await waitFor(() => expect(place).toHaveBeenCalledTimes(2))
    expect(place.mock.calls[1]![0]).toMatchObject({ expected_total: 2_500_000 })
    expect(await screen.findByRole('heading', { name: 'سفارش شما ثبت شد' })).toBeInTheDocument()
  })

  it('a total change that took the shipping away: back at the review, no old dialog, the sentences again', async () => {
    const user = userEvent.setup()
    let cart = onlineCart()
    const place = vi.fn().mockImplementation(async () => {
      // Meanwhile the shipping choice went (a price change cleared it): the 409's re-read says so.
      cart = destinationCart({ total: 2_520_000 })
      throw ApiError.fromBody(409, totalChanged)
    })
    serve(mocks.bffFetch, () => cart, {
      [PLACE]: place,
      // The operator's default chosen again by the page: the review comes back.
      'cart/shipping/select/': async () => {
        cart = onlineCart({ total: 2_520_000, amount_charged_online: 2_520_000 })
        return ok(cart)
      },
    })
    renderCheckout({ cart, props: { terms: TERMS } })
    const button = await ready()
    for (const box of within(review()).getAllByRole('checkbox')) await user.click(box)
    await user.click(button)
    await waitFor(() => expect(place).toHaveBeenCalledTimes(1))
    // The review closes for the shipping step, then opens again with the new cart.
    await waitFor(() => expect(calls(mocks.bffFetch, 'cart/shipping/select/')).toHaveLength(1))
    const again = await ready()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(review()).toHaveTextContent('۲٬۵۲۰٬۰۰۰ تومان')
    // What happened is said there too.
    expect(review()).toHaveTextContent('مبلغ سفارش تغییر کرد.')
    // A new confirmation: the operator's sentences are to be ticked again.
    await user.click(again)
    expect(place).toHaveBeenCalledTimes(1)
    expect(within(review()).getAllByRole('checkbox')[0]).toHaveAttribute('aria-invalid', 'true')
  })

  it('the dialog’s own confirmation goes through the review’s checks (the cart read, the sentences)', async () => {
    const user = userEvent.setup()
    let cart = onlineCart()
    const place = vi
      .fn()
      .mockImplementationOnce(async () => {
        cart = onlineCart({ total: 2_500_000, amount_charged_online: 2_500_000 })
        throw ApiError.fromBody(409, totalChanged)
      })
      .mockImplementationOnce(placed())
    serve(mocks.bffFetch, () => cart, { [PLACE]: place })
    renderCheckout({ cart, props: { terms: TERMS } })
    const button = await ready()
    for (const box of within(review()).getAllByRole('checkbox')) await user.click(box)
    await user.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'مبلغ سفارش تغییر کرد' })
    // The live cart's amounts, not a snapshot.
    expect(dialog).toHaveTextContent('۲٬۵۰۰٬۰۰۰ تومان')
    await user.click(within(dialog).getByRole('button', { name: 'ثبت سفارش با مبلغ جدید' }))
    await waitFor(() => expect(place).toHaveBeenCalledTimes(2))
    expect(place.mock.calls[1]![0]).toMatchObject({ expected_total: 2_500_000 })
  })

  it('a total change whose cart cannot be read again: said, with a read; then the dialog', async () => {
    const user = userEvent.setup()
    let cart = onlineCart()
    let readable = true
    const place = vi.fn().mockImplementationOnce(async () => {
      cart = onlineCart({ total: 2_500_000, amount_charged_online: 2_500_000 })
      readable = false
      throw ApiError.fromBody(409, totalChanged)
    })
    serve(mocks.bffFetch, () => cart, { [PLACE]: place })
    const served = mocks.bffFetch.getMockImplementation()!
    mocks.bffFetch.mockImplementation((path: string, init: unknown) =>
      path === 'cart/' && !readable
        ? Promise.reject(new ApiError({ status: 400, code: 'bad_request', detail: 'خطا.' }))
        : served(path, init),
    )
    renderCheckout({ cart })
    await user.click(await ready())
    // Never the old amounts: what happened, and a way to read the cart again.
    const notice = await within(review()).findByRole('alert')
    expect(notice).toHaveTextContent('مبلغ سفارش تغییر کرد')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    readable = true
    await user.click(within(notice).getByRole('button', { name: 'خواندن دوباره\u{0654} سبد خرید' }))
    const dialog = await screen.findByRole('dialog', { name: 'مبلغ سفارش تغییر کرد' })
    expect(dialog).toHaveTextContent('۲٬۵۰۰٬۰۰۰ تومان')
  })

  it('the API’s receiver checks: the form again, its messages on the fields, the first focused', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, () => onlineCart(), {
      [PLACE]: () => Promise.reject(ApiError.fromBody(400, receiverInvalid)),
    })
    renderCheckout({ cart: onlineCart() })
    await user.click(await ready())
    const receiver = await screen.findByRole('region', { name: /گیرنده و آدرس/ })
    await waitFor(() => expect(receiver).toHaveAttribute('data-state', 'active'))
    const mobile = within(receiver).getByLabelText(/شمارهٔ موبایل گیرنده/)
    expect(mobile).toHaveAttribute('aria-invalid', 'true')
    expect(mobile).toHaveAccessibleDescription(/شماره\u{0654} موبایل ایران را وارد کنید/u)
    expect(within(receiver).getByLabelText(/کد پستی/)).toHaveAttribute('aria-invalid', 'true')
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-invalid', 'true'))
  })

  it('a lost answer keeps the key for the retry; a 2xx clears it; the next purchase gets a new one', async () => {
    const user = userEvent.setup()
    const place = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(ApiError.network()))
      .mockImplementationOnce(placed())
    serve(mocks.bffFetch, () => onlineCart(), { [PLACE]: place })
    renderCheckout({ cart: onlineCart() })
    const first = sessionStorage.getItem(PLACEMENT_KEY_STORAGE)
    await user.click(await ready())
    expect(await screen.findByRole('alert')).toHaveTextContent('ارتباط با سرور برقرار نشد')
    expect(sessionStorage.getItem(PLACEMENT_KEY_STORAGE)).toBe(first)
    await user.click(await placeButton())
    await screen.findByRole('heading', { name: 'سفارش شما ثبت شد' })
    expect(keys()).toEqual([first, first])
    expect(sessionStorage.getItem(PLACEMENT_KEY_STORAGE)).toBeNull()
  })

  it('the unpaid-orders ceiling: its sentence as it is, and tracking for a guest', async () => {
    const user = userEvent.setup()
    const detail =
      'شما ۳ سفارش پرداخت‌نشده دارید. ابتدا یکی از آن‌ها را پرداخت یا لغو کنید و سپس دوباره تلاش کنید.'
    serve(mocks.bffFetch, () => onlineCart(), {
      [PLACE]: () =>
        Promise.reject(new ApiError({ status: 409, code: 'order_unpaid_limit_reached', detail })),
    })
    renderCheckout({ cart: onlineCart() })
    await user.click(await ready())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(detail)
    expect(within(alert).getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
  })

  it('shipping no longer selected: its options read again, the shipping step opens', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, () => onlineCart(), {
      [PLACE]: () =>
        Promise.reject(
          new ApiError({
            status: 409,
            code: 'order_shipping_method_unavailable',
            detail: 'روش ارسال در دسترس نیست.',
          }),
        ),
    })
    renderCheckout({ cart: onlineCart() })
    await user.click(await ready())
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /روش ارسال/ })).toHaveAttribute(
        'data-state',
        'active',
      ),
    )
    expect(screen.getByRole('alert')).toHaveTextContent('روش ارسال در دسترس نیست.')
    await act(async () => {})
  })
})
