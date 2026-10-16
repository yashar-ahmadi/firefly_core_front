import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderSearchForm } from '@/components/layout/header-search-form'
import { ProductGallery } from '@/features/product/components/product-gallery'
import { CommentComposer } from '@/features/product/components/reviews/comment-composer'
import { QuickViewHost } from '@/features/quick-view/quick-view-host'
import { openQuickView, useQuickViewStore } from '@/features/quick-view/use-quick-view'
import { FeatureProvider } from '@/features/settings/feature-context'
import { s25Product } from '../product/fixtures'
import { renderWithProduct } from '../product/support'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'

// Every next/dynamic chunk can fail to load (a stale hash after a deploy, a dropped
// connection). Each must degrade where it is, never reach the root error page: Next's
// `loading` never sees the error, and React.lazy would throw it to the nearest boundary.

const mocks = vi.hoisted(() => ({
  loadPage: vi.fn(),
  reloadPage: vi.fn(),
  error: vi.fn(),
  /**
   * A module whose export cannot be read: every load fails the way a missing chunk does (a
   * throwing factory fails only the first import, and the hover preloads take that one).
   */
  broken: (name: string) =>
    Object.defineProperty({}, name, {
      enumerable: true,
      get() {
        throw new Error('ChunkLoadError: Loading chunk failed.')
      },
    }),
}))

vi.mock('@/features/quick-view/quick-view', () => mocks.broken('QuickView'))
vi.mock('@/features/product/components/gallery-lightbox', () => mocks.broken('GalleryLightbox'))
vi.mock('@/features/product/components/reviews/review-form', () => mocks.broken('ReviewForm'))
vi.mock('@/features/product/components/reviews/question-form', () => mocks.broken('QuestionForm'))
vi.mock('@/features/search/search-overlay', () => mocks.broken('SearchOverlay'))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  loadPage: mocks.loadPage,
  reloadPage: mocks.reloadPage,
}))
vi.mock('@/components/ui/toaster', () => ({
  notify: { error: mocks.error, success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', async () => (await import('../product/router')).routerMock)

stubBrowserApis()

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  mocks.loadPage.mockReset()
  mocks.reloadPage.mockReset()
  mocks.error.mockReset()
  consoleError = vi.spyOn(console, 'error')
})

afterEach(() => {
  // Nothing was thrown to an error boundary (React reports those on console.error).
  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockRestore()
})

function withProviders(ui: ReactNode) {
  const { wrapper: Base } = clientProviders()
  return render(
    <Base>
      <FeatureProvider initial={{}}>{ui}</FeatureProvider>
    </Base>,
  )
}

describe('quick view whose code cannot load', () => {
  it('goes to the product page instead, and the page stays up', async () => {
    useQuickViewStore.setState({ request: null, open: false })
    withProviders(
      <>
        <main>the page</main>
        <QuickViewHost />
      </>,
    )
    act(() => {
      openQuickView('samsung-galaxy-s25-ultra')
    })
    await waitFor(() =>
      expect(mocks.loadPage).toHaveBeenCalledWith('/product/samsung-galaxy-s25-ultra/'),
    )
    expect(screen.getByText('the page')).toBeInTheDocument()
  })
})

describe('the lightbox whose code cannot load', () => {
  // Pressed with fireEvent: no hover or focus preload runs alongside the loader (vitest hands a
  // concurrent second import of a failing mock the real module; browsers fail both).
  it('says so and leaves the gallery as it was', async () => {
    renderWithProduct(<ProductGallery />, { product: s25Product() })
    const region = screen.getByRole('region', { name: 'تصاویر محصول' })
    fireEvent.click(within(region).getAllByRole('button')[0]!)
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('region', { name: 'تصاویر محصول' })).toBeInTheDocument()
    // Pressing again says it again (the failure is not swallowed into silence).
    fireEvent.click(within(region).getAllByRole('button')[1]!)
    await waitFor(() => expect(mocks.error).toHaveBeenCalledTimes(2))
  })
})

describe('a comment form whose code cannot load', () => {
  it('explains in place and offers to reload the page', async () => {
    withProviders(<CommentComposer slug="samsung-galaxy-s25-ultra" type="comment" />)
    fireEvent.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('فرم بارگذاری نشد.')
    fireEvent.click(within(alert).getByRole('button', { name: 'بارگذاری دوباره صفحه' }))
    expect(mocks.reloadPage).toHaveBeenCalledTimes(1)
  })
})

describe('the phone search overlay whose code cannot load', () => {
  it('leaves the header field a plain search field, focused for typing', async () => {
    withProviders(<HeaderSearchForm size="md" overlay />)
    const field = screen.getByRole('searchbox', { name: 'جستجو' })
    await waitFor(() => expect(field).toHaveAttribute('readonly'))
    fireEvent.click(field)
    await waitFor(() => expect(field).not.toHaveAttribute('readonly'))
    expect(field).toHaveFocus()
    expect(field).not.toHaveAttribute('aria-haspopup')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('search')).toHaveAttribute('action', '/search/')
  })
})
