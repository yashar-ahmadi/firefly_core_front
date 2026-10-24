import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MiniCart } from '@/features/cart/components/mini-cart'
import { formatToman } from '@/lib/format'
import type { Cart } from '@/lib/api/types/cart'
import { stubBrowserApis } from '../support/dom-stubs'
import { renderWith, serveCart, SUMMARY_NOTE, TWO_LINES, VIEW_CART } from './mini-cart-support'
import { cart, cartLine, deferred, MSG_REMOVED, result } from './support'

// The mini-cart sheet (the header's cart from md: header-cart.test.tsx): its lines, the API's
// totals, removal, the focus after a removal and the empty cart.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), error: vi.fn(), success: vi.fn() }))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { error: mocks.error, success: mocks.success, info: vi.fn(), dismiss: vi.fn() },
}))

const media = stubBrowserApis()
const serve = (data: Cart) => serveCart(mocks.bffFetch, data)

beforeEach(() => {
  media.set(() => false)
  mocks.bffFetch.mockReset()
  mocks.error.mockReset()
  mocks.success.mockReset()
})

describe('MiniCart', () => {
  it('lists each line and the goods total from the API, with checkout and cart links', async () => {
    serve(TWO_LINES)
    renderWith(<MiniCart open onOpenChange={vi.fn()} />, TWO_LINES)
    const sheet = await screen.findByRole('dialog', { name: 'سبد خرید' })
    const [first] = within(sheet).getAllByRole('listitem')
    if (!first) throw new Error('no line')

    const name = within(first).getByRole('link', { name: TWO_LINES.lines[0]?.product_name })
    expect(name).toHaveAttribute('href', '/product/samsung-galaxy-s25-ultra/')
    expect(name.closest('[dir="auto"]')).not.toBeNull()
    expect(within(first).getByText(/رنگ: مشکی/)).toBeInTheDocument()
    expect(within(first).getByRole('group', { name: 'تعداد' })).toHaveTextContent('۲')
    expect(within(first).getByRole('button', { name: 'حذف از سبد خرید' })).toBeInTheDocument()
    expect(first).toHaveTextContent(formatToman(157_000_000, { suffix: false }))

    const summary = within(sheet).getByText('جمع سبد خرید').parentElement
    expect(summary).toHaveTextContent(formatToman(123_456_789, { suffix: false }))
    expect(sheet).not.toHaveTextContent(formatToman(987_654_321, { suffix: false }))
    expect(sheet).toHaveTextContent(SUMMARY_NOTE)
    expect(within(sheet).queryByText('سود شما از این خرید')).toBeNull()
    expect(within(sheet).getByRole('link', { name: 'ثبت سفارش' })).toHaveAttribute(
      'href',
      '/checkout/',
    )
    expect(within(sheet).getByRole('link', { name: VIEW_CART })).toHaveAttribute('href', '/cart/')
  })

  it('shows the savings from the API when there are any', async () => {
    const saving = { ...TWO_LINES, total_savings: 2_500_000 }
    serve(saving)
    renderWith(<MiniCart open onOpenChange={vi.fn()} />, saving)
    const sheet = await screen.findByRole('dialog', { name: 'سبد خرید' })
    const row = within(sheet).getByText('سود شما از این خرید').parentElement
    expect(row).toHaveTextContent(formatToman(2_500_000, { suffix: false }))
  })

  it('removes a line with one tap and confirms it', async () => {
    const remaining = cart([TWO_LINES.lines[1] ?? cartLine()])
    mocks.bffFetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith('/remove/') ? result(remaining, MSG_REMOVED) : result(TWO_LINES),
      ),
    )
    renderWith(<MiniCart open onOpenChange={vi.fn()} />, TWO_LINES)
    const sheet = await screen.findByRole('dialog', { name: 'سبد خرید' })
    const [first] = within(sheet).getAllByRole('listitem')
    if (!first) throw new Error('no line')

    await userEvent.click(within(first).getByRole('button', { name: 'حذف از سبد خرید' }))
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/item/10001/remove/', { method: 'DELETE' })
    await waitFor(() => expect(within(sheet).getAllByRole('listitem')).toHaveLength(1))
    expect(mocks.success).toHaveBeenCalledWith(MSG_REMOVED)
  })

  it("locks the line's stepper while its removal is on its way", async () => {
    const removing = deferred<ReturnType<typeof result>>()
    mocks.bffFetch.mockImplementation((path: string) =>
      path.endsWith('/remove/') ? removing.promise : Promise.resolve(result(TWO_LINES)),
    )
    renderWith(<MiniCart open onOpenChange={vi.fn()} />, TWO_LINES)
    const sheet = await screen.findByRole('dialog', { name: 'سبد خرید' })
    const [first] = within(sheet).getAllByRole('listitem')
    await userEvent.click(within(first!).getByRole('button', { name: 'حذف از سبد خرید' }))
    await waitFor(() =>
      expect(within(first!).getByRole('button', { name: 'افزایش تعداد' })).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    )
    await act(async () => removing.resolve(result(cart([TWO_LINES.lines[1]!]), MSG_REMOVED)))
  })

  it('moves the focus to the next line once a line is removed', async () => {
    const remaining = cart([TWO_LINES.lines[1]!])
    mocks.bffFetch.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith('/remove/') ? result(remaining, MSG_REMOVED) : result(TWO_LINES),
      ),
    )
    renderWith(<MiniCart open onOpenChange={vi.fn()} />, TWO_LINES)
    const sheet = await screen.findByRole('dialog', { name: 'سبد خرید' })
    const [first] = within(sheet).getAllByRole('listitem')
    await userEvent.click(within(first!).getByRole('button', { name: 'حذف از سبد خرید' }))
    await waitFor(() =>
      expect(within(sheet).getByRole('link', { name: 'تلویزیون هایسنس ۵۵ اینچ U7' })).toHaveFocus(),
    )
  })

  it('moves the focus to the sheet title when the last line is removed', async () => {
    const one = cart([cartLine()])
    mocks.bffFetch.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith('/remove/') ? result(cart(), MSG_REMOVED) : result(one)),
    )
    renderWith(<MiniCart open onOpenChange={vi.fn()} />, one)
    const sheet = await screen.findByRole('dialog', { name: 'سبد خرید' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'حذف از سبد خرید' }))
    await within(sheet).findByRole('heading', { name: 'سبد خرید شما خالی است' })
    // Not the dialog itself (where Radix puts the focus of a removed element): its title.
    const title = within(sheet).getByRole('heading', { name: 'سبد خرید' })
    await waitFor(() => expect(title).toContainElement(document.activeElement as HTMLElement))
  })

  it('offers the home page when the cart is empty', async () => {
    serve(cart())
    const onOpenChange = vi.fn()
    renderWith(<MiniCart open onOpenChange={onOpenChange} />, cart())
    const sheet = await screen.findByRole('dialog', { name: 'سبد خرید' })
    expect(within(sheet).getByRole('heading', { name: 'سبد خرید شما خالی است' })).toBeVisible()
    expect(within(sheet).queryByRole('link', { name: 'ثبت سفارش' })).toBeNull()
    expect(within(sheet).getByRole('link', { name: /صفحه/ })).toHaveAttribute('href', '/')
  })
})
