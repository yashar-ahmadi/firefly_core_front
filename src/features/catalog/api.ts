import 'server-only'
import { cache } from 'react'
import { ApiError } from '@/lib/api/errors'
import type { HomePage, ProductSettings } from '@/lib/api/types/catalog'
import { CATALOG_TAG, read } from '@/features/catalog/loaders/read'

export {
  getBrand,
  getCategory,
  getListPage,
  getProductDetail,
} from '@/features/catalog/loaders/detail'
export {
  getBrands,
  getFilters,
  getProductList,
  isPastLastPage,
} from '@/features/catalog/loaders/listing'

/**
 * Server loaders of the public catalog. Every read is anonymous: no token, no cart token and no
 * visitor IP, so one Data Cache entry (and the HTML built from it) serves everyone. `cache()`
 * dedupes the calls within one render (`generateMetadata` plus the page). Tags: the entity tag
 * (`product:`, `category:`, `brand:` or `list:` plus the decoded slug) or `home`, then `catalog`
 * on every read, so `revalidateTag('catalog')` refreshes the whole catalog.
 *
 * Settings and the homepage live here; one-record loaders in ./loaders/detail.ts, list and
 * filter loaders in ./loaders/listing.ts, re-exported above. Import them all from here.
 */

const HOME_REVALIDATE = 60
const SETTINGS_REVALIDATE = 300

const DEFAULT_PRODUCT_SETTINGS: ProductSettings = {
  paginator_number: 24,
  show_out_of_stock_label: true,
  related_items_display_status: true,
  related_items_number: 8,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One log line: the status and code of an API error, else the message. Never headers or URLs. */
function logFailure(loader: string, error: unknown): void {
  if (error instanceof ApiError) {
    console.error(`[catalog] ${loader} failed:`, error.status, error.code)
  } else {
    console.error(`[catalog] ${loader} failed:`, error instanceof Error ? error.message : error)
  }
}

/** Each field from the payload when it has the right type, else its default. */
function settingsFrom(raw: unknown): ProductSettings {
  const fallback = DEFAULT_PRODUCT_SETTINGS
  if (!isRecord(raw)) return { ...fallback }
  const count = (value: unknown, min: number, otherwise: number) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : otherwise
  const flag = (value: unknown, otherwise: boolean) =>
    typeof value === 'boolean' ? value : otherwise
  return {
    paginator_number: count(raw.paginator_number, 1, fallback.paginator_number),
    show_out_of_stock_label: flag(raw.show_out_of_stock_label, fallback.show_out_of_stock_label),
    related_items_display_status: flag(
      raw.related_items_display_status,
      fallback.related_items_display_status,
    ),
    related_items_number: count(raw.related_items_number, 0, fallback.related_items_number),
  }
}

/** `GET product/settings/`. Never throws: any failure logs once and gives the defaults. */
export const getProductSettings = cache(async (): Promise<ProductSettings> => {
  try {
    const data = await read<unknown>('product/settings', {
      revalidate: SETTINGS_REVALIDATE,
      tags: [CATALOG_TAG],
    })
    return settingsFrom(data)
  } catch (error) {
    logFailure('getProductSettings', error)
    return { ...DEFAULT_PRODUCT_SETTINGS }
  }
})

/** `GET homepage/`. Throws on failure, so the error boundary shows instead of an empty home. */
export const getHomePage = cache((): Promise<HomePage> =>
  read<HomePage>('homepage', { revalidate: HOME_REVALIDATE, tags: ['home', CATALOG_TAG] }),
)
