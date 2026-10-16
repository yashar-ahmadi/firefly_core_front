import { ListFilter } from 'lucide-react'
import Link from 'next/link'
import { buttonClasses } from '@/components/ui/button-styles'
import { Carousel, type SlidesPerView } from '@/components/ui/carousel'
import { AddToCartButton } from '@/features/cart/components/add-to-cart-button'
import type { CardProduct } from '@/features/catalog/card-product'
import { ProductCard } from './product-card'

/** Two and a bit cards on phones, three and a half on tablets, five from lg. */
const PER_VIEW: SlidesPerView = { base: 2.2, md: 3.5, lg: 5 }

/**
 * The card's action row. A simple product with a variant adds in one tap. A variable one gets
 * a «choose options» link to the product page, where the variant is chosen (quick view
 * replaces it in Plan 2 Task 9). It repeats the card's own link, so it is kept out of the
 * accessibility tree and the tab order. It keeps every card in a rail the same height, so the
 * prices line up.
 */
function cardAction(product: CardProduct) {
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

export interface ProductRailProps {
  products: CardProduct[]
  /** Names the carousel, usually the section title. */
  ariaLabel: string
  /** The shop's setting (product settings). */
  showOutOfStockLabel: boolean
}

/**
 * A horizontal rail of product cards (homepage carousels, recently viewed). The arrows sit
 * beside the track, never over the first and last cards. Server-renderable, and usable from
 * Client Components.
 */
export function ProductRail({ products, ariaLabel, showOutOfStockLabel }: ProductRailProps) {
  return (
    <Carousel ariaLabel={ariaLabel} slidesPerView={PER_VIEW} arrowGutters>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          showOutOfStockLabel={showOutOfStockLabel}
          addSlot={cardAction(product)}
        />
      ))}
    </Carousel>
  )
}
