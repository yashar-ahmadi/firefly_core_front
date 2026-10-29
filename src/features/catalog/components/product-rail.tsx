import { Carousel, type SlidesPerView } from '@/components/ui/carousel'
import type { CardProduct } from '@/features/catalog/card-product'
import { CardScope } from './card-scope'
import { ProductCard } from './product-card'

/** Two and a bit cards on phones, three and a half on tablets, five from lg. */
const PER_VIEW: SlidesPerView = { base: 2.2, md: 3.5, lg: 5 }

export interface ProductRailProps {
  products: CardProduct[]
  /** Names the carousel, usually the section title. */
  ariaLabel: string
  /** The shop's setting (product settings). */
  showOutOfStockLabel: boolean
  /** Cards in view per breakpoint (default two and a bit, three and a half, five). */
  slidesPerView?: SlidesPerView
}

/**
 * A horizontal rail of product cards (homepage carousels, recently viewed). The arrows sit
 * beside the track, never over the first and last cards. Server-renderable, and usable from
 * Client Components.
 */
export function ProductRail({
  products,
  ariaLabel,
  showOutOfStockLabel,
  slidesPerView = PER_VIEW,
}: ProductRailProps) {
  // One CardScope per rail: the cards' buttons share its subscriptions.
  return (
    <CardScope>
      <Carousel ariaLabel={ariaLabel} slidesPerView={slidesPerView} arrowGutters>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            showOutOfStockLabel={showOutOfStockLabel}
            withAction
          />
        ))}
      </Carousel>
    </CardScope>
  )
}
