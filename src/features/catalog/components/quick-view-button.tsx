'use client'

import { Eye } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { cardActionClasses, cardChipClasses } from './card-styles'

/** The card's «مشاهده سریع» button: hands the product slug to the quick-view host. */
export function QuickViewButton({
  slug,
  onQuickView,
  className,
}: {
  slug: string
  onQuickView: (slug: string) => void
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label="مشاهده سریع"
      aria-haspopup="dialog"
      onClick={() => onQuickView(slug)}
      className={cn(cardActionClasses('sm'), className)}
    >
      <span className={cardChipClasses('sm')}>
        <Eye aria-hidden />
      </span>
    </button>
  )
}
