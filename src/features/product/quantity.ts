import type { Variant } from '@/lib/api/types/catalog'

// The quantity stepper's bounds for a variant (product digest §5.5). Pure.

export interface QuantityBounds {
  /** `order_limit_min || 1`. */
  min: number
  /** `order_limit_max`; null when it is 0 (no maximum). Never below `min`. */
  max: number | null
}

/**
 * The stepper's bounds. The product payload exposes no stock count (`low_stock_quantity` is
 * marketing text, never a cap), so stock does not bound it here: the cart refuses an amount it
 * cannot hold and says why. Without a variant: 1 and no maximum.
 */
export function quantityBounds(
  variant: Pick<Variant, 'order_limit_min' | 'order_limit_max'> | null,
): QuantityBounds {
  const min = Math.max(1, variant?.order_limit_min || 1)
  const limit = variant?.order_limit_max ?? 0
  return { min, max: limit > 0 ? Math.max(min, limit) : null }
}

/** `quantity` held within the bounds. */
export function clampQuantity(quantity: number, { min, max }: QuantityBounds): number {
  return Math.min(Math.max(quantity, min), max ?? Number.POSITIVE_INFINITY)
}
