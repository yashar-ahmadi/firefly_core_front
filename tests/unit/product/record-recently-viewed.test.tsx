import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cardFromDetail } from '@/features/product/card-from-detail'
import { RecordRecentlyViewed } from '@/features/product/components/record-recently-viewed'
import { useRecentlyViewed } from '@/features/recently-viewed/store'
import { CARD_PRODUCT_KEYS } from '@/features/catalog/card-product'
import { chipsProduct, s25Product, withVariants } from './fixtures'
import { renderWithProduct } from './support'

vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', async () => (await import('./router')).routerMock)

beforeEach(() => {
  localStorage.clear()
  useRecentlyViewed.setState({ items: [] })
})

describe('cardFromDetail', () => {
  it('is the card a list would show: the default variant, its labels in axis order', () => {
    const card = cardFromDetail(s25Product())
    expect(Object.keys(card).sort()).toEqual([...CARD_PRODUCT_KEYS].sort())
    expect(card).toMatchObject({
      id: 10001,
      slug: 'samsung-galaxy-s25-ultra',
      type: 'variable',
      in_stock: true,
      default_variant_id: 10001,
      price: 78_500_000,
      final_price: 78_500_000,
      has_discount: false,
      discount_percent: 0,
      discount_time_remaining: null,
      order_limit_min: 1,
      order_limit_max: 0,
      rating: 4,
      rating_count: 3,
    })
    expect(card.default_variant_attributes).toEqual([
      { attribute_name: 'رنگ', name: 'مشکی' },
      { attribute_name: 'حافظه داخلی', name: '۲۵۶ گیگابایت' },
      { attribute_name: 'حافظه رم', name: '۱۲ گیگابایت' },
    ])
  })

  it('carries a timed discount end only while discounted', () => {
    const end = Date.parse('2026-10-20T00:00:00Z')
    const discounted = withVariants(() => ({
      has_discount: true,
      discount_percent: 10,
      final_price: 70_650_000,
      discount_time_remaining: end,
    }))
    expect(cardFromDetail(discounted)).toMatchObject({
      has_discount: true,
      final_price: 70_650_000,
      discount_time_remaining: end,
    })
  })

  it('has no prices and no labels without a default variant', () => {
    const card = cardFromDetail(chipsProduct({ default_variant_id: null, variants: [] }))
    expect(card).toMatchObject({
      price: null,
      final_price: null,
      order_limit_min: null,
      default_variant_attributes: [],
    })
  })
})

describe('RecordRecentlyViewed', () => {
  it('records the card subset once, on mount', () => {
    const { rerender } = renderWithProduct(<RecordRecentlyViewed />, { product: s25Product() })
    rerender(<RecordRecentlyViewed />)
    const { items } = useRecentlyViewed.getState()
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual(cardFromDetail(s25Product()))
  })
})
