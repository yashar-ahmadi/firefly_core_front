import type { ProductCard } from '@/lib/api/types/catalog'

/**
 * The S25 Ultra card exactly as `GET /api/v1/product/list/` returns it in dev (2026-10-16).
 * Dev has no active discount, so discount fields are overridden per test.
 */
const S25_ULTRA: ProductCard = {
  id: 10001,
  name: 'گوشی موبایل سامسونگ گلکسی S25 اولترا',
  slug: 'samsung-galaxy-s25-ultra',
  extra_detail: 'دو سیم کارت، ۵G',
  image:
    'http://localhost:8000/media/CACHE/images/products/26/09/13/samsung-galaxy-s25-ultra/f6daa39fa5ced22ccc1b8265ccc98ebb.jpg',
  type: 'variable',
  badge: { id: 10001, name: 'پرفروش', badge_color: '#FF6D00', text_color: '#FFFFFF' },
  brand: {
    id: 10001,
    name: 'سامسونگ',
    slug: 'samsung',
    image: 'http://localhost:8000/static/defaults/default.png',
  },
  categories: [{ id: 10002, name: 'گوشی موبایل', slug: 'mobile-phone', parent_id: 10001 }],
  in_stock: true,
  is_special_product: true,
  is_collection: false,
  enable_major: false,
  rating: 4,
  rating_count: 3,
  default_variant_id: 10001,
  default_variant_attributes: [
    { attribute_name: 'رنگ', name: 'مشکی' },
    { attribute_name: 'حافظه داخلی', name: '۲۵۶ گیگابایت' },
    { attribute_name: 'حافظه رم', name: '۱۲ گیگابایت' },
  ],
  price: 78_500_000,
  final_price: 78_500_000,
  has_discount: false,
  discount_percent: 0,
  discount_end_time: null,
  discount_time_remaining: null,
  order_limit_min: 1,
  order_limit_max: 0,
  is_in_wishlist: false,
  created: '2025-11-17T15:00:00+03:30',
  updated: '2026-10-15T22:41:20.354527+03:30',
}

export function cardFixture(overrides: Partial<ProductCard> = {}): ProductCard {
  return { ...S25_ULTRA, ...overrides }
}

/** The fixture with a 25% discount: 78,500,000 → 58,875,000 Toman. */
export function discountedCard(overrides: Partial<ProductCard> = {}): ProductCard {
  return cardFixture({
    has_discount: true,
    discount_percent: 25,
    final_price: 58_875_000,
    ...overrides,
  })
}
