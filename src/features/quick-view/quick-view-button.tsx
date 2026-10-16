'use client'

import { Eye } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { overlayButtonClasses, overlayChipClasses } from '@/components/ui/overlay-button-styles'
import { productPath } from '@/features/catalog/listing-routes'
import { useOptionalStoreConfig } from '@/lib/config-context'
import { openQuickView, preloadQuickView } from './use-quick-view'

/**
 * The card's «مشاهده سریع» icon (simple and variable products alike): opens quick view on the
 * product's representative variant. Its code starts loading on hover or focus. Not shown while
 * the shop has quick view switched off; with no host on the page it goes to the product page.
 */
export function QuickViewButton({
  slug,
  describedBy,
  className,
}: {
  slug: string
  /** Id of the element naming the product (the card's name link). */
  describedBy?: string
  className?: string
}) {
  const enabled = useOptionalStoreConfig()?.features.quickView !== false
  if (!enabled) return null
  return (
    <button
      type="button"
      aria-label="مشاهده سریع"
      aria-describedby={describedBy}
      aria-haspopup="dialog"
      onPointerEnter={preloadQuickView}
      onFocus={preloadQuickView}
      onClick={() => {
        if (!openQuickView(slug)) window.location.assign(productPath(slug))
      }}
      className={cn(overlayButtonClasses('sm'), className)}
    >
      <span className={overlayChipClasses('sm')}>
        <Eye aria-hidden />
      </span>
    </button>
  )
}
