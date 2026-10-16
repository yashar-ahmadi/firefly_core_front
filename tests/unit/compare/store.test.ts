import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  COMPARE_MAX,
  compareItemFrom,
  useCompare,
  type CompareItem,
} from '@/features/compare/store'

const item = (n: number, categoryId: number | null = 10002): CompareItem => ({
  slug: `product-${n}`,
  name: `کالای ${n}`,
  image: `https://api.shop.ir/media/${n}.jpg`,
  categoryId,
})

function stored(): unknown {
  const raw = localStorage.getItem('ff-compare')
  return raw === null ? null : JSON.parse(raw)
}

beforeEach(() => {
  localStorage.clear()
  useCompare.setState({ items: [] })
})

describe('useCompare', () => {
  it('adds items up to four and rejects a fifth with "full"', () => {
    const { add } = useCompare.getState()
    expect(COMPARE_MAX).toBe(4)
    for (let n = 1; n <= 4; n++) expect(add(item(n))).toBe('added')
    expect(add(item(5))).toBe('full')
    expect(useCompare.getState().items.map((i) => i.slug)).toEqual([
      'product-1',
      'product-2',
      'product-3',
      'product-4',
    ])
  })

  it('rejects a slug that is already in the list with "exists"', () => {
    const { add } = useCompare.getState()
    add(item(1))
    expect(add({ ...item(1), name: 'نام دیگر' })).toBe('exists')
    expect(useCompare.getState().items).toHaveLength(1)
  })

  it('answers "exists" before "full" for a listed slug', () => {
    const { add } = useCompare.getState()
    for (let n = 1; n <= 4; n++) add(item(n))
    expect(add(item(2))).toBe('exists')
  })

  it('removes by slug and clears', () => {
    const { add, remove, clear } = useCompare.getState()
    add(item(1))
    add(item(2))
    remove('product-1')
    expect(useCompare.getState().items.map((i) => i.slug)).toEqual(['product-2'])
    clear()
    expect(useCompare.getState().items).toEqual([])
  })

  it('persists the items under ff-compare', () => {
    useCompare.getState().add(item(1))
    expect(stored()).toEqual({ state: { items: [item(1)] }, version: 0 })
  })

  it('reads the saved list before the first change, so nothing saved is lost', async () => {
    localStorage.setItem(
      'ff-compare',
      JSON.stringify({ state: { items: [item(1), item(2)] }, version: 0 }),
    )
    // A fresh store module that has not been rehydrated yet (skipHydration).
    vi.resetModules()
    const fresh = await import('@/features/compare/store')
    expect(fresh.useCompare.getState().items).toEqual([])
    expect(fresh.useCompare.getState().add(item(3))).toBe('added')
    expect(fresh.useCompare.getState().items.map((i) => i.slug)).toEqual([
      'product-1',
      'product-2',
      'product-3',
    ])
  })

  it('drops malformed saved entries', async () => {
    localStorage.setItem(
      'ff-compare',
      JSON.stringify({ state: { items: [item(1), { slug: 5 }, null, 'x'] }, version: 0 }),
    )
    vi.resetModules()
    const fresh = await import('@/features/compare/store')
    await fresh.useCompare.persist.rehydrate()
    expect(fresh.useCompare.getState().items).toEqual([item(1)])
  })
})

describe('compareItemFrom', () => {
  const card = {
    slug: 'nike-air-zoom-pegasus',
    name: 'کفش ورزشی مردانه نایکی Air Zoom Pegasus',
    image: 'https://api.shop.ir/media/nike.jpg',
  }

  it('takes the deepest of the direct categories', () => {
    expect(
      compareItemFrom({
        ...card,
        categories: [
          { id: 10013, name: 'مد و پوشاک', slug: 'fashion', parent_id: null },
          { id: 10016, name: 'کیف و کفش', slug: 'bag-and-shoes', parent_id: 10013 },
        ],
      }),
    ).toEqual({ ...card, categoryId: 10016 })
  })

  it('takes the first leaf when the categories are unrelated', () => {
    expect(
      compareItemFrom({
        ...card,
        categories: [
          { id: 10016, name: 'کیف و کفش', slug: 'bag-and-shoes', parent_id: 10013 },
          { id: 10025, name: 'لوازم ورزشی', slug: 'sport-equipment', parent_id: 10024 },
        ],
      }).categoryId,
    ).toBe(10016)
  })

  it('uses null when the card has no category', () => {
    expect(compareItemFrom({ ...card, categories: [] }).categoryId).toBeNull()
  })
})
