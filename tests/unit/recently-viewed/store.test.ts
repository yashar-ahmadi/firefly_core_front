import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RECENT_MAX, useRecentlyViewed } from '@/features/recently-viewed/store'
import { cardFixture } from '../catalog/card-fixtures'

const product = (n: number) => cardFixture({ id: n, slug: `product-${n}`, name: `کالای ${n}` })

const slugs = () => useRecentlyViewed.getState().items.map((item) => item.slug)

beforeEach(() => {
  localStorage.clear()
  useRecentlyViewed.setState({ items: [] })
})

describe('useRecentlyViewed', () => {
  it('puts the newest product first', () => {
    const { record } = useRecentlyViewed.getState()
    record(product(1))
    record(product(2))
    record(product(3))
    expect(slugs()).toEqual(['product-3', 'product-2', 'product-1'])
  })

  it('dedupes by slug, moving a revisited product to the front with its new data', () => {
    const { record } = useRecentlyViewed.getState()
    record(product(1))
    record(product(2))
    record({ ...product(1), final_price: 1000 })
    expect(slugs()).toEqual(['product-1', 'product-2'])
    expect(useRecentlyViewed.getState().items[0]?.final_price).toBe(1000)
  })

  it('keeps the 20 most recent', () => {
    const { record } = useRecentlyViewed.getState()
    expect(RECENT_MAX).toBe(20)
    for (let n = 1; n <= 25; n++) record(product(n))
    expect(slugs()).toHaveLength(20)
    expect(slugs()[0]).toBe('product-25')
    expect(slugs().at(-1)).toBe('product-6')
  })

  it('stores only the card fields, under ff-recent', () => {
    useRecentlyViewed.getState().record(product(1))
    const saved = JSON.parse(localStorage.getItem('ff-recent') ?? 'null')
    const [item] = saved.state.items
    expect(item.slug).toBe('product-1')
    expect(item.final_price).toBe(78_500_000)
    expect(item).not.toHaveProperty('brand')
    expect(item).not.toHaveProperty('created')
    expect(item).not.toHaveProperty('extra_detail')
  })

  it('clears', () => {
    useRecentlyViewed.getState().record(product(1))
    useRecentlyViewed.getState().clear()
    expect(useRecentlyViewed.getState().items).toEqual([])
  })

  it('keeps what was saved before the first record of a page', async () => {
    useRecentlyViewed.getState().record(product(1))
    useRecentlyViewed.getState().record(product(2))
    vi.resetModules()
    const fresh = await import('@/features/recently-viewed/store')
    fresh.useRecentlyViewed.getState().record(product(3))
    expect(fresh.useRecentlyViewed.getState().items.map((item) => item.slug)).toEqual([
      'product-3',
      'product-2',
      'product-1',
    ])
  })

  it('drops malformed saved entries', async () => {
    localStorage.setItem(
      'ff-recent',
      JSON.stringify({
        state: { items: [{ slug: 'x' }, 42, { ...product(1), brand: null }] },
        version: 0,
      }),
    )
    vi.resetModules()
    const fresh = await import('@/features/recently-viewed/store')
    await fresh.useRecentlyViewed.persist.rehydrate()
    expect(fresh.useRecentlyViewed.getState().items.map((item) => item.slug)).toEqual(['product-1'])
  })
})
