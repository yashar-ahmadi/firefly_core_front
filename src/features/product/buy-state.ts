import type { Variant } from '@/lib/api/types/catalog'
import type { ClientProduct } from './client-product'

// Whether the buy buttons work, and what they say when they cannot (review focus 1). Pure.

export const NO_SUCH_COMBO = 'این ترکیب موجود نیست'
export const OUT_OF_STOCK = 'ناموجود'

/**
 * null when `variant` can be bought; else the disabled button's label: «این ترکیب موجود نیست»
 * for a selection that is no variant, «ناموجود» for an out-of-stock variant or a product
 * without variants. Variant `in_stock` is the only buyability flag.
 */
export function unavailableLabel(
  product: Pick<ClientProduct, 'variants'>,
  variant: Variant | null,
): string | null {
  if (variant === null) return product.variants.length > 0 ? NO_SUCH_COMBO : OUT_OF_STOCK
  return variant.in_stock ? null : OUT_OF_STOCK
}
