import { describe, expect, it, vi } from 'vitest'
import { everyPage, nextPageNumber } from '@/lib/api/every-page'
import type { Paginated } from '@/lib/api/types/common'

// Every page of a paginated list (the FAQ's categories, the contact subjects): `next` is an
// absolute URL built on the host the API was called on (an internal one behind a proxy), so only
// its `page` is taken from it (blog-faq digest §0.2, §2.2).

function page<T>(results: T[], next: string | null): Paginated<T> {
  return {
    count: results.length,
    total_pages: 1,
    current_page: 1,
    page_size: 100,
    next,
    previous: null,
    results,
  }
}

describe('nextPageNumber', () => {
  it('takes only `page` from `next`, whatever its host', () => {
    expect(
      nextPageNumber('http://backend:8000/api/v1/faq/category/list/?limit=100&page=3', 2),
    ).toBe(3)
  })

  it('is null on the last page, and the next one when `next` names none', () => {
    expect(nextPageNumber(null, 1)).toBeNull()
    expect(nextPageNumber('https://api.test/api/v1/faq/category/list/?limit=100', 1)).toBe(2)
  })

  it('never goes back or stays put (a page that leads to itself ends the list)', () => {
    expect(nextPageNumber('https://api.test/x/?page=1', 1)).toBeNull()
    expect(nextPageNumber('https://api.test/x/?page=abc', 4)).toBe(5)
  })
})

describe('everyPage', () => {
  it('reads page 1, then each page `next` names, in order, until it is null', async () => {
    const read = vi.fn(async (number: number) =>
      number === 1
        ? page(['a', 'b'], 'http://internal/api/v1/x/?limit=100&page=2')
        : page(['c'], null),
    )
    expect(await everyPage(read)).toEqual(['a', 'b', 'c'])
    expect(read.mock.calls).toEqual([[1], [2]])
  })

  it('stops after `maxPages`, never looping on a list that does not end', async () => {
    const read = vi.fn(async (number: number) =>
      page([number], `https://api.test/x/?page=${number + 1}`),
    )
    expect(await everyPage(read, 3)).toEqual([1, 2, 3])
    expect(read).toHaveBeenCalledTimes(3)
  })

  it('lets a failed read through', async () => {
    const read = vi.fn(async () => {
      throw new Error('down')
    })
    await expect(everyPage(read)).rejects.toThrow('down')
  })
})
