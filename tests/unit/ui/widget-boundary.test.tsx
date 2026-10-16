import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
const navigation = vi.hoisted(() => ({ loadPage: vi.fn(), reloadPage: vi.fn() }))
vi.mock('@/lib/navigation/hard-navigation', () => navigation)

const media = stubBrowserApis()

function Broken(): never {
  throw new Error('widget render bug')
}

let consoleError: MockInstance<typeof console.error>

beforeEach(() => {
  // React (and Next's onCaughtError in production) reports every error a boundary catches.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

/** The console.error calls that carry the error with `message`. */
function reports(message: string) {
  return consoleError.mock.calls.filter((args) =>
    args.some((arg) => arg instanceof Error && arg.message === message),
  )
}

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

  it('keeps a render error to the widget: the page beside it stays, and the error is reported once', () => {
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
    // React's report names the failed component and the boundary; the boundary adds none.
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(reports('widget render bug')).toHaveLength(1)
  })

  it('tells its owner that the widget failed', () => {
    const onError = vi.fn()
    render(
      <WidgetBoundary name="search-overlay" onError={onError}>
        <Broken />
      </WidgetBoundary>,
    )
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'widget render bug' }))
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
    // From md the link opens the mini-cart, which is mounted on that first opening.
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
    await waitFor(() => expect(link).toHaveAttribute('aria-haspopup', 'dialog'))
    expect(reports('mini-cart render bug')).toHaveLength(0)

    // A bare click: Vitest can hand the real module to a dynamic import that overlaps another
    // one of a mocked module, and a hover or focus would start the preload import first.
    fireEvent.click(link)
    // The visitor asked for the cart: the cart page opens, and the icon is a plain link again.
    await waitFor(() => expect(navigation.loadPage).toHaveBeenCalledWith('/cart/'))
    expect(link).toHaveAttribute('href', '/cart/')
    expect(link).not.toHaveAttribute('aria-haspopup')
    expect(reports('mini-cart render bug')).toHaveLength(1)
  })
})
