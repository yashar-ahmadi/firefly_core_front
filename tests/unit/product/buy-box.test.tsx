import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BuyBox } from '@/features/product/components/buy-box'
import { ApiError } from '@/lib/api/errors'
import { cart, cartLine, MSG_ADDED, result } from '../cart/support'
import { stubBrowserApis } from '../support/dom-stubs'
import { s25Product, withVariants } from './fixtures'
import { resetRouter, router } from './router'
import { renderWithProduct } from './support'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), error: vi.fn(), success: vi.fn() }))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', async () => (await import('./router')).routerMock)
vi.mock('@/components/ui/toaster', () => ({
  notify: { error: mocks.error, success: mocks.success, info: vi.fn(), dismiss: vi.fn() },
}))

const PHONE = '+982191000000'
const ADD = 'افزودن به سبد خرید'
const BUY_NOW = 'خرید فوری'

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.error.mockReset()
  mocks.success.mockReset()
  resetRouter()
})

afterEach(() => {
  vi.useRealTimers()
})

function renderBox(options: Parameters<typeof renderWithProduct>[1]) {
  return renderWithProduct(<BuyBox contactPhone={PHONE} />, options)
}

describe('BuyBox: what can be bought (review focus 1)', () => {
  it('disables the add button with «این ترکیب موجود نیست» when the selection is no variant', () => {
    renderBox({ product: s25Product({ default_variant_id: null }) })
    const add = screen.getByRole('button', { name: 'این ترکیب موجود نیست' })
    expect(add).toBeDisabled()
    expect(screen.getByRole('button', { name: BUY_NOW })).toBeDisabled()
    expect(screen.queryByRole('button', { name: ADD })).toBeNull()
  })

  it('disables it with «ناموجود» for an out-of-stock variant while others are buyable', () => {
    renderBox({ product: s25Product(), initialVariantId: 10004 })
    expect(screen.getByRole('button', { name: 'ناموجود' })).toBeDisabled()
    expect(screen.getByRole('button', { name: BUY_NOW })).toBeDisabled()
    expect(
      screen.getByText('این ترکیب ناموجود است؛ رنگ یا ویژگی دیگری را انتخاب کنید.'),
    ).toBeInTheDocument()
    // The product itself can be bought: no back-in-stock form.
    expect(screen.queryByRole('form', { name: /موجود شد/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /موجود شد/ })).toBeNull()
  })

  it('draws an unavailable button in a readable neutral look, not a faded brand one', () => {
    renderBox({ product: s25Product(), initialVariantId: 10004 })
    expect(screen.getByRole('button', { name: 'ناموجود' })).toHaveClass(
      'bg-ink-100',
      'text-ink-700',
      'disabled:opacity-100',
    )
  })

  it('says «ناموجود» for a product without variants', () => {
    renderBox({ product: s25Product({ default_variant_id: null, variants: [] }) })
    expect(screen.getByRole('button', { name: 'ناموجود' })).toBeDisabled()
  })
})

describe('BuyBox: price and stock', () => {
  it('shows the final price in Toman, nothing struck without a discount', () => {
    renderBox({ product: s25Product() })
    expect(screen.getByText('۷۸٬۵۰۰٬۰۰۰')).toBeInTheDocument()
    expect(document.querySelector('del')).toBeNull()
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('strikes the price and shows the percent when discounted, never from the JSON-LD', () => {
    const product = withVariants((v) =>
      v.id === 10001
        ? { has_discount: true, discount: 7_850_000, final_price: 70_650_000, discount_percent: 10 }
        : {},
    )
    renderBox({ product })
    expect(screen.getByText('۷۰٬۶۵۰٬۰۰۰')).toBeInTheDocument()
    expect(document.querySelector('del')).toHaveTextContent('۷۸٬۵۰۰٬۰۰۰')
    expect(screen.getByText('۱۰٪')).toBeInTheDocument()
  })

  it('counts down a timed discount only while it is in the future', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-10-16T10:00:00Z'))
    const timed = (end: number) =>
      withVariants((v) =>
        v.id === 10001
          ? {
              has_discount: true,
              discount: 1_000,
              final_price: 78_499_000,
              discount_percent: 0,
              discount_time_remaining: end,
            }
          : {},
      )
    const future = renderBox({ product: timed(Date.now() + 3_600_000) })
    expect(screen.getByRole('timer')).toBeInTheDocument()
    await act(async () => vi.advanceTimersByTime(1_000))
    expect(screen.getByRole('timer')).toHaveTextContent('۰۰:۵۹:۵۹')
    future.unmount()

    renderBox({ product: timed(Date.now() - 60_000) })
    await act(async () => vi.advanceTimersByTime(1_000))
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('says how many are left when the API gives a number above zero', () => {
    renderBox({ product: s25Product(), initialVariantId: 10003 })
    expect(screen.getByText('تنها ۳ عدد باقی مانده')).toBeInTheDocument()
  })

  it('says nothing about the count for zero or none', () => {
    renderBox({ product: withVariants(() => ({ low_stock_quantity: 0 })) })
    expect(screen.queryByText(/باقی مانده/)).toBeNull()
  })

  it('names what a pack holds when a unit is a pack', () => {
    renderBox({ product: withVariants(() => ({ packing_factor: 6 })) })
    expect(screen.getByText('هر بسته شامل ۶ عدد')).toBeInTheDocument()
  })
})

describe('BuyBox: quantity', () => {
  const stepper = () => screen.getByRole('group', { name: 'تعداد' })

  it('starts at the minimum and stops at the maximum', async () => {
    const user = userEvent.setup()
    renderBox({ product: withVariants(() => ({ order_limit_min: 2, order_limit_max: 3 })) })
    expect(stepper()).toHaveTextContent('۲')
    expect(within(stepper()).getByRole('button', { name: 'کاهش تعداد' })).toBeDisabled()
    await user.click(within(stepper()).getByRole('button', { name: 'افزایش تعداد' }))
    expect(stepper()).toHaveTextContent('۳')
    expect(within(stepper()).getByRole('button', { name: 'افزایش تعداد' })).toBeDisabled()
  })

  it('has no maximum when the limit is 0 and starts at 1 without a minimum', async () => {
    const user = userEvent.setup()
    renderBox({ product: withVariants(() => ({ order_limit_min: 0, order_limit_max: 0 })) })
    expect(stepper()).toHaveTextContent('۱')
    for (let i = 0; i < 5; i++) {
      await user.click(within(stepper()).getByRole('button', { name: 'افزایش تعداد' }))
    }
    expect(stepper()).toHaveTextContent('۶')
    expect(within(stepper()).getByRole('button', { name: 'افزایش تعداد' })).toBeEnabled()
  })

  it('adds the selected variant id with the quantity', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockResolvedValue(result(cart([cartLine({ quantity: 2 })]), MSG_ADDED))
    renderBox({ product: s25Product() })
    await user.click(within(stepper()).getByRole('button', { name: 'افزایش تعداد' }))
    await user.click(screen.getByRole('button', { name: ADD }))
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/item/add/', {
      method: 'POST',
      body: { variant: 10001, quantity: 2 },
    })
    await waitFor(() => expect(mocks.success).toHaveBeenCalledTimes(1))
    expect(router.push).not.toHaveBeenCalled()
  })
})

describe('BuyBox: buy now', () => {
  it('adds the variant, then goes to checkout', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockResolvedValue(result(cart([cartLine()]), MSG_ADDED))
    renderBox({ product: s25Product(), initialVariantId: 10002 })
    await user.click(screen.getByRole('button', { name: BUY_NOW }))
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/item/add/', {
      method: 'POST',
      body: { variant: 10002, quantity: 1 },
    })
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/checkout/'))
    // Straight to checkout: no «added» toast in between.
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it('stays on the page with the reason when the cart refuses', async () => {
    const user = userEvent.setup()
    const detail = 'موجودی کافی نیست.'
    mocks.bffFetch.mockRejectedValue(
      new ApiError({
        status: 400,
        errors: [{ code: 'cart_item_insufficient_stock', detail, attr: null }],
      }),
    )
    renderBox({ product: s25Product() })
    await user.click(screen.getByRole('button', { name: BUY_NOW }))
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(detail))
    expect(router.push).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: BUY_NOW })).toBeEnabled()
  })
})

describe('BuyBox: wholesale', () => {
  it('invites wholesale buyers to call, never showing a wholesale price', () => {
    const product = withVariants(() => ({ major_price: 65_000_000, major_min_order_limit: 12 }), {
      ...s25Product(),
      enable_major: true,
    })
    renderBox({ product })
    const note = screen.getByText(/برای خرید عمده/)
    expect(note).toHaveTextContent('برای خرید عمده (از ۱۲ عدد) با ما تماس بگیرید')
    const call = screen.getByRole('link', { name: /۰۲۱ ۹۱۰۰ ۰۰۰۰/ })
    expect(call).toHaveAttribute('href', `tel:${PHONE}`)
    expect(screen.queryByText('۶۵٬۰۰۰٬۰۰۰')).toBeNull()
  })

  it('leaves the count out when the variant has no wholesale minimum', () => {
    renderBox({ product: { ...s25Product(), enable_major: true } })
    expect(screen.getByText(/برای خرید عمده/)).toHaveTextContent('برای خرید عمده با ما تماس بگیرید')
  })

  it('shows no note when wholesale is off', () => {
    renderBox({ product: withVariants(() => ({ major_min_order_limit: 12 })) })
    expect(screen.queryByText(/برای خرید عمده/)).toBeNull()
  })
})
