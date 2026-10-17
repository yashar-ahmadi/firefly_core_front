import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { CartPage } from '@/features/cart/components/cart-page'
import { FeatureProvider } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import type { Cart } from '@/lib/api/types/cart'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { emptyCartFixture, itemsCartFixture } from './fixtures'
import { deferred } from './support'

// The cart page as a whole: loading, empty, a read that failed, the checkout call to action and
// why it can be held back, the phone's bottom bar, and clearing the cart.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), expire: vi.fn(), success: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/lib/session/use-session-expired', () => ({ useSessionExpired: () => mocks.expire }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/cart/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => true,
  notify: { success: mocks.success, error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))

stubBrowserApis()
const CONTINUE = 'ادامه\u{0654} خرید'

function renderPage({ cart, hasSession = false }: { cart?: Cart; hasSession?: boolean } = {}) {
  const { client, wrapper: Wrapper } = clientProviders({ hasSession })
  if (cart) client.setQueryData(CART_KEY, cart)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FeatureProvider initial={{}}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
  // The page's heading is the server page's (src/app/(shop)/cart/page.tsx).
  const page = (
    <>
      <h1 id="cart-heading" tabIndex={-1}>
        سبد خرید
      </h1>
      <CartPage />
    </>
  )
  return { client, ...render(page, { wrapper }) }
}

const serve = (cart: Cart) =>
  mocks.bffFetch.mockImplementation(() => Promise.resolve({ data: cart, msg: '', status: 200 }))

/** The call to action of the summary (from md) or of the phone's bar. */
const ctas = () => screen.getAllByRole('link', { name: CONTINUE })

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.expire.mockReset()
  mocks.success.mockReset()
})

afterEach(() => document.body.removeAttribute('data-cart-bar-shown'))

describe('CartPage', () => {
  it('shows a skeleton while the cart is read', () => {
    mocks.bffFetch.mockImplementation(() => new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('status', { name: 'در حال بارگذاری سبد خرید' })).toBeInTheDocument()
  })

  it('an empty cart: the illustration, the way home, and for a guest the way to a saved cart', () => {
    renderPage({ cart: emptyCartFixture() })
    expect(screen.getByRole('heading', { level: 2, name: 'سبد خرید شما خالی است' })).toBeVisible()
    expect(document.querySelector('[data-illustration="empty-cart"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(screen.getByRole('link', { name: /صفحه\u{0654} اصلی/u })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'وارد حساب شوید' })).toHaveAttribute(
      'href',
      '/login/?next=/cart/',
    )
    expect(screen.queryByRole('link', { name: CONTINUE })).toBeNull()
  })

  it('signed in, an empty cart has no login hint', () => {
    renderPage({ cart: emptyCartFixture(), hasSession: true })
    expect(screen.queryByRole('link', { name: 'وارد حساب شوید' })).toBeNull()
  })

  it('lists the lines with the summary, the coupon box and the way on to checkout', () => {
    renderPage({ cart: itemsCartFixture() })
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    // The lines' own heading (visually hidden) comes before their names (h3).
    const lines = screen.getByRole('region', { name: 'کالاهای سبد خرید' })
    expect(within(lines).getByRole('heading', { level: 2 })).toHaveTextContent('کالاهای سبد خرید')
    expect(screen.getByRole('region', { name: 'خلاصه\u{0654} سبد خرید' })).toBeInTheDocument()
    expect(screen.getByLabelText('کد تخفیف دارید؟')).toBeInTheDocument()
    for (const link of ctas()) expect(link).toHaveAttribute('href', '/checkout/')
  })

  it('holds checkout back, saying why, while a line cannot be ordered as it is', () => {
    const cart = itemsCartFixture()
    cart.is_orderable = false
    cart.lines[1] = { ...cart.lines[1]!, issue: 'unavailable', in_stock: false }
    renderPage({ cart })
    const held = ctas()
    expect(held.length).toBeGreaterThan(0)
    for (const link of held) {
      expect(link).toHaveAttribute('aria-disabled', 'true')
      expect(link).toHaveAccessibleDescription('برخی کالاها قابل سفارش نیستند.')
    }
    // A blocking reason is said in the danger colour.
    expect(screen.getAllByText('برخی کالاها قابل سفارش نیستند.')[0]).toHaveClass('text-danger')
  })

  it('holds checkout back while a change to the cart is on its way', async () => {
    const user = userEvent.setup()
    const write = deferred<{ data: Cart; msg: string; status: number }>()
    mocks.bffFetch.mockImplementation(() => write.promise)
    renderPage({ cart: itemsCartFixture() })
    const [cta] = ctas()
    await user.type(screen.getByLabelText('کد تخفیف دارید؟'), 'TEA30')
    await user.click(screen.getByRole('button', { name: 'اعمال کد' }))
    for (const link of ctas()) {
      expect(link).toHaveAttribute('aria-disabled', 'true')
      expect(link).toHaveAccessibleDescription('در حال ذخیره\u{0654} تغییرات\u{2026}')
    }
    // Waiting is no fault: said in a neutral tone.
    expect(screen.getAllByText('در حال ذخیره\u{0654} تغییرات\u{2026}')[0]).toHaveClass(
      'text-ink-600',
    )
    cta!.focus()
    await act(async () => write.resolve({ data: itemsCartFixture(), msg: '', status: 200 }))
    await waitFor(() => expect(cta).not.toHaveAttribute('aria-disabled'))
    // One element throughout: the focus stayed on it.
    expect(cta).toHaveFocus()
    expect(ctas()[0]).toBe(cta)
  })

  it('a cart that could not be read: what happened and «تلاش دوباره»', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockImplementation(() => Promise.reject(ApiError.network()))
    renderPage()
    const retry = await screen.findByRole('button', { name: 'تلاش دوباره' }, { timeout: 5000 })
    expect(screen.getByText('سبد خرید بارگذاری نشد.')).toBeInTheDocument()
    serve(itemsCartFixture())
    await user.click(retry)
    expect(await screen.findAllByRole('listitem')).toHaveLength(2)
  })

  it('a read that meets the end of the session ends it (the session-expired helper)', async () => {
    mocks.bffFetch.mockImplementation(() =>
      Promise.reject(new ApiError({ status: 401, code: 'token_not_valid' })),
    )
    renderPage({ hasSession: true })
    await waitFor(() => expect(mocks.expire).toHaveBeenCalledTimes(1))
  })

  it('the phone’s bottom bar: the total and the way on, in the bottom navigation’s place', () => {
    const { unmount } = renderPage({ cart: itemsCartFixture() })
    const bar = screen.getByRole('region', { name: 'نوار سبد خرید' })
    expect(bar).toHaveAttribute('data-cart-bar')
    expect(bar).toHaveTextContent('۲٬۳۴۳٬۰۰۰ تومان')
    expect(within(bar).getByRole('link', { name: CONTINUE })).toHaveAttribute('href', '/checkout/')
    expect(document.body).toHaveAttribute('data-cart-bar-shown')
    unmount()
    expect(document.body).not.toHaveAttribute('data-cart-bar-shown')
  })

  it('clears the cart after asking: `cart/clear/`, then the empty state', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockImplementation((path: string) =>
      Promise.resolve({
        data: path === 'cart/clear/' ? emptyCartFixture() : itemsCartFixture(),
        msg: '',
        status: 200,
      }),
    )
    renderPage({ cart: itemsCartFixture() })
    await user.click(screen.getByRole('button', { name: 'حذف همه' }))
    const dialog = screen.getByRole('dialog', { name: 'همه\u{0654} کالاها از سبد خرید حذف شوند؟' })
    await user.click(within(dialog).getByRole('button', { name: 'حذف همه' }))
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/clear/', { method: 'DELETE' })
    expect(await screen.findByRole('heading', { name: 'سبد خرید شما خالی است' })).toBeVisible()
  })

  it('«بازگردانی» on an emptied cart: the focus waits on the heading, then goes to the line', async () => {
    const user = userEvent.setup()
    const cart = itemsCartFixture()
    const one = { ...cart, item_count: 1, lines: cart.lines.slice(1) }
    mocks.bffFetch.mockImplementation((path: string) =>
      Promise.resolve({
        data: path.endsWith('/remove/') ? emptyCartFixture() : one,
        msg: '',
        status: 200,
      }),
    )
    renderPage({ cart: one })
    await user.click(screen.getByRole('button', { name: 'حذف از سبد خرید' }))
    expect(await screen.findByRole('heading', { name: 'سبد خرید شما خالی است' })).toBeVisible()
    await waitFor(() => expect(mocks.success).toHaveBeenCalled())
    const [, options] = mocks.success.mock.calls.at(-1)!
    act(() => options.action.onClick())
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    const name = await screen.findByRole('link', { name: 'قهوه فوری نستله گلد' })
    await waitFor(() => expect(name).toHaveFocus())
  })
})
