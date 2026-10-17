'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Heart, House, PackageX } from 'lucide-react'
import Link from 'next/link'
import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { ProductGrid, ProductGridSkeleton } from '@/features/catalog/components/product-grid'
import { useSummary } from '../dashboard/use-summary'
import { AccountPageHeader } from '../layout/account-page-header'
import { ListError } from '../lists/list-error'
import { usePageFallback } from '../lists/use-page-fallback'
import { useListUrl } from '../lists/use-list-url'
import { isLoadingSection } from '../use-account-query'
import { fetchWishlistPage, useWishlistList, wishlistListKey } from './use-wishlist-list'
import { useWishlistRemovals } from './use-wishlist-removals'
import { parseWishlistParams, wishlistSearch } from './wishlist-params'
import { WishlistToolbar } from './wishlist-toolbar'

export const WISHLIST_PATH = '/account/wishlist/'

const EMPTY = 'rounded-card bg-white py-12 shadow-card'

export interface WishlistPageProps {
  title: string
  /** The shop's setting (`product/settings/`): «ناموجود» on cards that are out of stock. */
  showOutOfStockLabel: boolean
}

/**
 * `/account/wishlist/` «علاقه‌مندی‌ها» (product digest §3.15): the saved products as the
 * catalog's own cards (their heart, compare, quick view and add to cart), sorted by when they
 * were saved, «فقط کالاهای موجود» and pages, all in the URL (`?sort=added-asc&in_stock=true&
 * page=2`). A heart pressed here takes its card out once the write succeeded, with «بازگردانی».
 * Skeleton cards while it loads (the page on screen stays while another loads); «تلاش دوباره»
 * when it cannot; a page past the end goes to the last one.
 */
export function WishlistPage({ title, showOutOfStockLabel }: WishlistPageProps) {
  const url = useListUrl(WISHLIST_PATH, parseWishlistParams, wishlistSearch)
  const { params } = url
  const client = useQueryClient()
  const query = useWishlistList(params)
  const summary = useSummary()
  const heading = useRef<HTMLHeadingElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const goToPage = (page: number) => url.replace({ ...params, page })
  const leaving = usePageFallback({
    error: query.error,
    page: params.page,
    readFirst: () => {
      const first = { ...params, page: 1 }
      return client.fetchQuery({
        queryKey: wishlistListKey(first),
        queryFn: ({ signal }) => fetchWishlistPage(first, signal),
      })
    },
    goTo: goToPage,
  })
  const data = query.data
  const products = useWishlistRemovals({
    results: data?.results ?? [],
    page: params.page,
    grid,
    pageHeading: heading,
    goToPage,
  })
  const none = products.length === 0 && (!params.inStock || summary.data?.wishlist_count === 0)

  let body
  if (query.isError && !data && !leaving && !isLoadingSection(query)) {
    body = (
      <ListError
        message="علاقه‌مندی‌ها بارگذاری نشد."
        error={query.error}
        errorAt={query.errorUpdatedAt}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  } else if (!data || leaving) {
    body = <ProductGridSkeleton count={8} withAction columns="sidebar" />
  } else if (none) {
    body = (
      <EmptyState
        icon={<Heart />}
        title="هنوز کالایی به علاقه‌مندی‌ها اضافه نکرده‌اید"
        description="با زدن قلب روی هر کالا، آن را این‌جا نگه دارید تا بعداً آسان پیدایش کنید."
        className={EMPTY}
        action={
          <Link href="/" className={buttonClasses({ variant: 'outline' })}>
            <House aria-hidden />
            رفتن به صفحه اصلی
          </Link>
        }
      />
    )
  } else if (products.length === 0) {
    body = (
      <EmptyState
        icon={<PackageX />}
        title="کالای موجودی در علاقه‌مندی‌ها نیست"
        description="کالاهای ذخیره‌شده‌تان اکنون موجود نیستند."
        className={EMPTY}
        action={
          <Button
            variant="outline"
            onClick={() => url.replace({ ...params, inStock: false, page: 1 })}
          >
            نمایش همه کالاها
          </Button>
        }
      />
    )
  } else {
    body = (
      <>
        <div
          ref={grid}
          aria-busy={query.isPlaceholderData || undefined}
          className="transition-opacity aria-busy:opacity-60"
        >
          <ProductGrid
            products={products}
            label={title}
            showOutOfStockLabel={showOutOfStockLabel}
            columns="sidebar"
            withAction
          />
        </div>
        <Pagination
          page={data.current_page}
          totalPages={data.total_pages}
          hrefFor={(page) => url.href({ ...params, page })}
          className="mt-6"
        />
      </>
    )
  }

  return (
    <>
      <AccountPageHeader title={title} headingRef={heading} />
      {!(data && none) && (
        <WishlistToolbar params={params} count={data?.count} onChange={url.replace} />
      )}
      {body}
    </>
  )
}
