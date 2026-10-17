import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { CartLineItem } from '@/features/cart/components/cart-line'
import { QUANTITY_DEBOUNCE_MS } from '@/features/cart/hooks'
import type { Cart, CartLine } from '@/lib/api/types/cart'
import { formatToman } from '@/lib/format'
import { clientProviders } from '../support/providers'
import { itemsCartFixture, itemsEnvelope } from './fixtures'
import { deferred } from './support'

// One line of the cart page: the API's prices, the stepper within the line's limits (debounced,
// absolute PUT), and removal with «بازگردانی», which adds the same variant and quantity again.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => true,
  notify: { success: mocks.success, error: mocks.error, info: vi.fn(), dismiss: vi.fn() },
}))

const TEA = () => itemsCartFixture().lines[0]!

function renderLine(line: CartLine, cart: Cart = itemsCartFixture()) {
  const { client, wrapper } = clientProviders()
  client.setQueryData(CART_KEY, cart)
  const onPendingChange = vi.fn()
  const view = render(
    <ul>
      <CartLineItem line={line} onPendingChange={onPendingChange} />
    </ul>,
    { wrapper },
  )
  return { client, onPendingChange, view }
}

const ok = (cart: Cart, msg = 'درخواست با موفقیت انجام شد.') =>
  Promise.resolve({ data: cart, msg, status: 200 })
const calls = (method: string) =>
  mocks.bffFetch.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method)

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.success.mockReset()
  mocks.error.mockReset()
})

afterEach(() => vi.useRealTimers())

describe('CartLineItem', () => {
  it('shows the line as the API priced it: image, linked name, variant, unit price, total', () => {
    renderLine(TEA())
    const item = screen.getByRole('listitem')
    expect(within(item).getByRole('link', { name: 'چای سیاه ارل گری چای احمد' })).toHaveAttribute(
      'href',
      '/product/ahmad-tea-earl-grey/',
    )
    expect(item).toHaveTextContent('وزن بسته: ۵۰۰ گرم | طعم: کلاسیک')
    expect(item).toHaveTextContent(formatToman(620_000))
    expect(item).toHaveTextContent(formatToman(1_240_000))
    // No active discount: nothing is struck through.
    expect(item.querySelector('del')).toBeNull()
  })

  it('strikes the unit price and the line subtotal only when the API says there is a discount', () => {
    renderLine({
      ...TEA(),
      unit_discount: 70_000,
      unit_final_price: 550_000,
      line_discount: 140_000,
      line_total: 1_100_000,
    })
    const struck = [...screen.getByRole('listitem').querySelectorAll('del')].map(
      (d) => d.textContent,
    )
    expect(struck).toEqual(expect.arrayContaining([expect.stringContaining('۶۲۰٬۰۰۰')]))
    expect(struck).toEqual(expect.arrayContaining([expect.stringContaining('۱٬۲۴۰٬۰۰۰')]))
  })

  it('bounds the stepper by the line’s limits (order_limit_max 0 means only what it can hold)', () => {
    renderLine({
      ...TEA(),
      quantity: 3,
      order_limit_min: 3,
      order_limit_max: 0,
      available_quantity: 3,
    })
    expect(screen.getByRole('button', { name: 'افزایش تعداد' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'کاهش تعداد' })).toBeDisabled()
  })

  it('sends only the final quantity once the taps stop, absolute, and reports it pending', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mocks.bffFetch.mockImplementation(() => ok(itemsCartFixture()))
    const { onPendingChange } = renderLine(TEA())
    const plus = screen.getByRole('button', { name: 'افزایش تعداد' })
    await user.click(plus)
    await user.click(plus)
    expect(onPendingChange).toHaveBeenLastCalledWith(10119, true)
    expect(calls('PUT')).toHaveLength(0)
    await act(() => vi.advanceTimersByTimeAsync(QUANTITY_DEBOUNCE_MS))
    expect(calls('PUT')).toEqual([['cart/item/10119/', { method: 'PUT', body: { quantity: 4 } }]])
    await waitFor(() => expect(onPendingChange).toHaveBeenLastCalledWith(10119, false))
  })

  it('locks the bin while the line’s PUT is on its way', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    const put = deferred<{ data: Cart; msg: string; status: number }>()
    mocks.bffFetch.mockImplementation(() => put.promise)
    renderLine(TEA())
    await user.click(screen.getByRole('button', { name: 'افزایش تعداد' }))
    await act(() => vi.advanceTimersByTimeAsync(QUANTITY_DEBOUNCE_MS))
    const bin = screen.getByRole('button', { name: 'حذف از سبد خرید' })
    expect(bin).toBeDisabled()
    await act(async () => put.resolve({ data: itemsCartFixture(), msg: '', status: 200 }))
    await waitFor(() => expect(bin).toBeEnabled())
  })

  it('a quantity still waiting is dropped when the bin is pressed: one DELETE, no PUT', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    mocks.bffFetch.mockImplementation(() => ok(itemsCartFixture(), 'کالا از سبد خرید حذف شد.'))
    renderLine(TEA())
    await user.click(screen.getByRole('button', { name: 'افزایش تعداد' }))
    await user.click(screen.getByRole('button', { name: 'حذف از سبد خرید' }))
    await act(() => vi.advanceTimersByTimeAsync(QUANTITY_DEBOUNCE_MS * 2))
    expect(calls('PUT')).toHaveLength(0)
    expect(calls('DELETE')).toEqual([['cart/item/10119/remove/', { method: 'DELETE' }]])
  })

  it('removes with «بازگردانی»: it adds the same variant and quantity back', async () => {
    const user = userEvent.setup()
    const afterRemoval = itemsCartFixture({ lines: itemsCartFixture().lines.slice(1) })
    mocks.bffFetch.mockImplementation((path: string) =>
      path === 'cart/item/add/'
        ? ok(itemsEnvelope().data, 'کالا به سبد خرید اضافه شد.')
        : ok(afterRemoval, 'کالا از سبد خرید حذف شد.'),
    )
    const { client } = renderLine(TEA())
    await user.click(screen.getByRole('button', { name: 'حذف از سبد خرید' }))
    await waitFor(() => expect(client.getQueryData(CART_KEY)).toEqual(afterRemoval))
    const [message, options] = mocks.success.mock.calls.at(-1)!
    expect(message).toBe('«چای سیاه ارل گری چای احمد» از سبد خرید حذف شد.')
    expect(options.action.label).toBe('بازگردانی')
    await act(async () => options.action.onClick())
    await waitFor(() =>
      expect(mocks.bffFetch).toHaveBeenCalledWith('cart/item/add/', {
        method: 'POST',
        body: { variant: 10119, quantity: 2 },
      }),
    )
    await waitFor(() => expect(client.getQueryData(CART_KEY)).toEqual(itemsEnvelope().data))
  })

  it('says why the line cannot be ordered as it is', () => {
    renderLine({ ...TEA(), issue: 'above_order_limit', order_limit_max: 1 })
    expect(screen.getByRole('listitem')).toHaveTextContent('بیشتر از سقف سفارش؛ حداکثر ۱ عدد.')
  })
})
