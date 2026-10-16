import 'server-only'
import { cache } from 'react'
import {
  CATALOG_TAG,
  ENTITY_REVALIDATE,
  oneSegment,
  orRememberedNotFound,
  read,
} from '@/features/catalog/loaders/read'
import type {
  BrandDetail,
  CategoryDetail,
  ProductDetail,
  ProductListPageDetail,
} from '@/lib/api/types/catalog'

// The catalog's detail loaders: one record by its slug (export them from ../api.ts).

const PRODUCT_REVALIDATE = 60

/**
 * A detail loader: null for a slug that cannot be one segment, or on a 404; throws otherwise.
 * `<kind>/list/` is routed to the list endpoint, so for categories, brands and list pages a record
 * whose slug is `list` cannot be fetched (product digest §11.4): that slug is null too.
 * A 404 is remembered for a minute in process memory, so a repeated unknown slug asks nothing.
 */
function detailLoader<T>(endpoint: string, tag: string, revalidate: number, listReserved: boolean) {
  return cache(async (slug: string): Promise<T | null> => {
    const segment = oneSegment(slug)
    if (segment === null || (listReserved && segment.text === 'list')) return null
    const path = `${endpoint}/${segment.path}`
    return orRememberedNotFound(path, () =>
      read<T>(path, {
        revalidate,
        tags: [`${tag}:${segment.text}`, CATALOG_TAG],
      }),
    )
  })
}

/** `GET product/category/<slug>/`, by the category's own (last) slug. */
export const getCategory = detailLoader<CategoryDetail>(
  'product/category',
  'category',
  ENTITY_REVALIDATE,
  true,
)

/** `GET product/brand/<slug>/`. */
export const getBrand = detailLoader<BrandDetail>('product/brand', 'brand', ENTITY_REVALIDATE, true)

/** `GET product/list-page/<slug>/`. */
export const getListPage = detailLoader<ProductListPageDetail>(
  'product/list-page',
  'list',
  ENTITY_REVALIDATE,
  true,
)

/** `GET product/detail/<slug>/`, anonymous (no wishlist state, no staff preview). */
export const getProductDetail = detailLoader<ProductDetail>(
  'product/detail',
  'product',
  PRODUCT_REVALIDATE,
  false,
)
