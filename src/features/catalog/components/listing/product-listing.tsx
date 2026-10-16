import { SearchX } from 'lucide-react'
import { notFound } from 'next/navigation'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/ui/empty-state'
import { getFilters, getListPage, getProductList, getProductSettings } from '@/features/catalog/api'
import {
  activeFilterCount,
  FALLBACK_SORT_OPTIONS,
  facetGroups,
  filterContexts,
  type FilterContexts,
} from '@/features/catalog/listing-filters'
import {
  parseListingParams,
  toSearchParams,
  withoutContext,
  type ListingApiQuery,
  type ListingContext,
} from '@/features/catalog/listing-params'
import { getCategoryTree } from '@/features/settings/api'
import { isApiNotFound } from '@/lib/api/errors'
import type { SortValue } from '@/lib/api/types/catalog'
import type { CategoryNode } from '@/lib/api/types/settings'
import { toPersianDigits } from '@/lib/format'
import { ProductGrid } from '../product-grid'
import { ActiveFilterChips, ClearFiltersButton } from './active-filter-chips'
import { FilterPanel } from './filter-panel'
import { LISTING_RESULTS_ID } from './listing-focus'
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
 * The filter metadata, every request at once: the route context's own, the URL list's (a listing
 * with no route context) and the URL category's (a route without a category). Facets follow the
 * most specific that exists; the category options leave out the URL's category. A null (unknown
 * slug) falls back to the next, so the page never loses its facets.
 */
async function loadFilters(context: ListingContext, extra: FilterContexts) {
  const [route, list, category] = await Promise.all([
    getFilters(context),
    extra.list ? getFilters(extra.list) : null,
    extra.category ? getFilters(extra.category) : null,
  ])
  const base = list ?? route
  return { filters: category ?? base, base }
}

/** A category's name anywhere in the tree, by slug. */
function nameInTree(nodes: CategoryNode[], slug: string): string | undefined {
  for (const node of nodes) {
    const name = node.slug === slug ? node.name : nameInTree(node.children, slug)
    if (name !== undefined) return name
  }
  return undefined
}

const NO_TREE: CategoryNode[] = []

/**
 * A product listing: the filter sidebar (lg+) or sheet, the toolbar, the active filter chips,
 * the server-rendered grid, «نمایش بیشتر» and the page links. The URL is the single source of
 * truth; the client parts are only the interactive leaves.
 *
 * Facets follow the route context, a list named in the URL on a listing without one, and a
 * category picked in the URL when the route has none (its attributes, brands and price range;
 * the category options stay the ones it was picked from). A URL list is a filter with its chip.
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
  const urlQuery = withoutContext(query, context)
  const extra = filterContexts(context, query)
  const [list, { filters, base }, settings, tree, listPage] = await Promise.all([
    loadList(apiQuery),
    loadFilters(context, extra),
    getProductSettings(),
    // Names a URL category deeper than the route's options (a homepage «see all» link). The shell
    // header loads the same tree, so this costs no request; it never throws.
    urlQuery.category === undefined ? NO_TREE : getCategoryTree(),
    // Names the URL's list for its chip (a route without a list context).
    urlQuery.list === undefined ? null : getListPage(urlQuery.list),
  ])

  const groups = {
    ...facetGroups(filters, context, base),
    chosenCategoryName: urlQuery.category && nameInTree(tree, urlQuery.category),
    listName: listPage?.name,
  }
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
              label={`صفحهٔ ${toPersianDigits(list.current_page)}`}
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
