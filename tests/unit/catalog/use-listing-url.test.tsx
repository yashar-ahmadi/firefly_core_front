import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ListingUrlProvider,
  useListingPending,
  useListingUrl,
} from '@/features/catalog/components/listing/use-listing-url'
import type { ListingContext } from '@/features/catalog/listing-params'
import {
  finishNavigations,
  navigation,
  NavigatingRouter,
  resetNavigation,
  useRealScheduling,
} from './navigation-harness'

vi.mock('next/navigation', async () => (await import('./navigation-harness')).navigationMock)

const router = navigation

function renderListingUrl(
  search: string,
  {
    basePath = '/product/list/',
    context = {},
  }: { basePath?: string; context?: ListingContext } = {},
) {
  router.search = search
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ListingUrlProvider context={context} basePath={basePath}>
      {children}
    </ListingUrlProvider>
  )
  return renderHook(() => useListingUrl(), { wrapper }).result
}

beforeEach(() => {
  resetNavigation()
})

describe('useListingUrl', () => {
  it('drops the page on every change: set({ brand }) on ?page=3&sort=sale', () => {
    const result = renderListingUrl('page=3&sort=sale')
    act(() => result.current.set({ brand: ['apple'] }))
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/product/list/?brand=apple&sort=sale', {
      scroll: false,
    })
  })

  it('reads the URL filters and writes them back in sorted order, dropping unknown params', () => {
    const result = renderListingUrl('utm_source=x&sort=sale&brand=apple&limit=100')
    expect(result.current.query).toEqual({ brand: ['apple'], sort: 'sale' })
    act(() => result.current.set({ in_stock: true }))
    expect(router.replace).toHaveBeenCalledWith(
      '/product/list/?brand=apple&in_stock=true&sort=sale',
      {
        scroll: false,
      },
    )
  })

  it('never reads or writes the keys the route context supplies', () => {
    const result = renderListingUrl('category=laptop&brand=apple', {
      basePath: '/product-category/digital/mobile-phone/',
      context: { category: 'mobile-phone' },
    })
    expect(result.current.query).toEqual({ brand: ['apple'] })
    act(() => result.current.set({ has_discount: true }))
    expect(router.replace).toHaveBeenCalledWith(
      '/product-category/digital/mobile-phone/?brand=apple&has_discount=true',
      { scroll: false },
    )
  })

  it('removes a key set to undefined or an empty list, down to the bare path', () => {
    const result = renderListingUrl('brand=apple&min_price=1000')
    act(() => result.current.set({ brand: [], min_price: undefined }))
    expect(router.replace).toHaveBeenCalledWith('/product/list/', { scroll: false })
  })

  it('clear() removes every filter but keeps the sort and special_first', () => {
    const result = renderListingUrl(
      'brand=apple&attribute_values=10001&min_price=1&in_stock=true&search=x&category=laptop&sort=sale&special_first=false&page=2',
    )
    act(() => result.current.clear())
    expect(router.replace).toHaveBeenCalledWith('/product/list/?sort=sale&special_first=false', {
      scroll: false,
    })
  })

  it('does not navigate when the URL would not change', () => {
    const result = renderListingUrl('brand=apple')
    act(() => result.current.set({ brand: ['apple'] }))
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('throws outside a ListingUrlProvider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useListingUrl())).toThrow(/ListingUrlProvider/)
    vi.restoreAllMocks()
  })
})

describe('useListingUrl during a navigation', () => {
  useRealScheduling()

  it('builds quick changes on each other while the first navigation is still pending', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <NavigatingRouter initial="page=3&sort=sale">
        <ListingUrlProvider context={{}} basePath="/product/list/">
          {children}
        </ListingUrlProvider>
      </NavigatingRouter>
    )
    const { result } = renderHook(() => ({ url: useListingUrl(), pending: useListingPending() }), {
      wrapper,
    })
    result.current.url.set({ brand: ['apple'] })
    // Shown at once (useOptimistic), while the URL has not changed yet.
    await waitFor(() =>
      expect(result.current.url.query).toEqual({ brand: ['apple'], sort: 'sale' }),
    )
    expect(result.current.pending).toBe(true)
    result.current.url.set({ in_stock: true })
    expect(router.replace).toHaveBeenLastCalledWith(
      '/product/list/?brand=apple&in_stock=true&sort=sale',
      { scroll: false },
    )
    finishNavigations()
    await waitFor(() => expect(result.current.pending).toBe(false))
    expect(result.current.url.query).toEqual({ brand: ['apple'], in_stock: true, sort: 'sale' })
  })
})
