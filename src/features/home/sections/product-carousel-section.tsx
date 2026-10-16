import { ProductRail } from '@/features/catalog/components/product-rail'
import type { HomeSection } from '@/lib/api/types/catalog'
import { SectionShell } from './section-header'

export interface ProductCarouselSectionProps {
  section: Extract<HomeSection, { type: 'product_carousel' }>
  showOutOfStockLabel: boolean
  seeAllLabel: string
}

/**
 * A rail of listing cards (content.md §6.5), see-all to the operator's link or to the listing of
 * its `listing_query`. Card images load lazily: the LCP rule leaves them out.
 */
export function ProductCarouselSection({
  section,
  showOutOfStockLabel,
  seeAllLabel,
}: ProductCarouselSectionProps) {
  if (section.products.length === 0) return null
  return (
    <SectionShell section={section} seeAllLabel={seeAllLabel} as="div">
      <ProductRail
        products={section.products}
        ariaLabel={section.title.trim() || 'محصولات'}
        showOutOfStockLabel={showOutOfStockLabel}
      />
    </SectionShell>
  )
}
