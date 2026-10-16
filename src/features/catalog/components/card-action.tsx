import type { ReactNode } from 'react'
import { AddToCartButton } from '@/features/cart/components/add-to-cart-button'
import type { CardProduct } from '@/features/catalog/card-product'
import { QuickViewLink } from '@/features/quick-view/quick-view-link'

/**
 * In a card narrower than the label with its icon (8.875rem, 142px: «انتخاب ویژگی‌ها» needs 141px, «افزودن به
 * سبد» 132px), as in phone rails at 2.2 cards per view: the icon goes (a busy spinner stays) and
 * the padding narrows, so the label fits without widening the card. Queries the card's add slot
 * (`@container` in ProductCard); elsewhere it never applies.
 */
const NARROW = '@max-[8.875rem]:px-3 @max-[8.875rem]:[&_svg:not(.animate-spin)]:hidden'

/** What the decision reads: a list card has it all; the compare table builds it from a detail. */
export type ActionProduct = Pick<
  CardProduct,
  'slug' | 'name' | 'image' | 'type' | 'in_stock' | 'default_variant_id' | 'order_limit_min'
>

/**
 * The add slot of a product card or column, the one place the one-tap ruling is decided (spec
 * §8.3), for rails, grids, related products and the compare table:
 * - a non-variable product with a default variant adds in one tap («ناموجود» when out of stock);
 * - a variable product gets «انتخاب ویژگی‌ها», which opens quick view on its representative
 *   variant, so the shopper always sees the variant they add;
 * - a product without variants has nothing to sell: no action.
 * Both controls are described by the product's name (`describedBy`, the card's name link), like
 * the card's other buttons. Every card in a row gets a slot of the same height, so the prices
 * line up. Server-renderable: both controls are client leaves.
 */
export function cardAction(product: ActionProduct, describedBy?: string): ReactNode {
  if (product.type === 'variable') {
    return <QuickViewLink slug={product.slug} describedBy={describedBy} className={NARROW} />
  }
  if (product.default_variant_id === null) return undefined
  return (
    <AddToCartButton
      variantId={product.in_stock ? product.default_variant_id : null}
      quantity={product.order_limit_min || 1}
      product={{ name: product.name, image: product.image }}
      size="sm"
      variant="secondary"
      fullWidth
      label="افزودن به سبد"
      describedBy={describedBy}
      className={NARROW}
    />
  )
}
