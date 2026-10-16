import type { ProductDetail } from '@/lib/api/types/catalog'

// The slice of the product payload the page's Client Components read (gallery, picker, buy box,
// buy bar, notify-me, recently viewed). The page hands only this to the browser: the content,
// specifications, related products and JSON-LD render on the server and stay there. Pure.

export const CLIENT_PRODUCT_KEYS = [
  'id',
  'slug',
  'name',
  'image',
  'type',
  'badge',
  'categories',
  'gallery',
  'variants',
  'variant_options',
  'default_variant_id',
  'in_stock',
  'rating',
  'rating_count',
  'enable_major',
] as const satisfies readonly (keyof ProductDetail)[]

/** Every `ProductDetail` is one. */
export type ClientProduct = Pick<ProductDetail, (typeof CLIENT_PRODUCT_KEYS)[number]>

/** A copy with only those fields. */
export function toClientProduct(product: ClientProduct): ClientProduct {
  return Object.fromEntries(CLIENT_PRODUCT_KEYS.map((key) => [key, product[key]])) as ClientProduct
}
