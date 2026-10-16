import { PackageSearch } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import type { CardProduct } from '@/features/catalog/card-product'
import { cardAction } from './card-action'
import { ProductCard } from './product-card'
import { ProductCardSkeleton } from './product-card-skeleton'

/**
 * `full`: the page width, 2 columns on phones (tight gaps), 3 from md, 4 from lg, 5 from 2xl.
 * `sidebar`: beside the listing's filter sidebar (from lg), 3 columns from md, 4 from xl.
 */
export type GridColumns = 'full' | 'sidebar'

const GRID: Record<GridColumns, string> = {
  full: 'grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4 2xl:grid-cols-5',
  sidebar: 'grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:gap-4 xl:grid-cols-4',
}

/** The space between two grids that read as one (a page appended under another). */
export const GRID_GAP_TOP = 'mt-2 sm:mt-3 lg:mt-4'

/** The cards in the first phone row get their images first: they are the likely LCP. */
const PRIORITY_COUNT = 2

export interface ProductGridProps {
  products: CardProduct[]
  showOutOfStockLabel: boolean
  /** Shown instead of the grid when `products` is empty. */
  emptyState?: ReactNode
  columns?: GridColumns
  /** Each card gets its add-to-cart (or choose-options) row, as in product rails. */
  withAction?: boolean
  /** How many leading cards load their image eagerly; 0 below the fold. */
  priorityCount?: number
  /** Names the list, e.g. the page it holds. */
  label?: string
}

/** Product cards in a responsive grid, or an empty state. */
export function ProductGrid({
  products,
  showOutOfStockLabel,
  emptyState,
  columns = 'full',
  withAction = false,
  priorityCount = PRIORITY_COUNT,
  label,
}: ProductGridProps) {
  if (products.length === 0) {
    return emptyState ?? <EmptyState icon={<PackageSearch />} title="کالایی یافت نشد" />
  }
  return (
    <ul aria-label={label} className={GRID[columns]}>
      {products.map((product, index) => (
        <li key={product.id} className="min-w-0">
          <ProductCard
            product={product}
            priority={index < priorityCount}
            showOutOfStockLabel={showOutOfStockLabel}
            addSlot={withAction ? cardAction(product) : undefined}
          />
        </li>
      ))}
    </ul>
  )
}

/** The grid while products load: `count` card skeletons, announced once. */
export function ProductGridSkeleton({
  count = 10,
  withAction = false,
}: {
  count?: number
  withAction?: boolean
}) {
  return (
    <div aria-busy="true">
      <VisuallyHidden role="status">در حال بارگذاری کالاها</VisuallyHidden>
      <div className={GRID.full}>
        {Array.from({ length: count }, (_, index) => (
          <ProductCardSkeleton key={index} withAction={withAction} />
        ))}
      </div>
    </div>
  )
}
