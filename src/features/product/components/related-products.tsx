import { SectionHeader } from '@/components/layout/section-header'
import { toCardProduct } from '@/features/catalog/card-product'
import { ProductRail } from '@/features/catalog/components/product-rail'
import type { ProductCard, ProductSettings } from '@/lib/api/types/catalog'

const TITLE = 'محصولات مرتبط'
const HEADING_ID = 'related-products'

export interface RelatedProductsProps {
  products: readonly ProductCard[]
  settings: Pick<
    ProductSettings,
    'related_items_display_status' | 'related_items_number' | 'show_out_of_stock_label'
  >
}

/**
 * «محصولات مرتبط» (product digest §3.10) in the shared product rail, whose arrows sit beside
 * the track. The shop's switch and number apply here too (the API already honours them; the
 * payload is cached longer than a settings change takes). Each card's own stock drives its
 * button. The rail is the region named after the section, so the wrapper is a plain div.
 */
export function RelatedProducts({ products, settings }: RelatedProductsProps) {
  if (!settings.related_items_display_status) return null
  const shown = products.slice(0, settings.related_items_number).map(toCardProduct)
  if (shown.length === 0) return null
  return (
    <div className="min-w-0">
      <SectionHeader id={HEADING_ID} title={TITLE} />
      <ProductRail
        products={shown}
        ariaLabel={TITLE}
        showOutOfStockLabel={settings.show_out_of_stock_label}
      />
    </div>
  )
}
