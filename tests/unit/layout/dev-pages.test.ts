import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertDevOnly } from '@/app/dev/dev-only'
import CategoryListingPreviewPage from '@/app/dev/listing/[category]/page'
import ListingPreviewPage from '@/app/dev/listing/page'

const api = vi.hoisted(() => ({
  getCategory: vi.fn(),
  getProductList: vi.fn(),
  getFilters: vi.fn(),
  getProductSettings: vi.fn(),
}))
vi.mock('@/features/catalog/api', () => api)
// The shop chrome's loaders are server-only; these tests never render it.
vi.mock('server-only', () => ({}))

/** What next/navigation's notFound() throws. */
const NOT_FOUND = /NEXT_HTTP_ERROR_FALLBACK;404/

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('development-only pages', () => {
  it('answer 404 in production, before loading anything', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => assertDevOnly()).toThrow(NOT_FOUND)
    expect(() => ListingPreviewPage({ searchParams: Promise.resolve({}) })).toThrow(NOT_FOUND)
    await expect(
      CategoryListingPreviewPage({
        params: Promise.resolve({ category: 'mobile-phone' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow(NOT_FOUND)
    expect(api.getCategory).not.toHaveBeenCalled()
  })

  it('render outside production', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(() => assertDevOnly()).not.toThrow()
    expect(ListingPreviewPage({ searchParams: Promise.resolve({}) })).toBeTruthy()
  })
})
