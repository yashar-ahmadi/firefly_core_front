import type { ProductCard } from '@/lib/api/types/catalog'

// The slice of a list-API card that a product card renders and its add button needs. Lists
// kept on the device (recently viewed) store only this. Pure: safe in any bundle.

export const CARD_PRODUCT_KEYS = [
  'id',
  'slug',
  'name',
  'image',
  'type',
  'badge',
  'categories',
  'in_stock',
  'rating',
  'rating_count',
  'default_variant_id',
  'default_variant_attributes',
  'price',
  'final_price',
  'has_discount',
  'discount_percent',
  'discount_time_remaining',
  'order_limit_min',
  'order_limit_max',
] as const satisfies readonly (keyof ProductCard)[]

/** Every `ProductCard` is one; so is a recently-viewed item. */
export type CardProduct = Pick<ProductCard, (typeof CARD_PRODUCT_KEYS)[number]>

/** A copy with only the card fields (drops brand, dates and the rest of a full payload). */
export function toCardProduct(product: CardProduct): CardProduct {
  return Object.fromEntries(CARD_PRODUCT_KEYS.map((key) => [key, product[key]])) as CardProduct
}

const isNumberOrNull = (value: unknown) => value === null || typeof value === 'number'

/** Whether saved data still has the shape the card reads (old or hand-edited storage). */
export function isCardProduct(value: unknown): value is CardProduct {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  return (
    typeof p.id === 'number' &&
    typeof p.slug === 'string' &&
    typeof p.name === 'string' &&
    typeof p.image === 'string' &&
    typeof p.type === 'string' &&
    typeof p.badge === 'object' &&
    Array.isArray(p.categories) &&
    typeof p.in_stock === 'boolean' &&
    typeof p.rating === 'number' &&
    typeof p.rating_count === 'number' &&
    isNumberOrNull(p.default_variant_id) &&
    Array.isArray(p.default_variant_attributes) &&
    isNumberOrNull(p.price) &&
    isNumberOrNull(p.final_price) &&
    typeof p.has_discount === 'boolean' &&
    typeof p.discount_percent === 'number' &&
    isNumberOrNull(p.discount_time_remaining) &&
    isNumberOrNull(p.order_limit_min) &&
    isNumberOrNull(p.order_limit_max)
  )
}
