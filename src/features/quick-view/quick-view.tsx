'use client'

import { PackageX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { toClientProduct } from '@/features/product/client-product'
import { ProductProvider } from '@/features/product/components/product-provider'
import { useProductDetail } from '@/features/product/product-query'
import { isApiNotFound } from '@/lib/api/errors'
import type { ProductDetail } from '@/lib/api/types/catalog'
import { QuickViewDetails } from './quick-view-details'
import { QuickViewPanel } from './quick-view-panel'
import type { QuickViewRequest } from './use-quick-view'

const TITLE = 'مشاهده سریع'
const GONE = 'این کالا دیگر موجود نیست'
const FAILED = 'دریافت اطلاعات کالا ممکن نشد.'
const RETRY = 'تلاش دوباره'

/** The panel's shape while the product loads: the image, the name, the choices, the price. */
function QuickViewSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-4 md:grid md:grid-cols-2 md:gap-6"
    >
      <span className="sr-only">در حال بارگذاری کالا</span>
      <Skeleton className="mx-auto aspect-square w-full max-w-56 md:max-w-none" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-20" />
          <Skeleton className="h-11 w-20" />
          <Skeleton className="h-11 w-20" />
        </div>
        <Skeleton className="h-8 w-44" />
        <Skeleton className="mt-2 h-11 w-full" />
      </div>
    </div>
  )
}

function QuickViewFailure({ gone, onRetry }: { gone: boolean; onRetry: () => void }) {
  if (gone) {
    return (
      <EmptyState
        icon={<PackageX />}
        title={GONE}
        description="ممکن است فروش آن متوقف شده باشد."
        headingLevel={3}
      />
    )
  }
  return (
    <div className="flex flex-col items-center gap-4 py-12 text-center">
      <p className="text-ink-700">{FAILED}</p>
      <Button variant="outline" onClick={onRetry}>
        {RETRY}
      </Button>
    </div>
  )
}

/** The variant to show first: the one asked for when it is this product's, else the default. */
function startingVariant(product: ProductDetail, requested: number | null): number | null {
  const known = product.variants.some((variant) => variant.id === requested)
  return known ? requested : product.default_variant_id
}

export interface QuickViewProps {
  request: QuickViewRequest
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Quick view (spec §8.12, §8.3 one-tap ruling): the product's payload through the BFF (the
 * `['product', slug]` query the compare page shares), with a skeleton meanwhile, a retry when
 * it cannot be read and «این کالا دیگر موجود نیست» for a 404. The product page's own pieces
 * show it, on a ProductProvider detached from the URL (`syncUrl` off), starting on the
 * representative variant (or the one asked for), so the shopper always sees which variant they
 * add.
 */
export function QuickView({ request, open, onOpenChange }: QuickViewProps) {
  const query = useProductDetail(request.slug)
  const product = query.data
  const title = product ? <span dir="auto">{product.name}</span> : TITLE

  return (
    <QuickViewPanel open={open} onOpenChange={onOpenChange} title={title}>
      {product ? (
        <ProductProvider
          product={toClientProduct(product)}
          initialVariantId={startingVariant(product, request.variantId)}
          syncUrl={false}
        >
          <QuickViewDetails
            onAdded={() => onOpenChange(false)}
            onLeave={() => onOpenChange(false)}
          />
        </ProductProvider>
      ) : query.isError ? (
        <QuickViewFailure gone={isApiNotFound(query.error)} onRetry={() => void query.refetch()} />
      ) : (
        <QuickViewSkeleton />
      )}
    </QuickViewPanel>
  )
}
