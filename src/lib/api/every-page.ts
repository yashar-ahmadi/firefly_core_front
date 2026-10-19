import type { Paginated } from '@/lib/api/types/common'

// Every page of a paginated list (the FAQ's categories, the contact subjects). Pure: the server
// loaders and the browser's subject refetch share it.

/**
 * The page number after `current`, from the list's `next`: only its `page` is read, since `next`
 * is an absolute URL on whatever host the API was called on (an internal one behind a proxy:
 * blog-faq digest §0.2). null on the last page, and for a `next` that leads back (a list that
 * would never end); `current + 1` when `next` names no usable page.
 */
export function nextPageNumber(next: string | null, current: number): number | null {
  if (next === null) return null
  let page: number
  try {
    page = Number(new URL(next, 'https://api.invalid').searchParams.get('page'))
  } catch {
    page = Number.NaN
  }
  if (!Number.isInteger(page) || page < 1) return current + 1
  return page > current ? page : null
}

/** The default cap: with the API's largest page (100 rows), 5000 rows. */
const MAX_PAGES = 50

/**
 * Every row, page 1 first, then each page `next` names, until it is null, at most `maxPages`
 * pages. A failed read is thrown.
 */
export async function everyPage<T>(
  read: (page: number) => Promise<Paginated<T>>,
  maxPages = MAX_PAGES,
): Promise<T[]> {
  const rows: T[] = []
  let page: number | null = 1
  for (let count = 0; page !== null && count < maxPages; count += 1) {
    const list: Paginated<T> = await read(page)
    rows.push(...list.results)
    page = nextPageNumber(list.next, page)
  }
  return rows
}
