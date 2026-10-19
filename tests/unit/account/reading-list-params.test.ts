import { describe, expect, it } from 'vitest'
import {
  categoryOptions,
  parseReadingListParams,
  readingListApiQuery,
  readingListSearch,
} from '@/features/account/reading-list/reading-list-params'
import { categoryListItem } from '../blog/fixtures'

// The reading list page's URL (`?search=…&category=…&sort=added-asc&page=2`, defaults left out)
// and the API query it makes (blog digest §1.8, dashboard digest §3.3). Pure.

const parse = (query: string) => parseReadingListParams(new URLSearchParams(query))

describe('parseReadingListParams', () => {
  it('reads every filter, Persian digits too', () => {
    expect(parse('search=+گوشی+&category=mobile-blog&sort=added-asc&page=۲')).toEqual({
      search: 'گوشی',
      category: 'mobile-blog',
      sort: 'added-asc',
      page: 2,
    })
  })

  it('falls back to the defaults for what the API would refuse (never sent)', () => {
    expect(parse('sort=price&page=0&category=a/b&search=')).toEqual({
      search: '',
      category: null,
      sort: 'added-desc',
      page: 1,
    })
  })

  it('cuts a long search', () => {
    expect(parse(`search=${'ب'.repeat(300)}`).search).toHaveLength(100)
  })
})

describe('readingListSearch and readingListApiQuery', () => {
  const params = { search: 'گوشی', category: 'mobile-blog', sort: 'added-asc', page: 3 } as const

  it('write the URL with the defaults left out', () => {
    expect(readingListSearch(params)).toBe(
      `?search=${encodeURIComponent('گوشی')}&category=mobile-blog&sort=added-asc&page=3`,
    )
    expect(readingListSearch({ search: '', category: null, sort: 'added-desc', page: 1 })).toBe('')
  })

  it('ask the API by its own names, 12 a page, nothing for a default', () => {
    expect(readingListApiQuery(params)).toEqual({
      search: 'گوشی',
      category: 'mobile-blog',
      sort: 'added-asc',
      page: 3,
      limit: 12,
    })
    expect(
      readingListApiQuery({ search: '', category: null, sort: 'added-desc', page: 1 }),
    ).toEqual({ limit: 12 })
  })
})

describe('categoryOptions', () => {
  it('the blog’s categories by slug, a child under its parent, indented', () => {
    const options = categoryOptions([
      categoryListItem(1, 'tech-news', null, 'اخبار فناوری'),
      categoryListItem(2, 'tech-news/mobile-blog', 1, 'گوشی و موبایل'),
      categoryListItem(3, 'lifestyle', null, 'سبک زندگی'),
    ])
    expect(options).toEqual([
      { value: 'tech-news', label: 'اخبار فناوری' },
      { value: 'mobile-blog', label: '\u{2003}گوشی و موبایل' },
      { value: 'lifestyle', label: 'سبک زندگی' },
    ])
  })
})
