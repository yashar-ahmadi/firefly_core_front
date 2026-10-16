import { PackageSearch } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import type { CardProduct } from '@/features/catalog/card-product'
import { ProductCard } from './product-card'
import { ProductCardSkeleton } from './product-card-skeleton'

/** 2 columns on phones (tight gaps), 3 from md, 4 from lg, 5 from 2xl. */
const GRID =
  'grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-4 2xl:grid-cols-5'

/** The cards in the first phone row get their images first: they are the likely LCP. */
const PRIORITY_COUNT = 2

export interface ProductGridProps {
  products: CardProduct[]
  showOutOfStockLabel: boolean
  /** Shown instead of the grid when `products` is empty. */
  emptyState?: ReactNode
}

/** Product cards in a responsive grid, or an empty state. */
export function ProductGrid({ products, showOutOfStockLabel, emptyState }: ProductGridProps) {
  if (products.length === 0) {
    return emptyState ?? <EmptyState icon={<PackageSearch />} title="کالایی یافت نشد" />
  }
  return (
    <ul className={GRID}>
      {products.map((product, index) => (
        <li key={product.id} className="min-w-0">
          <ProductCard
            product={product}
            priority={index < PRIORITY_COUNT}
            showOutOfStockLabel={showOutOfStockLabel}
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
      <div className={GRID}>
        {Array.from({ length: count }, (_, index) => (
          <ProductCardSkeleton key={index} withAction={withAction} />
        ))}
      </div>
    </div>
  )
}
