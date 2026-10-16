import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LISTING_RESULTS_ID } from '@/features/catalog/components/listing/listing-focus'
import { LoadMore, type LoadMoreProps } from '@/features/catalog/components/listing/load-more'
import {
  ListingUrlProvider,
  useListingUrl,
} from '@/features/catalog/components/listing/use-listing-url'
import type { ProductCard } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'
import { clientProviders } from '../support/providers'
import { cardFixture } from './card-fixtures'
import { NavigatingRouter } from './navigation-harness'

// Shared by the LoadMore tests. Those files mock `@/lib/api/client` (bffFetch) and
// `next/navigation` (the navigation harness).

export function card(id: number): ProductCard {
  return cardFixture({ id, slug: `p-${id}`, name: `کالای ${id}` })
}

export function listPage(ids: number[], page: number, totalPages = 3): Paginated<ProductCard> {
  return {
    count: 60,
    total_pages: totalPages,
    current_page: page,
    page_size: 24,
    next: null,
    previous: null,
    results: ids.map(card),
  }
}

export const BASE_PATH = '/product-category/digital/mobile-phone/'

export const PROPS: LoadMoreProps = {
  apiQuery: { category: 'mobile-phone', brand: ['apple'], sort: 'sale' },
  urlQuery: { brand: ['apple'] },
  basePath: BASE_PATH,
  page: 1,
  totalPages: 3,
  initialIds: [1, 2, 3],
  showOutOfStockLabel: true,
}

/** A sort change, as the toolbar would make it. */
function CheapestFirst() {
  const { set } = useListingUrl()
  return <button onClick={() => set({ sort: 'price-asc' })}>ارزان‌ترین</button>
}

/** LoadMore in a category listing at `?brand=apple`, with the results heading and a sort. */
export function renderLoadMore(props: Partial<LoadMoreProps> = {}) {
  const { wrapper: Providers } = clientProviders()
  render(
    <Providers>
      <NavigatingRouter initial="brand=apple">
        <ListingUrlProvider context={{ category: 'mobile-phone' }} basePath={BASE_PATH}>
          <h2 id={LISTING_RESULTS_ID} tabIndex={-1}>
            کالاها
          </h2>
          <CheapestFirst />
          <LoadMore {...PROPS} {...props} />
        </ListingUrlProvider>
      </NavigatingRouter>
    </Providers>,
  )
  return userEvent.setup()
}
