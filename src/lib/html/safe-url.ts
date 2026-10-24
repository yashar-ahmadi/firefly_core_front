// Operator-entered URLs (socials, app links, support link) checked before they become an href.
// Pure: safe in Server and Client Components.

import { asParsed, isRootPath } from '@/lib/links/as-parsed'

/** `value` trimmed when it is an absolute http(s) URL with a host; otherwise null. */
export function httpUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? ''
  if (!/^https?:\/\//i.test(trimmed)) return null
  try {
    return new URL(trimmed).host ? trimmed : null
  } catch {
    return null
  }
}

/**
 * A storefront path (`/contact-us/`, never `//host`, as the URL parser reads it: src/lib/links/
 * as-parsed.ts) or an http(s) URL; otherwise null.
 */
export function linkUrl(value: string | null | undefined): string | null {
  const parsed = asParsed(value ?? '')
  return isRootPath(parsed) ? parsed : httpUrl(value)
}
