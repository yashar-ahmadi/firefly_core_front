import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BuyBox } from '@/features/product/components/buy-box'
import { StickyBuyBar } from '@/features/product/components/sticky-buy-bar'
import { cart, cartLine, MSG_ADDED, result } from '../cart/support'
import { stubBrowserApis } from '../support/dom-stubs'
import { chipsProduct, s25Product } from './fixtures'
import { resetRouter } from './router'
import { renderWithProduct } from './support'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', async () => (await import('./router')).routerMock)
vi.mock('@/components/ui/toaster', () => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  resetRouter()
})

const bar = () => screen.getByRole('region', { name: 'نوار خرید' })

describe('StickyBuyBar', () => {
  it('is a phone-only bar fixed to the bottom, clear of the home indicator', () => {
    renderWithProduct(<StickyBuyBar />, { product: s25Product() })
    expect(bar()).toHaveClass('fixed', 'bottom-0', 'md:hidden', 'pb-[env(safe-area-inset-bottom)]')
    expect(within(bar()).getByText('۷۸٬۵۰۰٬۰۰۰')).toBeInTheDocument()
  })

  it('adds the selected variant with the quantity chosen in the buy box', async () => {
    const user = userEvent.setup()
    mocks.bffFetch.mockResolvedValue(result(cart([cartLine({ quantity: 2 })]), MSG_ADDED))
    renderWithProduct(
      <>
        <BuyBox contactPhone={null} />
        <StickyBuyBar />
      </>,
      { product: s25Product(), initialVariantId: 10002 },
    )
    const stepper = screen.getByRole('group', { name: 'تعداد' })
    await user.click(within(stepper).getByRole('button', { name: 'افزایش تعداد' }))
    await user.click(within(bar()).getByRole('button', { name: 'افزودن به سبد خرید' }))
    await waitFor(() =>
      expect(mocks.bffFetch).toHaveBeenCalledWith('cart/item/add/', {
        method: 'POST',
        body: { variant: 10002, quantity: 2 },
      }),
    )
  })

  it('leads to the back-in-stock form when nothing of the product can be bought', () => {
    renderWithProduct(<StickyBuyBar />, { product: chipsProduct() })
    expect(within(bar()).getByRole('link', { name: 'موجود شد خبرم کن' })).toHaveAttribute(
      'href',
      '#notify-me',
    )
    expect(within(bar()).queryByRole('button')).toBeNull()
  })

  it('says «ناموجود» instead when back-in-stock requests are switched off', () => {
    renderWithProduct(<StickyBuyBar />, { product: chipsProduct(), stockNotifications: false })
    expect(within(bar()).getByRole('button', { name: 'ناموجود' })).toBeDisabled()
    expect(within(bar()).queryByRole('link')).toBeNull()
  })

  it('cannot add a missing combination or an out-of-stock variant', () => {
    const { unmount } = renderWithProduct(<StickyBuyBar />, {
      product: s25Product({ default_variant_id: null }),
    })
    expect(within(bar()).getByRole('button', { name: 'این ترکیب موجود نیست' })).toBeDisabled()
    unmount()
    renderWithProduct(<StickyBuyBar />, { product: s25Product(), initialVariantId: 10004 })
    expect(within(bar()).getByRole('button', { name: 'ناموجود' })).toBeDisabled()
  })
})
