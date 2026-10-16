import type { ProductCard } from '@/lib/api/types/catalog'

// The slice of a list-API card that a product card renders and its add button needs. Pure: safe
// in any bundle.

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

/** Every `ProductCard` is one. */
export type CardProduct = Pick<ProductCard, (typeof CARD_PRODUCT_KEYS)[number]>

/** A copy with only the card fields (drops brand, dates and the rest of a full payload). */
export function toCardProduct(product: CardProduct): CardProduct {
  return Object.fromEntries(CARD_PRODUCT_KEYS.map((key) => [key, product[key]])) as CardProduct
}
