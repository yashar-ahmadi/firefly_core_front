import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CouponBox } from '@/features/cart/components/coupon-box'
import { CART_KEY } from '@/features/cart/cart-cache'
import { FeatureProvider, type FeatureMap } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import type { Cart } from '@/lib/api/types/cart'
import { clientProviders } from '../support/providers'
import {
  cartNotFoundBody,
  couponEnvelope,
  couponMinSpendBody,
  freeshipCartFixture,
  itemsCartFixture,
  itemsEnvelope,
} from './fixtures'

// The coupon box of the cart page: apply and remove (`coupon/apply/`, `coupon/remove/`), the
// API's own words for a refusal, the 20/min throttle's wait, and the `coupons` switch.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => true,
  notify: { success: mocks.success, error: mocks.error, info: vi.fn(), dismiss: vi.fn() },
}))

const FIELD = 'کد تخفیف دارید؟'
const APPLY = 'اعمال کد'
const REMOVE = 'حذف کد تخفیف'

function renderBox(cart: Cart, features: Partial<FeatureMap> = {}) {
  const { client, wrapper: Wrapper } = clientProviders()
  client.setQueryData(CART_KEY, cart)
  function Box({ children }: { children?: ReactNode }) {
    return (
      <FeatureProvider initial={features}>
        <Wrapper>{children}</Wrapper>
      </FeatureProvider>
    )
  }
  const utils = render(<CouponBox cart={cart} />, { wrapper: Box })
  const rerender = (next: Cart) => utils.rerender(<CouponBox cart={next} />)
  return { client, rerender }
}

const reject = (status: number, body: Record<string, unknown>) =>
  Promise.reject(ApiError.fromBody(status, body))

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.success.mockReset()
  mocks.error.mockReset()
})

afterEach(() => vi.useRealTimers())

describe('CouponBox', () => {
  it('shows the API’s detail under the field for coupon_min_spend_not_met, keeping the code', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockImplementation(() => reject(400, couponMinSpendBody()))
    renderBox(itemsCartFixture())
    const field = screen.getByLabelText(FIELD)
    await user.type(field, 'vip1m')
    await user.click(screen.getByRole('button', { name: APPLY }))
    const detail = 'حداقل مبلغ سبد خرید برای این کوپن ۲۰٬۰۰۰٬۰۰۰ تومان است.'
    expect(await screen.findByText(detail)).toBeInTheDocument()
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription(new RegExp(detail))
    expect(field).toHaveValue('vip1m')
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('sends the code as the API reads it: Latin digits, trimmed, upper case', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockResolvedValue({ ...couponEnvelope(), status: 200 })
    renderBox(itemsCartFixture())
    const field = screen.getByLabelText(FIELD)
    expect(field).toHaveAttribute('autocomplete', 'off')
    expect(field).toHaveAttribute('maxlength', '30')
    await user.type(field, ' tea۳۰ ')
    await user.keyboard('{Enter}')
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledTimes(1))
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/coupon/apply/', {
      method: 'POST',
      body: { code: 'TEA30' },
    })
  })

  it('applies: the cart the API returned is stored, the code shown with a way to remove it', async () => {
    const user = userEvent.setup()
    const applied = couponEnvelope()
    mocks.bffFetch.mockResolvedValue({ ...applied, status: 200 })
    const { client, rerender } = renderBox(itemsCartFixture())
    await user.type(screen.getByLabelText(FIELD), 'TEA30')
    await user.click(screen.getByRole('button', { name: APPLY }))
    await waitFor(() => expect(client.getQueryData(CART_KEY)).toEqual(applied.data))
    expect(mocks.success.mock.calls[0]?.[0]).toBe('کوپن تخفیف اعمال شد.')
    rerender(applied.data)
    expect(screen.getByText('TEA30')).toBeInTheDocument()
    expect(screen.getByText(applied.data.coupon.title!)).toBeInTheDocument()
    expect(screen.queryByLabelText(FIELD)).toBeNull()
    expect(screen.getByRole('button', { name: REMOVE })).toBeInTheDocument()
  })

  it('removes: `coupon/remove/`, the returned cart stored and the field back', async () => {
    const user = userEvent.setup()
    const removed = itemsEnvelope()
    mocks.bffFetch.mockResolvedValue({ ...removed, msg: 'کوپن تخفیف حذف شد.', status: 200 })
    const { client, rerender } = renderBox(couponEnvelope().data)
    await user.click(screen.getByRole('button', { name: REMOVE }))
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/coupon/remove/', { method: 'DELETE' })
    await waitFor(() => expect(client.getQueryData(CART_KEY)).toEqual(removed.data))
    rerender(removed.data)
    expect(screen.getByLabelText(FIELD)).toBeInTheDocument()
  })

  it('a coupon the API has just taken off offers the field again, not «حذف کد تخفیف»', () => {
    const cart = freeshipCartFixture()
    renderBox({
      ...cart,
      coupon: { ...cart.coupon, discount_type: null, detached_reason: 'coupon_min_spend_not_met' },
    })
    expect(screen.getByLabelText(FIELD)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: REMOVE })).toBeNull()
  })

  it('a free-shipping coupon says the saving comes with the shipping choice', () => {
    renderBox(freeshipCartFixture())
    expect(
      screen.getByText('ارسال رایگان پس از انتخاب روش ارسال اعمال می\u{200C}شود'),
    ).toBeInTheDocument()
  })

  it('is not there while the coupons switch is off, unless a coupon is on the cart to remove', () => {
    const off = { coupons: { key: 'coupons', name: 'کوپن', enabled: false, reason: null } } as const
    renderBox(itemsCartFixture(), off)
    expect(screen.queryByLabelText(FIELD)).toBeNull()
    expect(screen.queryByRole('region', { name: 'کد تخفیف' })).toBeNull()
  })

  it('with the switch off, an applied coupon can still be removed (that call stays open)', () => {
    const off = { coupons: { key: 'coupons', name: 'کوپن', enabled: false, reason: null } } as const
    renderBox(couponEnvelope().data, off)
    expect(screen.queryByLabelText(FIELD)).toBeNull()
    expect(screen.getByRole('button', { name: REMOVE })).toBeInTheDocument()
  })

  it('503 feature_disabled: the operator’s sentence instead of the field', async () => {
    const user = userEvent.setup()
    const detail = 'کدهای تخفیف موقتاً غیرفعال است.'
    mocks.bffFetch.mockImplementation(() =>
      reject(503, {
        data: {
          type: 'server_error',
          feature: 'coupons',
          errors: [{ code: 'feature_disabled', detail, attr: null }],
        },
      }),
    )
    renderBox(itemsCartFixture())
    await user.type(screen.getByLabelText(FIELD), 'TEA30')
    await user.click(screen.getByRole('button', { name: APPLY }))
    expect(await screen.findByText(detail)).toBeInTheDocument()
    expect(screen.queryByLabelText(FIELD)).toBeNull()
  })

  it('429: says calmly to wait, and «اعمال کد» waits out retry_after', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mocks.bffFetch.mockImplementation(() =>
      reject(429, {
        data: { errors: [{ code: 'throttled', detail: '۵۵ ثانیه', attr: null }], retry_after: 55 },
      }),
    )
    renderBox(itemsCartFixture())
    await user.type(screen.getByLabelText(FIELD), 'TEA30')
    const apply = screen.getByRole('button', { name: APPLY })
    await user.click(apply)
    expect(await screen.findByText('لطفاً کمی بعد دوباره تلاش کنید.')).toBeInTheDocument()
    expect(apply).toHaveAttribute('aria-disabled', 'true')
    expect(apply).toHaveAccessibleDescription(/زمان باقی‌مانده تا تلاش دوباره/)
    await user.click(apply)
    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(56_000))
    expect(apply).not.toHaveAttribute('aria-disabled')
  })

  it('cart_not_found (a dead guest token): the cart is read again, never the code re-sent', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockImplementation((path: string) =>
      path === 'cart/'
        ? Promise.resolve({ ...itemsEnvelope(), status: 200 })
        : reject(404, cartNotFoundBody()),
    )
    const { client } = renderBox(itemsCartFixture())
    const read = vi.spyOn(client, 'invalidateQueries')
    await user.type(screen.getByLabelText(FIELD), 'TEA30')
    await user.click(screen.getByRole('button', { name: APPLY }))
    await waitFor(() => expect(read).toHaveBeenCalledWith({ queryKey: CART_KEY }))
    const applies = mocks.bffFetch.mock.calls.filter(([path]) => path === 'cart/coupon/apply/')
    expect(applies).toHaveLength(1)
  })
})
