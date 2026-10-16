import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RecordRecentlyViewed } from '@/features/product/components/record-recently-viewed'
import { useRecentlyViewed } from '@/features/recently-viewed/store'
import { s25Product } from './fixtures'
import { renderWithProduct } from './support'

vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', async () => (await import('./router')).routerMock)

beforeEach(() => {
  localStorage.clear()
  useRecentlyViewed.setState({ items: [] })
})

describe('RecordRecentlyViewed', () => {
  it('records the product once, on mount: its id, slug, name and image, never a price', () => {
    const product = s25Product()
    const { rerender } = renderWithProduct(<RecordRecentlyViewed />, { product })
    rerender(<RecordRecentlyViewed />)
    const { items } = useRecentlyViewed.getState()
    expect(items).toEqual([
      { id: 10001, slug: product.slug, name: product.name, image: product.image },
    ])
  })
})
