import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, type Mock } from 'vitest'
import { WishlistPage } from '@/features/account/wishlist/wishlist-page'
import { apiPath, type QueryInit } from '@/lib/api/envelope'
import { ApiError } from '@/lib/api/errors'
import type { WishlistProductCard } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'
import { toPersianDigits } from '@/lib/format'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { SARA } from '../auth/fixtures'
import { cardFixture } from '../catalog/card-fixtures'
import { authProviders } from '../support/auth-providers'
import { ok, summary } from './fixtures'

// The wishlist page's tests share an API stand-in: the page's list answers from `api.list` (by
// its query), the hearts' saved ids (`?limit=100`) from `api.saved`, the summary from it too, and
// the heart's writes (`product/detail/<slug>/wishlist/`) from `api.toggle`.

export const WISHLIST_LIST = 'product/wishlist/list/'

type Options = { method?: string; query?: QueryInit }

/** A saved product as the wishlist list answers it (a simple product: one-tap add). */
export function saved(id: number, changes: Partial<WishlistProductCard> = {}): WishlistProductCard {
  return {
    ...cardFixture({
      id,
      slug: `product-${id}`,
      name: `کالای ${toPersianDigits(id)}`,
      type: 'simple',
      default_variant_id: id * 10,
      default_variant_attributes: [],
    }),
    is_in_wishlist: true,
    added_at: '2026-10-01T10:00:00+03:30',
    ...changes,
  }
}

export function wishlistPage(
  results: WishlistProductCard[],
  { count = results.length, page = 1, totalPages = 1 } = {},
): Paginated<WishlistProductCard> {
  return {
    count,
    total_pages: totalPages,
    current_page: page,
    page_size: 20,
    next: null,
    previous: null,
    results,
  }
}

export interface WishlistApi {
  /** The page's list for a query (an `ApiError` is thrown). */
  list: (query: QueryInit) => Paginated<WishlistProductCard> | ApiError
  /** Every saved product id (the hearts' list, the summary's count). */
  saved: number[]
  /** Answers a heart's POST or DELETE. */
  toggle: Mock<(slug: string, method: string) => Promise<unknown>>
}

export function newWishlistApi(products: WishlistProductCard[]): WishlistApi {
  const api: WishlistApi = {
    list: () => wishlistPage(products),
    saved: products.map((product) => product.id),
    toggle: vi.fn(async (_slug: string, method: string) =>
      method === 'DELETE'
        ? { data: null, msg: '', status: 204 }
        : {
            data: { is_in_wishlist: true },
            msg: 'محصول به علاقه‌مندی‌ها اضافه شد.',
            status: 201,
          },
    ),
  }
  return api
}

const TOGGLE = /^product\/detail\/([^/]+)\/wishlist\/$/

export function stubWishlistApi(bffFetch: Mock, api: WishlistApi) {
  bffFetch.mockImplementation(async (path: string, options: Options = {}) => {
    if (path === 'dashboard/summary/') return ok(summary({ wishlist_count: api.saved.length }))
    if (path === 'account/profile/me/') return ok(SARA)
    if (path === WISHLIST_LIST && options.query?.limit === 100) {
      return ok(wishlistPage(api.saved.map((id) => saved(id))))
    }
    if (path === WISHLIST_LIST) {
      const answer = api.list(options.query ?? {})
      if (answer instanceof ApiError) throw answer
      return ok(answer)
    }
    const toggle = TOGGLE.exec(path)
    if (toggle) return api.toggle(toggle[1]!, options.method ?? 'GET')
    throw new Error(`unexpected ${options.method ?? 'GET'} ${path}`)
  })
}

/** The page's list reads (not the hearts'), each as the URL the BFF receives. */
export function pageReads(bffFetch: Mock): string[] {
  return bffFetch.mock.calls
    .filter(
      ([path, options]) =>
        path === WISHLIST_LIST && (options as Options | undefined)?.query?.limit !== 100,
    )
    .map(([path, options]) => apiPath(path as string, (options as Options | undefined)?.query))
}

/** The page signed in as sara; `retry: false` so a failed read shows at once. */
export function renderWishlist({ showOutOfStockLabel = true } = {}) {
  const providers = authProviders({ hasSession: true })
  providers.client.setQueryData(ME_KEY, SARA)
  providers.client.setQueryDefaults(['wishlist'], { retry: false })
  const user = userEvent.setup()
  const view = render(
    <WishlistPage title="علاقه‌مندی‌ها" showOutOfStockLabel={showOutOfStockLabel} />,
    { wrapper: providers.wrapper },
  )
  return { user, client: providers.client, ...view }
}

/** A 404 as the API answers a page past the end. */
export const pastTheEnd = () =>
  ApiError.fromBody(404, {
    msg: 'موردی با این مشخصات پیدا نشد.',
    data: {
      type: 'client_error',
      errors: [{ code: 'not_found', detail: 'صفحه نامعتبر', attr: null }],
    },
  })
