import 'server-only'
import { ApiError, isApiNotFound } from '@/lib/api/errors'

// Detail 404s are never stored by the Data Cache (only successful fetches are), so every request
// for an unknown slug would cost an API call charged to the storefront's own address. This
// in-process list remembers the API's own 404s for a minute, least recently used out first: a
// detail's (`orRememberedNotFound`, ./read.ts) and a list page past the last
// (`orRememberedPastLastPage`, the catalog's and the blog's listings).

export const MISSING_TTL_MS = 60_000
export const MISSING_MAX_ENTRIES = 500

/** Key → time it expires. A Map keeps insertion order, which serves as the LRU order. */
const missing = new Map<string, number>()

/** Whether `key` answered 404 less than a minute ago (and marks it recently used). */
export function isKnownMissing(key: string, now = Date.now()): boolean {
  const expires = missing.get(key)
  if (expires === undefined) return false
  missing.delete(key)
  if (expires <= now) return false
  missing.set(key, expires)
  return true
}

/** Remember that `key` answered the API's own 404. */
export function rememberMissing(key: string, now = Date.now()): void {
  missing.delete(key)
  missing.set(key, now + MISSING_TTL_MS)
  while (missing.size > MISSING_MAX_ENTRIES) {
    const oldest = missing.keys().next().value
    if (oldest === undefined) break
    missing.delete(oldest)
  }
}

/** Test hook: forget everything. */
export function clearMissing(): void {
  missing.clear()
}

/** The API's own answer for a list page past the last («صفحه نامعتبر», `not_found`). */
const PAST_LAST_PAGE_DETAIL = 'صفحه نامعتبر'

/**
 * A list read (`load`) for a page past the last: the API's own 404 for a later page
 * (`isLaterPage`; page 1 always exists) is remembered for `key` (the normalised query) for a
 * minute and thrown again from memory, so a crawler asking for `?page=9999` again costs no API
 * call; the page still answers 404 (Plan 2's listing rule). Every other failure, and a 404 for a
 * first page or from a proxy in front of the API, is thrown and never remembered.
 */
export async function orRememberedPastLastPage<T>(
  key: string,
  isLaterPage: boolean,
  load: () => Promise<T>,
): Promise<T> {
  if (isLaterPage && isKnownMissing(key)) {
    throw new ApiError({ status: 404, code: 'not_found', detail: PAST_LAST_PAGE_DETAIL })
  }
  try {
    return await load()
  } catch (error) {
    if (isLaterPage && isApiNotFound(error)) rememberMissing(key)
    throw error
  }
}
