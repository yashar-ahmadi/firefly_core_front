import { ListFilter } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { AddToCartButton } from '@/features/cart/components/add-to-cart-button'
import type { CardProduct } from '@/features/catalog/card-product'

/**
 * A product card's action row, shared by rails and grids. A simple product with a variant adds
 * in one tap. A variable one gets a «choose options» link to the product page, where the variant
 * is chosen (quick view replaces it in Plan 2 Task 9). It repeats the card's own link, so it is
 * kept out of the accessibility tree and the tab order. It keeps every card in a row the same
 * height, so the prices line up. A product without variants has nothing to sell: no action.
 */
export function cardAction(product: CardProduct): ReactNode {
  if (product.type !== 'variable' && product.default_variant_id !== null) {
    return (
      <AddToCartButton
        variantId={product.in_stock ? product.default_variant_id : null}
        quantity={product.order_limit_min || 1}
        product={{ name: product.name, image: product.image }}
        size="sm"
        variant="secondary"
        fullWidth
        label="افزودن به سبد"
      />
    )
  }
  if (product.type !== 'variable') return undefined
  return (
    <Link
      href={`/product/${encodeURIComponent(product.slug)}/`}
      prefetch={false}
      tabIndex={-1}
      aria-hidden
      className={buttonClasses({ variant: 'outline', size: 'sm', fullWidth: true })}
    >
      <ListFilter />
      {'انتخاب ویژگی\u{200C}ها'}
    </Link>
  )
}
