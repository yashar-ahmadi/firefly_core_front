import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { CheckoutPage } from '@/features/checkout/checkout-page'
import { FeatureProvider } from '@/features/settings/feature-context'
import type { Address, Cart } from '@/lib/api/types/cart'
import { useSession } from '@/lib/session/session-context'
import { cartLine } from '../cart/support'
import { emptyCartFixture } from '../cart/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { checkoutProps } from '../payment/fixtures'
import { address, addressCart, codCart, noDestinationCart, tehranOptions } from './fixtures'

// `/checkout/` as a whole (Plan 4 Task 2): one page in numbered steps, its entry guards (an
// empty cart, lines that cannot be ordered: the cart page's CTA is a link, so a middle-click
// still opens this page), the summary from the API's fields, and a session that ends on it.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

const ok = (data: unknown) => ({ data, msg: '', status: 200 })
const book = (results: Address[]) => ({ count: results.length, total_pages: 1, results })

function serve(cart: () => Cart, addresses: Address[] = [address()]) {
  mocks.bffFetch.mockImplementation((path: string) => {
    if (path === 'cart/') return Promise.resolve(ok(cart()))
    if (path === 'account/address/list/') return Promise.resolve(ok(book(addresses)))
    if (path === 'cart/shipping/option/list/') return Promise.resolve(ok(tehranOptions()))
    if (path === 'cart/destination/') return Promise.resolve(ok(addressCart()))
    // The operator's default is chosen for the shopper (shipping-auto-select.test.tsx).
    if (path === 'cart/shipping/select/') {
      return Promise.resolve(ok({ ...cart(), shipping: codCart().shipping }))
    }
    return new Promise(() => {})
  })
}

function SessionSwitch() {
  const { setHasSession } = useSession()
  return (
    <button type="button" onClick={() => setHasSession(false)}>
      پایان نشست
    </button>
  )
}

function renderPage(cart: Cart | undefined, hasSession = true) {
  const { client, wrapper: Wrapper } = clientProviders({ hasSession })
  if (cart) client.setQueryData(CART_KEY, cart)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FeatureProvider initial={{}}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
  return {
    client,
    ...render(
      <>
        <h1 id="checkout-heading" tabIndex={-1}>
          تکمیل خرید
        </h1>
        <CheckoutPage {...checkoutProps()} />
        <SessionSwitch />
      </>,
      { wrapper },
    ),
  }
}

const section = (name: RegExp) => screen.getByRole('region', { name })

beforeEach(() => {
  mocks.bffFetch.mockReset()
  sessionStorage.clear()
})

describe('CheckoutPage', () => {
  it('shows a skeleton while the cart is read', () => {
    mocks.bffFetch.mockImplementation(() => new Promise(() => {}))
    renderPage(undefined)
    expect(screen.getByRole('status', { name: 'در حال بارگذاری' })).toBeInTheDocument()
  })

  it('an empty cart (or a guest cart that is gone): a way back to the cart and home', () => {
    serve(emptyCartFixture)
    renderPage(emptyCartFixture(), false)
    expect(screen.getByRole('heading', { name: 'سبد خرید شما خالی است' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'مشاهده\u{0654} سبد خرید' })).toHaveAttribute(
      'href',
      '/cart/',
    )
    expect(screen.getByRole('link', { name: /صفحه\u{0654} اصلی/u })).toHaveAttribute('href', '/')
    expect(screen.queryByRole('region', { name: /گیرنده و آدرس/ })).not.toBeInTheDocument()
  })

  it('lines that cannot be ordered: a banner back to the cart, every step locked', async () => {
    const cart = noDestinationCart({
      is_orderable: false,
      lines: [cartLine({ issue: 'insufficient_stock', available_quantity: 1, quantity: 3 })],
    })
    serve(() => cart)
    renderPage(cart)
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent('برخی کالاهای سبد خرید قابل سفارش نیستند')
    expect(within(banner).getByRole('link', { name: 'بازگشت به سبد خرید' })).toHaveAttribute(
      'href',
      '/cart/',
    )
    expect(section(/گیرنده و آدرس/)).toHaveAttribute('data-state', 'locked')
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
    expect(mocks.bffFetch).not.toHaveBeenCalledWith('cart/destination/', expect.anything())
  })

  it('numbered sections with their own headings; later steps wait for the earlier ones', async () => {
    serve(() => noDestinationCart(), [])
    renderPage(noDestinationCart())
    // The page's skeleton while the book is read for a default (first-visit.test.tsx).
    expect(await screen.findByRole('region', { name: /۱.*گیرنده و آدرس/ })).toHaveAttribute(
      'data-state',
      'active',
    )
    expect(section(/۲.*روش ارسال/)).toHaveAttribute('data-state', 'locked')
    expect(section(/۳.*پرداخت/)).toHaveAttribute('data-state', 'locked')
    expect(section(/۴.*بازبینی/)).toHaveAttribute('data-state', 'locked')
  })

  it('a done step says what was chosen, and «ویرایش» opens it again', async () => {
    const user = userEvent.setup()
    const cart = addressCart(address(), { shipping: codCart().shipping })
    serve(() => cart)
    renderPage(cart)
    const receiver = await screen.findByRole('region', { name: /گیرنده و آدرس/ })
    expect(receiver).toHaveAttribute('data-state', 'done')
    expect(receiver).toHaveTextContent('خانه')
    expect(section(/روش ارسال/)).toHaveTextContent('پیک موتوری تهران')
    await user.click(within(receiver).getByRole('button', { name: /ویرایش/ }))
    expect(section(/گیرنده و آدرس/)).toHaveAttribute('data-state', 'active')
    expect(await screen.findByRole('radiogroup', { name: 'آدرس ارسال' })).toBeInTheDocument()
  })

  it('a choice of the shopper’s keeps the shipping step open (its COD box) until «ادامه»', async () => {
    const user = userEvent.setup()
    const cart = addressCart(address(), { shipping: codCart().shipping })
    serve(() => cart)
    renderPage(cart)
    const shipping = await screen.findByRole('region', { name: /روش ارسال/ })
    await user.click(within(shipping).getByRole('button', { name: /ویرایش/ }))
    await user.click(await screen.findByRole('radio', { name: /پست سفارشی/ }))
    await waitFor(() =>
      expect(mocks.bffFetch).toHaveBeenCalledWith('cart/shipping/select/', expect.anything()),
    )
    expect(section(/روش ارسال/)).toHaveAttribute('data-state', 'active')
    await user.click(screen.getByRole('button', { name: 'ادامه با این روش ارسال' }))
    expect(section(/روش ارسال/)).toHaveAttribute('data-state', 'done')
  })

  it('the summary is the API’s: its total, on phones folded under «جمع کل»', async () => {
    const cart = addressCart(address(), { shipping: codCart().shipping, total: 2_438_000 })
    serve(() => cart)
    renderPage(cart)
    await screen.findByRole('region', { name: /بازبینی/ })
    expect(screen.getAllByRole('heading', { name: 'خلاصه\u{0654} سفارش' }).length).toBeGreaterThan(
      0,
    )
    const folded = document.querySelector('details[data-summary="phone"]')!
    expect(folded.querySelector('summary')).toHaveTextContent('جمع کل: ۲٬۴۳۸٬۰۰۰ تومان')
    expect(folded.querySelector('summary')).toHaveTextContent('مشاهده\u{0654} جزئیات')
  })

  it('moves the focus to the next step’s heading when the shopper finishes one', async () => {
    const user = userEvent.setup()
    const home = address()
    const work = address({ id: 10019, title: 'محل کار', is_default: false })
    serve(() => addressCart(work), [home, work])
    renderPage(addressCart(work))
    // After the operator's default shipping, chosen on arrival behind the page's skeleton.
    const receiver = await screen.findByRole('region', { name: /گیرنده و آدرس/ })
    await user.click(within(receiver).getByRole('button', { name: /ویرایش/ }))
    await user.click(await screen.findByRole('radio', { name: /خانه/ }))
    await waitFor(() => expect(screen.getByRole('heading', { name: /روش ارسال/ })).toHaveFocus())
  })

  it('a session that ends on the page: the signed-in sections go, login is offered', async () => {
    const user = userEvent.setup()
    serve(() => addressCart())
    renderPage(addressCart())
    expect(await screen.findByText(/خانه/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'پایان نشست' }))
    expect(screen.queryByRole('region', { name: /گیرنده و آدرس/ })).not.toBeInTheDocument()
    expect(screen.queryByText(address().full_address)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'ورود دوباره' })).toHaveAttribute(
      'href',
      '/login/?next=/checkout/',
    )
    await act(async () => {})
  })
})
