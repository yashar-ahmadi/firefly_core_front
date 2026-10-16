import { render } from '@testing-library/react'
import {
  ProductListing,
  type ProductListingProps,
} from '@/features/catalog/components/listing/product-listing'
import type { FiltersMetadata, ProductCard } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'
import type { CategoryNode } from '@/lib/api/types/settings'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'
import { LIST_CATEGORIES, MOBILE_FILTERS, STORE_BRANDS } from './filter-fixtures'
import { navigation } from './navigation-harness'

// Shared by the ProductListing tests. Those files mock `@/features/catalog/api`,
// `@/features/settings/api` and `next/navigation` (the navigation harness).

export const SETTINGS = {
  paginator_number: 24,
  show_out_of_stock_label: true,
  related_items_display_status: true,
  related_items_number: 8,
}

/** The store-wide metadata: root-level categories, every brand, no attributes. */
export const STORE_FILTERS: FiltersMetadata = {
  ...MOBILE_FILTERS,
  categories: LIST_CATEGORIES,
  brands: STORE_BRANDS,
  attributes: [],
}

export function listOf(
  products: ProductCard[],
  extra: Partial<Paginated<ProductCard>> = {},
): Paginated<ProductCard> {
  return {
    count: products.length,
    total_pages: 1,
    current_page: 1,
    page_size: 24,
    next: null,
    previous: null,
    results: products,
    ...extra,
  }
}

/** A slice of the published category tree (`getCategoryTree()`). */
export function categoryNode(slug: string, name: string, children: CategoryNode[] = []) {
  const node: CategoryNode = {
    id: slug.length,
    name,
    slug,
    path: slug,
    parent_id: null,
    short_description: null,
    image: '',
    icon: '',
    show_in_homepage: false,
    default_sorting: null,
    product_count: 0,
    created: '',
    updated: '',
    children,
  }
  return node
}

/** A category page (`/product-category/digital/mobile-phone/`). */
export const PROPS: ProductListingProps = {
  context: { category: 'mobile-phone' },
  searchParams: Promise.resolve({}),
  basePath: '/product-category/digital/mobile-phone/',
}

/** The generic `/product/list/`. */
export const GENERIC: Partial<ProductListingProps> = { context: {}, basePath: '/product/list/' }

/** The listing as the server renders it, at the URL `?search`. */
export async function listingTree(props: Partial<ProductListingProps>) {
  return resolveServerTree(await ProductListing({ ...PROPS, ...props }))
}

export async function renderListing(props: Partial<ProductListingProps>, search = '') {
  navigation.search = search
  const tree = await listingTree(props)
  const { wrapper } = clientProviders()
  return render(<>{tree}</>, { wrapper })
}
