import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderActions } from '@/components/layout/header-actions'
import { CartBadge } from '@/features/cart/components/cart-badge'
import { MiniCart } from '@/features/cart/components/mini-cart'
import { CART_KEY } from '@/features/cart/hooks'
import { FeatureProvider } from '@/features/settings/feature-context'
import { formatToman } from '@/lib/format'
import type { Cart } from '@/lib/api/types/cart'
import { minWidth, stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { cart, cartLine, MSG_REMOVED, result } from './support'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), error: vi.fn(), success: vi.fn() }))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ usePathname: () => '/' }))
vi.mock('@/components/ui/toaster', () => ({
  notify: { error: mocks.error, success: mocks.success, info: vi.fn(), dismiss: vi.fn() },
}))

const media = stubBrowserApis()
const VIEW_CART = 'مشاهده\u{0654} سبد خرید'
const SUMMARY_NOTE = 'هزینه\u{0654} ارسال و مالیات در مرحله\u{0654} بعد محاسبه می\u{200C}شود.'

/** Answers every cart read with `data`. */
function serve(data: Cart) {
  mocks.bffFetch.mockImplementation(() => Promise.resolve(result(data)))
}

function renderWith(ui: ReactNode, cached?: Cart) {
  const { client, wrapper: Wrapper } = clientProviders()
  if (cached) client.setQueryData(CART_KEY, cached)
  const utils = render(
    <FeatureProvider initial={{}}>
      <Wrapper>{ui}</Wrapper>
    </FeatureProvider>,
  )
  return { ...utils, client }
}

const TWO_LINES = cart(
  [
    cartLine({ quantity: 2 }),
    cartLine({
      variant_id: 10062,
      product_id: 10062,
      product_name: 'تلویزیون هایسنس ۵۵ اینچ U7',
      product_slug: 'hisense-tv-55-u7',
      variant_name: null,
      unit_final_price: 71_500_000,
    }),
  ],
  // Not the sum of the lines: the mini-cart shows the API's figure as it is. `total` (with tax)
  // is not shown before checkout.
  { goods_payable: 123_456_789, total: 987_654_321 },
)

beforeEach(() => {
  media.set(() => false)
  mocks.bffFetch.mockReset()
  mocks.error.mockReset()
  mocks.success.mockReset()
})

describe('CartBadge', () => {
  it('server-renders no count, hydrates cleanly and then shows the count', async () => {
    serve(cart([cartLine()]))
    const { client, wrapper: Wrapper } = clientProviders()
    client.setQueryData(CART_KEY, cart([cartLine()]))
    const ui = (
      <Wrapper>
        <span className="relative">
          <CartBadge />
        </span>
      </Wrapper>
    )
    const html = renderToString(ui)
    expect(html).toBe('<span class="relative"></span>')

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const consoleError = vi.spyOn(console, 'error')
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, ui)
    })
    expect(consoleError).not.toHaveBeenCalled()
    expect(container).toHaveTextContent('۱')
    consoleError.mockRestore()
    act(() => root?.unmount())
    container.remove()
  })

  it('caps the count at «۹۹+»', async () => {
    serve(cart([cartLine({ quantity: 150, available_quantity: 200 })]))
    renderWith(<CartBadge />)
    expect(await screen.findByText('۹۹+')).toBeInTheDocument()
  })
})

describe('HeaderActions cart', () => {
  it('names the count, and below md links to the cart page', async () => {
    serve(cart([cartLine({ quantity: 3 })]))
    renderWith(<HeaderActions />)
    const link = await screen.findByRole('link', { name: 'سبد خرید، ۳ کالا' })
    expect(link).toHaveAttribute('href', '/cart/')
    expect(link).not.toHaveAttribute('aria-haspopup')
  })

  it('from md opens the mini-cart, which reads the cart again', async () => {
    media.set(minWidth(48))
    serve(TWO_LINES)
    renderWith(<HeaderActions />)
    const link = await screen.findByRole('link', { name: 'سبد خرید، ۳ کالا' })
    await waitFor(() => expect(link).toHaveAttribute('aria-haspopup', 'dialog'))
    mocks.bffFetch.mockClear()

    await userEvent.click(link)
    const sheet = await screen.findByRole('dialog', { name: 'سبد خرید' })
    expect(link).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledWith('cart/', expect.anything()))
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(2)
  })
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
