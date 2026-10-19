import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertDevOnly } from '@/app/dev/dev-only'
import CategoryListingPreviewPage from '@/app/dev/listing/[category]/page'
import ListingPreviewPage from '@/app/dev/listing/page'
import UiShowcasePage from '@/app/dev/ui/page'

const api = vi.hoisted(() => ({
  getCategory: vi.fn(),
  getProductList: vi.fn(),
  getFilters: vi.fn(),
  getProductSettings: vi.fn(),
}))
vi.mock('@/features/catalog/api', () => api)
// The shop chrome's loaders are server-only; these tests never render it.
vi.mock('server-only', () => ({}))

/** The `<main>` elements of a tree of host elements (components are not rendered). */
function mains(node: ReactNode): ReactElement<{ id?: string }>[] {
  if (Array.isArray(node)) return node.flatMap(mains)
  if (!isValidElement<{ children?: ReactNode }>(node)) return []
  const own = node.type === 'main' ? [node as ReactElement<{ id?: string }>] : []
  return [...own, ...mains(node.props.children)]
}

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

  it('the UI showcase’s <main> is the skip link’s target (id="main")', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const found = mains(UiShowcasePage())
    expect(found).toHaveLength(1)
    expect(found[0]?.props.id).toBe('main')
  })
})
