import 'server-only'

// Detail 404s are never stored by the Data Cache (only successful fetches are), so every request
// for an unknown slug would cost an API call charged to the storefront's own address. This
// in-process list remembers the API's own 404s for a minute, least recently used out first.

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
