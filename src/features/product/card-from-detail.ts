import type { CardProduct } from '@/features/catalog/card-product'
import type { ClientProduct } from '@/features/product/client-product'

/**
 * The product as the list API would show it on a card (recently viewed keeps this): the default
 * variant's prices and limits, and its values as `{ attribute_name, name }` labels in axis
 * order. Without a default variant, no prices and no labels. Pure.
 */
export function cardFromDetail(product: ClientProduct): CardProduct {
  const variant = product.variants.find((v) => v.id === product.default_variant_id) ?? null
  const labels = variant
    ? product.variant_options.flatMap((option) =>
        option.values
          .filter((value) => variant.attribute_value_ids.includes(value.id))
          .map((value) => ({ attribute_name: option.attribute_name, name: value.name })),
      )
    : []
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    image: product.image,
    type: product.type,
    badge: product.badge,
    categories: product.categories,
    in_stock: product.in_stock,
    rating: product.rating,
    rating_count: product.rating_count,
    default_variant_id: product.default_variant_id,
    default_variant_attributes: labels,
    price: variant?.price ?? null,
    final_price: variant?.final_price ?? null,
    has_discount: variant?.has_discount ?? false,
    discount_percent: variant?.discount_percent ?? 0,
    discount_time_remaining: variant?.has_discount ? variant.discount_time_remaining : null,
    order_limit_min: variant?.order_limit_min ?? null,
    order_limit_max: variant?.order_limit_max ?? null,
  }
}
