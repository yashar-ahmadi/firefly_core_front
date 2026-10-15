import 'server-only'
import { ApiError } from '@/lib/api/errors'
import { apiFetch } from '@/lib/api/server'

/** Shared plumbing of the settings loaders: never-throw wrapper, paging and payload guards. */

const PAGE_SIZE = 100
/** A bound on a misbehaving `next` link: 2000 rows per list. */
const MAX_PAGES = 20

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** One log line: the status and code of an API error, else the message. Never headers or URLs. */
function logFailure(loader: string, error: unknown): void {
  if (error instanceof ApiError) {
    console.error(`[settings] ${loader} failed:`, error.status, error.code)
  } else {
    console.error(`[settings] ${loader} failed:`, error instanceof Error ? error.message : error)
  }
}

/** Run `load`; on any failure log once and return `fallback`. */
export async function guarded<T>(loader: string, fallback: T, load: () => Promise<T>): Promise<T> {
  try {
    return await load()
  } catch (error) {
    logFailure(loader, error)
    return fallback
  }
}

/**
 * Every row of a paginated list, following `next` (the page number is kept here, never the URL).
 * Throws when a page is unusable or the list is longer than `MAX_PAGES`: never a partial list.
 */
export async function fetchAllRows(
  path: string,
  options: { revalidate: number; tags: string[] },
): Promise<unknown[]> {
  const rows: unknown[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data } = await apiFetch<unknown>(path, {
      query: { limit: PAGE_SIZE, page },
      ...options,
    })
    if (!isRecord(data) || !Array.isArray(data.results)) {
      throw new Error(`unexpected ${path} payload`)
    }
    rows.push(...data.results)
    if (!data.next) return rows
  }
  // A list this long is a misbehaving `next` link; a partial list would be misleading (a category
  // tree with missing parents), so this is a failure like any other and `guarded` reports it once.
  throw new Error(`${path} has more than ${MAX_PAGES} pages`)
}
