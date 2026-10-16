import 'server-only'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { getServerEnv } from '@/config/env'
import { ApiError } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'
import type { SearchGroup, SearchResults } from '@/lib/api/types/search'
import { COOKIE } from '@/lib/auth/cookies'
import { isJwt } from '@/lib/bff/session'
import { getClientIp } from '@/lib/http/client-ip'

/** What the results page shows: the results, a term the API refused (400), or a 429. */
export type SearchOutcome =
  | { kind: 'found'; results: SearchResults }
  /** `detail`: the API's own Persian reason (too short, too long, a NUL character…). */
  | { kind: 'refused'; detail: string }
  | { kind: 'throttled' }

function group<T>(raw: SearchGroup<T> | undefined): SearchGroup<T> {
  return {
    count: typeof raw?.count === 'number' ? raw.count : 0,
    items: Array.isArray(raw?.items) ? raw.items : [],
    listing_query: raw?.listing_query ?? null,
  }
}

/** Every group present, so a missing one renders as empty instead of failing the page. */
function tidy(data: SearchResults): SearchResults {
  return {
    query: data.query,
    total: data.total,
    products: group(data.products),
    product_categories: group(data.product_categories),
    brands: group(data.brands),
    blog_posts: group(data.blog_posts),
    pages: group(data.pages),
  }
}

/**
 * `GET search/?q=` for the results page (content digest §7.1), with `q` passed as typed (the
 * API normalises and validates it). Never cached (`no-store`: every call is logged in the
 * operator's search report), so it carries what is the visitor's own:
 * - their IP as `X-Forwarded-For`, for the API's per-IP throttle;
 * - their session's access token (a JWT-shaped `ff_at` only), so staff searches stay out of the
 *   report. A stale one is answered as a guest.
 * One call per request: React `cache` shares it between `generateMetadata` and the page.
 * A 400 (`validation_error`) and a 429 are outcomes; any other failure throws.
 */
export const searchCatalog = cache(async (q: string): Promise<SearchOutcome> => {
  const [headerList, cookieStore] = await Promise.all([headers(), cookies()])
  const access = cookieStore.get(COOKIE.access)?.value
  try {
    const { data } = await apiFetch<SearchResults>('search/', {
      query: { q },
      forwardedFor: getClientIp(headerList, getServerEnv().CLIENT_IP_HEADER),
      token: isJwt(access) ? access : null,
    })
    return { kind: 'found', results: tidy(data) }
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) {
      return { kind: 'refused', detail: error.detail }
    }
    if (error instanceof ApiError && error.status === 429) return { kind: 'throttled' }
    throw error
  }
})
