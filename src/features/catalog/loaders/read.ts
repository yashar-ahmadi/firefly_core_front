import 'server-only'
import { headers } from 'next/headers'
import { getServerEnv } from '@/config/env'
import { isKnownMissing, rememberMissing } from '@/features/catalog/loaders/missing'
import { isApiNotFound } from '@/lib/api/errors'
import { apiFetch, type QueryInit } from '@/lib/api/server'
import { getClientIp } from '@/lib/http/client-ip'
import { normalizeSlug } from '@/lib/url/slug'

// What the catalog loaders share (detail.ts, listing.ts and ../api.ts). Callers import the
// loaders from `@/features/catalog/api`, never from here.

/** On every read: `revalidateTag('catalog')` refreshes the whole catalog. */
export const CATALOG_TAG = 'catalog'
/** Category, brand and list-page detail, and the brand list. */
export const ENTITY_REVALIDATE = 300

export interface ReadOptions {
  query?: QueryInit
  revalidate: number
  tags: string[]
  /**
   * The visitor IP, only for a read whose query the visitor chose freely (`isLongTail`). It is
   * part of Next's fetch cache key (every request header is), so the entry is per visitor, and
   * the API charges a miss to the visitor's own rate limit instead of the storefront's.
   */
  forwardedFor?: string | null
}

/**
 * An anonymous, cached API read: no token and no cart token. No visitor IP either, unless
 * `forwardedFor` is given for a long-tail query.
 */
export async function read<T>(path: string, options: ReadOptions): Promise<T> {
  const { data } = await apiFetch<T>(path, options)
  return data
}

/** The visitor's IP from `CLIENT_IP_HEADER`, or null (header missing or forwarding disabled). */
export async function visitorIp(): Promise<string | null> {
  return getClientIp(await headers(), getServerEnv().CLIENT_IP_HEADER)
}

/**
 * null on the API's own 404 (an unknown or draft record), remembered for `key` for a minute
 * (`./missing.ts`), so a repeated unknown slug costs no API call. Every other failure is thrown
 * and never remembered, a 404 page from a proxy in front of the API included.
 */
export async function orRememberedNotFound<T>(
  key: string,
  load: () => Promise<T>,
): Promise<T | null> {
  if (isKnownMissing(key)) return null
  try {
    return await load()
  } catch (error) {
    if (!isApiNotFound(error)) throw error
    rememberMissing(key)
    return null
  }
}

/**
 * A route slug as one API path segment: `path` is encoded once, `text` is decoded (for query
 * values and tags). null when it cannot be a single segment.
 */
export function oneSegment(raw: string): { path: string; text: string } | null {
  const path = normalizeSlug(raw)
  if (path === null || path.includes('/')) return null
  return { path, text: decodeURIComponent(path) }
}
