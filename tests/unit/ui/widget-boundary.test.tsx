import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { HeaderActions } from '@/components/layout/header-actions'
import { WidgetBoundary } from '@/components/ui/widget-boundary'
import { FeatureProvider } from '@/features/settings/feature-context'
import { minWidth, stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'

vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/' }))
vi.mock('@/features/cart/components/mini-cart', () => ({
  MiniCart: () => {
    throw new Error('mini-cart render bug')
  },
}))

const media = stubBrowserApis()

function Broken(): never {
  throw new Error('widget render bug')
}

let consoleError: MockInstance<typeof console.error>

beforeEach(() => {
  // React reports every error a boundary catches; the boundary logs its own line too.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('WidgetBoundary', () => {
  it('renders its widget while nothing fails', () => {
    render(
      <WidgetBoundary name="compare-bar">
        <p>widget</p>
      </WidgetBoundary>,
    )
    expect(screen.getByText('widget')).toBeInTheDocument()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('keeps a render error to the widget: the page beside it stays, and the error is logged', () => {
    render(
      <main>
        <p>page</p>
        <WidgetBoundary name="compare-bar">
          <Broken />
        </WidgetBoundary>
      </main>,
    )
    expect(screen.getByText('page')).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent(/^page$/)
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('compare-bar'),
      expect.objectContaining({ message: 'widget render bug' }),
    )
  })

  it('shows its fallback instead of a failed widget', () => {
    render(
      <WidgetBoundary name="search" fallback={<p>plain search</p>}>
        <Broken />
      </WidgetBoundary>,
    )
    expect(screen.getByText('plain search')).toBeInTheDocument()
  })
})

describe('the header actions', () => {
  it('keep the cart link, as a plain link to the cart page, when the mini-cart fails to render', async () => {
    // From md the link would open the mini-cart.
    media.set(minWidth(48))
    const { wrapper: Wrapper } = clientProviders()
    render(
      <FeatureProvider initial={{}}>
        <Wrapper>
          <HeaderActions />
        </Wrapper>
      </FeatureProvider>,
    )
    const link = await screen.findByRole('link', { name: /^سبد خرید/ })
    expect(link).toHaveAttribute('href', '/cart/')
    expect(link).not.toHaveAttribute('aria-haspopup')
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('mini-cart'),
      expect.objectContaining({ message: 'mini-cart render bug' }),
    )
  })
})
