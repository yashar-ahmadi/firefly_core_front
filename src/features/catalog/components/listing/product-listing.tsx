import { SearchX } from 'lucide-react'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { getFilters, getProductList, getProductSettings } from '@/features/catalog/api'
import {
  activeFilterCount,
  FALLBACK_SORT_OPTIONS,
  facetGroups,
} from '@/features/catalog/listing-filters'
import {
  parseListingParams,
  toSearchParams,
  withoutContext,
  type ListingApiQuery,
  type ListingContext,
} from '@/features/catalog/listing-params'
import { isApiNotFound } from '@/lib/api/errors'
import type { SortValue } from '@/lib/api/types/catalog'
import { ProductGrid } from '../product-grid'
import { ActiveFilterChips, ClearFiltersButton, LISTING_RESULTS_ID } from './active-filter-chips'
import { FilterPanel } from './filter-panel'
import { ListingResults } from './listing-results'
import { ListingToolbar } from './listing-toolbar'
import { LoadMore } from './load-more'
import { ListingUrlProvider } from './use-listing-url'

type SearchParams = Record<string, string | string[] | undefined>

export interface ProductListingProps {
  /**
   * What the route is about, as **entity slugs** as the API returns them (`category.slug` from
   * `getCategory`, `brand.slug`, the list page's `slug`), never the raw or still-encoded route
   * params: they are sent to the API as given. `{}` for the generic `/product/list/`. A key
   * given here replaces the URL's and its facet is not offered.
   */
  context: ListingContext
  /** The page's `searchParams`, as Next passes it (a Promise) or already awaited. */
  searchParams: SearchParams | Promise<SearchParams>
  /** The route's own path with its trailing slash, e.g. `/product-category/digital/mobile-phone/`. */
  basePath: string
  /** Used when the URL has no `sort` (a category's or list's `default_sorting`). */
  defaultSort?: SortValue
  /** Above the listing, e.g. the page's h1. */
  title?: ReactNode
}

const FILTERS_HEADING_ID = 'listing-filters'

/** The list, or `notFound()` when the API answers 404: a page past the last one. */
async function loadList(q: ListingApiQuery) {
  try {
    return await getProductList(q)
  } catch (error) {
    if (isApiNotFound(error)) notFound()
    throw error
  }
}

/**
 * A product listing: the filter sidebar (lg+) or sheet, the toolbar, the active filter chips,
 * the server-rendered grid, «نمایش بیشتر» and the page links. The URL is the single source of
 * truth; the client parts are only the interactive leaves.
 *
 * Status codes (R9): the list and the filters are awaited, in parallel, before anything renders.
 * Render this outside any `<Suspense>` and with no `loading.tsx` on its segment, so a page past
 * the last answers a real 404 (`notFound()`) and an API failure reaches the error boundary with
 * its status.
 */
export async function ProductListing({
  context,
  searchParams,
  basePath,
  defaultSort,
  title,
}: ProductListingProps) {
  const query = parseListingParams(await searchParams, { context })
  const apiQuery: ListingApiQuery =
    query.sort === undefined && defaultSort ? { ...query, sort: defaultSort } : query
  const [list, filters, settings] = await Promise.all([
    loadList(apiQuery),
    getFilters(context),
    getProductSettings(),
  ])

  const urlQuery = withoutContext(query, context)
  const groups = facetGroups(filters, context)
  const showOutOfStockLabel = settings.show_out_of_stock_label

  return (
    <ListingUrlProvider context={context} basePath={basePath}>
      {title}
      <div className="grid gap-4 lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside
          aria-labelledby={FILTERS_HEADING_ID}
          className="hidden rounded-card bg-white px-4 pb-2 shadow-card lg:sticky lg:top-[calc(var(--header-offset)+1rem)] lg:block lg:max-h-[calc(100dvh-var(--header-offset)-2rem)] lg:[scrollbar-width:thin] lg:overflow-y-auto lg:overscroll-contain"
        >
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-ink-200">
            <h2 id={FILTERS_HEADING_ID} className="text-lg font-bold text-ink-900">
              فیلترها
            </h2>
            <ClearFiltersButton variant="link" size="sm" label="حذف همه" onlyWhenActive />
          </div>
          <FilterPanel groups={groups} />
        </aside>

        <section aria-labelledby={LISTING_RESULTS_ID} className="flex min-w-0 flex-col gap-3">
          <h2 id={LISTING_RESULTS_ID} tabIndex={-1} className="sr-only">
            کالاها
          </h2>
          <ListingToolbar
            count={list.count}
            sortOptions={filters?.sort_options ?? FALLBACK_SORT_OPTIONS}
            defaultSort={defaultSort ?? 'date-desc'}
            groups={groups}
          />
          <ActiveFilterChips groups={groups} />
          <ListingResults count={list.count}>
            <ProductGrid
              products={list.results}
              showOutOfStockLabel={showOutOfStockLabel}
              columns="sidebar"
              withAction
              emptyState={
                activeFilterCount(urlQuery) > 0 ? (
                  <EmptyState
                    icon={<SearchX />}
                    title="محصولی با این فیلترها یافت نشد"
                    description="چند فیلتر را بردارید یا همه را حذف کنید."
                    action={<ClearFiltersButton />}
                  />
                ) : undefined
              }
            />
            <LoadMore
              key={toSearchParams(apiQuery).toString()}
              apiQuery={apiQuery}
              urlQuery={urlQuery}
              basePath={basePath}
              page={list.current_page}
              totalPages={list.total_pages}
              initialIds={list.results.map((product) => product.id)}
              showOutOfStockLabel={showOutOfStockLabel}
            />
          </ListingResults>
        </section>
      </div>
    </ListingUrlProvider>
  )
}
