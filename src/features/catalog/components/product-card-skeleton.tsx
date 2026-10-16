import { cn } from '@/components/ui/cn'
import { Skeleton } from '@/components/ui/skeleton'
import { CARD_BODY, CARD_NAME_BOX, CARD_PRICE_BOX, CARD_SURFACE } from './card-styles'

/**
 * A loading ProductCard: the same surface, square image and rows (name, chips, rating, price),
 * so replacing it with the card shifts nothing. `withAction` adds the add-button row for grids
 * whose cards carry one. Hidden from assistive tech: announce loading on the container.
 */
export function ProductCardSkeleton({
  withAction = false,
  className,
}: {
  withAction?: boolean
  className?: string
}) {
  return (
    <div aria-hidden className={cn(CARD_SURFACE, className)}>
      <Skeleton className="aspect-square w-full" />
      <div className={CARD_BODY}>
        <div className={cn(CARD_NAME_BOX, 'grid content-center gap-3')}>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/5" />
        </div>
        <div className="flex h-6 gap-1">
          <Skeleton className="h-6 w-12 rounded-pill" />
          <Skeleton className="h-6 w-20 rounded-pill" />
        </div>
        <div className="flex h-6 items-center">
          <Skeleton className="h-4 w-14" />
        </div>
        <div className={CARD_PRICE_BOX}>
          <Skeleton className="h-5 w-2/3" />
        </div>
        {withAction && <Skeleton className="mt-1 h-10 w-full" />}
      </div>
    </div>
  )
}
