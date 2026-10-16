import 'server-only'
import { isApiNotFound } from '@/lib/api/errors'
import { apiFetch, type QueryInit } from '@/lib/api/server'
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
}

/** An anonymous, cached API read: no token, no cart token, no visitor IP. */
export async function read<T>(path: string, options: ReadOptions): Promise<T> {
  const { data } = await apiFetch<T>(path, options)
  return data
}

/**
 * null on the API's own 404 (an unknown or draft record); every other failure is thrown, a 404
 * page from a proxy in front of the API included.
 */
export async function orNotFound<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load()
  } catch (error) {
    if (isApiNotFound(error)) return null
    throw error
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
