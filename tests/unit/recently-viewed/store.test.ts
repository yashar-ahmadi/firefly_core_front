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
    record({ ...product(1), name: 'نام تازه' })
    expect(slugs()).toEqual(['product-1', 'product-2'])
    expect(useRecentlyViewed.getState().items[0]?.name).toBe('نام تازه')
  })

  it('keeps the 20 most recent', () => {
    const { record } = useRecentlyViewed.getState()
    expect(RECENT_MAX).toBe(20)
    for (let n = 1; n <= 25; n++) record(product(n))
    expect(slugs()).toHaveLength(20)
    expect(slugs()[0]).toBe('product-25')
    expect(slugs().at(-1)).toBe('product-6')
  })

  it('stores only what the strip shows (no price or stock to go stale), under ff-recent', () => {
    useRecentlyViewed.getState().record(product(1))
    const saved = JSON.parse(localStorage.getItem('ff-recent') ?? 'null')
    const [item] = saved.state.items
    expect(item).toEqual({
      id: 1,
      slug: 'product-1',
      name: 'کالای 1',
      image: product(1).image,
    })
  })

  it('keeps an entry saved by an older version, without its prices', async () => {
    localStorage.setItem(
      'ff-recent',
      JSON.stringify({ state: { items: [product(1)] }, version: 0 }),
    )
    vi.resetModules()
    const fresh = await import('@/features/recently-viewed/store')
    await fresh.useRecentlyViewed.persist.rehydrate()
    expect(fresh.useRecentlyViewed.getState().items).toEqual([
      { id: 1, slug: 'product-1', name: 'کالای 1', image: product(1).image },
    ])
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
