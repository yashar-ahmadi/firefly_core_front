'use client'

import { Eye } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { overlayButtonClasses, overlayChipClasses } from '@/components/ui/overlay-button-styles'

/** The card's «مشاهده سریع» button: hands the product slug to the quick-view host. */
export function QuickViewButton({
  slug,
  onQuickView,
  describedBy,
  className,
}: {
  slug: string
  onQuickView: (slug: string) => void
  /** Id of the element naming the product (the card's name link). */
  describedBy?: string
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label="مشاهده سریع"
      aria-describedby={describedBy}
      aria-haspopup="dialog"
      onClick={() => onQuickView(slug)}
      className={cn(overlayButtonClasses('sm'), className)}
    >
      <span className={overlayChipClasses('sm')}>
        <Eye aria-hidden />
      </span>
    </button>
  )
}
