import { ProductGrid } from '@/features/catalog/components/product-grid'
import { ProductRail } from '@/features/catalog/components/product-rail'
import { displayStyle } from '@/features/display/display-style'
import { ProductBand, ProductRankedList } from '@/features/display/product-styles'
import type { HomeSection } from '@/lib/api/types/catalog'
import { homeSectionId, SectionShell, sectionLink } from './section-header'

export interface ProductCarouselSectionProps {
  section: Extract<HomeSection, { type: 'product_carousel' }>
  showOutOfStockLabel: boolean
  seeAllLabel: string
}

/**
 * The listing cards of a product carousel (content.md §6.5) in the operator's style, see-all to
 * the operator's link or to the listing of its `listing_query`:
 * 1. a rail that scrolls sideways (the default);
 * 2. a grid of every card, no scrolling;
 * 3. the «پیشنهاد شگفت‌انگیز» band: the rail on the brand's gradient, its header at the start;
 * 4. a ranked compact list in columns of three rows.
 * Card images load lazily: the LCP rule leaves them out.
 */
export function ProductCarouselSection({
  section,
  showOutOfStockLabel,
  seeAllLabel,
}: ProductCarouselSectionProps) {
  if (section.products.length === 0) return null
  const style = displayStyle(section.style)
  const title = section.title.trim()
  const label = title || 'محصولات'

  if (style === 'style_3') {
    return (
      <div data-style={style} className="min-w-0">
        <ProductBand
          id={homeSectionId(section)}
          title={title}
          subtitle={section.subtitle.trim()}
          link={sectionLink(section, seeAllLabel)}
          products={section.products}
          showOutOfStockLabel={showOutOfStockLabel}
        />
      </div>
    )
  }

  return (
    <SectionShell
      section={section}
      seeAllLabel={seeAllLabel}
      as={style === 'style_1' ? 'div' : 'section'}
    >
      {style === 'style_2' ? (
        <ProductGrid
          products={section.products}
          showOutOfStockLabel={showOutOfStockLabel}
          withAction
          priorityCount={0}
          label={label}
        />
      ) : style === 'style_4' ? (
        <ProductRankedList
          products={section.products}
          label={label}
          showOutOfStockLabel={showOutOfStockLabel}
        />
      ) : (
        <ProductRail
          products={section.products}
          ariaLabel={label}
          showOutOfStockLabel={showOutOfStockLabel}
        />
      )}
    </SectionShell>
  )
}
