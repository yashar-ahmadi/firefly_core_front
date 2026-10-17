import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/hooks'
import { productKey } from '@/features/product/product-query'
import { QuickViewHost } from '@/features/quick-view/quick-view-host'
import { openQuickView, useQuickViewStore } from '@/features/quick-view/use-quick-view'
import { FeatureProvider } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import { cart, cartLine, MSG_ADDED, result } from '../cart/support'
import { chipsProduct, s25Product } from '../product/fixtures'
import { minWidth, stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  pathname: '/product-category/digital/mobile-phone/',
}))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { success: mocks.success, error: mocks.error, info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}))

const media = stubBrowserApis()
const SLUG = 'samsung-galaxy-s25-ultra'
const NAME = 'گوشی موبایل سامسونگ گلکسی S25 اولترا'
const DETAILS = 'مشاهده\u{0654} جزئیات کامل'

/** Answers the product read with `product` (or the error) and an add with a cart. */
function serve(product: unknown) {
  mocks.bffFetch.mockImplementation((path: string) => {
    if (path === 'cart/item/add/') {
      return Promise.resolve(result(cart([cartLine()]), MSG_ADDED))
    }
    if (path.startsWith('product/detail/')) {
      return product instanceof Error
        ? Promise.reject(product)
        : Promise.resolve({ data: product, msg: '', status: 200 })
    }
    return Promise.resolve(result(cart()))
  })
}

function renderHost() {
  const { client, wrapper: Base } = clientProviders()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <FeatureProvider initial={{}}>{children}</FeatureProvider>
    </Base>
  )
  const utils = render(
    <>
      <button type="button" onClick={() => openQuickView(SLUG)}>
        opener
      </button>
      <QuickViewHost />
    </>,
    { wrapper },
  )
  return { ...utils, client }
}

const opener = () => screen.getByRole('button', { name: 'opener' })

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.success.mockReset()
  mocks.error.mockReset()
  mocks.pathname = '/product-category/digital/mobile-phone/'
  media.set(() => false)
  useQuickViewStore.setState({ request: null, open: false })
  window.history.replaceState(null, '', '/product-category/digital/mobile-phone/')
})

describe('openQuickView', () => {
  it('does nothing and says so without a host, so the caller can go to the product page', () => {
    useQuickViewStore.setState({ hosts: 0 })
    expect(openQuickView(SLUG)).toBe(false)
    expect(useQuickViewStore.getState().open).toBe(false)
  })
})

describe('QuickViewHost', () => {
  it('renders nothing until a product is asked for', () => {
    serve(s25Product())
    const { container } = renderHost()
    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('loads the product through the BFF with a skeleton, then shows it named by the product', async () => {
    serve(s25Product())
    const { client } = renderHost()
    await userEvent.click(opener())
    const sheet = await screen.findByRole('dialog')
    expect(mocks.bffFetch).toHaveBeenCalledWith(`product/detail/${SLUG}/`, {
      signal: expect.any(AbortSignal),
    })
    expect(await within(sheet).findByRole('heading', { name: NAME })).toBeInTheDocument()
    expect(client.getQueryData(productKey(SLUG))).toMatchObject({ slug: SLUG })
  })

  it('is a bottom sheet below md and a centred dialog from md', async () => {
    serve(s25Product())
    renderHost()
    await userEvent.click(opener())
    expect(await screen.findByRole('dialog')).toHaveAttribute('data-vaul-drawer')
    act(() => useQuickViewStore.setState({ open: false }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    media.set(minWidth(48))
    await userEvent.click(opener())
    const dialog = await screen.findByRole('dialog')
    expect(dialog).not.toHaveAttribute('data-vaul-drawer')
    expect(dialog).toHaveClass('top-1/2')
  })

  it('preselects the representative variant, with the picker, price and stepper', async () => {
    serve(s25Product())
    renderHost()
    await userEvent.click(opener())
    const sheet = await screen.findByRole('dialog')
    const colours = await within(sheet).findByRole('radiogroup', { name: 'رنگ' })
    expect(within(colours).getByRole('radio', { name: /^مشکی/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(within(sheet).getAllByText('۷۸٬۵۰۰٬۰۰۰').length).toBeGreaterThan(0)
    expect(within(sheet).getByRole('group', { name: 'تعداد' })).toBeInTheDocument()
    expect(within(sheet).getByRole('link', { name: DETAILS })).toHaveAttribute(
      'href',
      `/product/${SLUG}/?variant=10001`,
    )
  })

  it('opens on a variant the opener names', async () => {
    serve(s25Product())
    renderHost()
    act(() => {
      openQuickView(SLUG, { variantId: 10003 })
    })
    const sheet = await screen.findByRole('dialog')
    const colours = await within(sheet).findByRole('radiogroup', { name: 'رنگ' })
    expect(within(colours).getByRole('radio', { name: /^طلایی/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('follows the choice without touching the page URL', async () => {
    const replaceState = vi.spyOn(window.history, 'replaceState')
    serve(s25Product())
    renderHost()
    await userEvent.click(opener())
    const sheet = await screen.findByRole('dialog')
    const storage = await within(sheet).findByRole('radiogroup', { name: 'حافظه داخلی' })
    await userEvent.click(within(storage).getByRole('radio', { name: /^۵۱۲ گیگابایت/ }))
    expect(within(sheet).getByRole('link', { name: DETAILS })).toHaveAttribute(
      'href',
      `/product/${SLUG}/?variant=10002`,
    )
    expect(replaceState).not.toHaveBeenCalled()
    replaceState.mockRestore()
  })

  it('adds the chosen variant, then closes with the toast and gives the focus back', async () => {
    serve(s25Product())
    const { client } = renderHost()
    await userEvent.click(opener())
    const sheet = await screen.findByRole('dialog')
    await within(sheet).findByRole('radiogroup', { name: 'رنگ' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'افزودن به سبد خرید' }))
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/item/add/', {
      method: 'POST',
      body: { variant: 10001, quantity: 1 },
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mocks.success).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(CART_KEY)).toBeDefined()
    await waitFor(() => expect(opener()).toHaveFocus())
  })

  it('names why nothing can be added instead of the add button', async () => {
    serve(chipsProduct())
    renderHost()
    await userEvent.click(opener())
    const sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByRole('button', { name: 'ناموجود' })).toBeDisabled()
    expect(within(sheet).queryByRole('group', { name: 'تعداد' })).toBeNull()
  })

  it('says when the product is gone (404)', async () => {
    serve(new ApiError({ status: 404, code: 'not_found' }))
    renderHost()
    await userEvent.click(opener())
    const sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByText('این کالا دیگر موجود نیست')).toBeInTheDocument()
    expect(within(sheet).queryByRole('button', { name: 'تلاش دوباره' })).toBeNull()
  })

  it('offers a retry when the product cannot be loaded', async () => {
    // Throttled: not retried by the query client, so the error shows at once.
    serve(new ApiError({ status: 429, code: 'throttled' }))
    renderHost()
    await userEvent.click(opener())
    const sheet = await screen.findByRole('dialog')
    const retry = await within(sheet).findByRole('button', { name: 'تلاش دوباره' })
    serve(s25Product())
    await userEvent.click(retry)
    expect(await within(sheet).findByRole('heading', { name: NAME })).toBeInTheDocument()
  })

  it('closes when the page changes under it', async () => {
    serve(s25Product())
    const { rerender } = renderHost()
    await userEvent.click(opener())
    await screen.findByRole('dialog')
    mocks.pathname = '/product/samsung-galaxy-s25-ultra/'
    rerender(
      <>
        <button type="button" onClick={() => openQuickView(SLUG)}>
          opener
        </button>
        <QuickViewHost />
      </>,
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
