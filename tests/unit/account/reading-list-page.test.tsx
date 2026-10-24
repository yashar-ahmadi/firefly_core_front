import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiPath, type QueryInit } from '@/lib/api/envelope'
import { ApiError } from '@/lib/api/errors'
import type { ReadingListPost } from '@/lib/api/types/blog'
import type { Paginated } from '@/lib/api/types/common'
import { SARA } from '../auth/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { spyOnHistory } from '../support/history'
import { ok, summary } from './fixtures'
import {
  isPageQuery,
  listPage,
  pastTheEnd,
  READING_LIST,
  renderReadingList,
  savedPost,
} from './reading-list-support'

// `/account/reading-list/` (blog digest §1.8, dashboard digest §3.2–3.3): the saved posts as the
// blog's cards, searched, filtered by a blog category and sorted by when they were saved, pages;
// all of it in the URL, defaults left out, nothing the API would refuse ever sent.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), search: '' }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/account/reading-list/',
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

const POSTS = [savedPost(1), savedPost(2), savedPost(3)]
let list: (query: QueryInit) => Paginated<ReadingListPost> | ApiError = () => listPage(POSTS)
let history = spyOnHistory()

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  history = spyOnHistory()
  mocks.search = ''
  list = () => listPage(POSTS)
  mocks.bffFetch.mockImplementation(async (path: string, options: { query?: QueryInit } = {}) => {
    if (path === 'dashboard/summary/') return ok(summary({ reading_list_count: 3 }))
    if (path === 'account/profile/me/') return ok(SARA)
    if (path === READING_LIST && !isPageQuery(options.query)) return ok(listPage(POSTS))
    if (path === READING_LIST) {
      const answer = list(options.query ?? {})
      if (answer instanceof ApiError) throw answer
      return ok(answer)
    }
    throw new Error(`unexpected ${path}`)
  })
})

/** The page's list reads, as the BFF receives them. */
const pageReads = () =>
  mocks.bffFetch.mock.calls
    .filter(([path, options]) => path === READING_LIST && isPageQuery(options?.query))
    .map(([path, options]) => apiPath(path as string, options?.query))

const sort = () => screen.getByRole('combobox', { name: 'مرتب\u{200C}سازی' })
const category = () => screen.getByRole('combobox', { name: 'دسته\u{200C}بندی' })

describe('ReadingListPage', () => {
  it('shows the saved posts as the blog’s cards, newest saved first, and how many', async () => {
    renderReadingList()
    expect(screen.getByRole('heading', { level: 1, name: 'لیست مطالعه' })).toBeVisible()
    const cards = within(await screen.findByRole('list', { name: 'لیست مطالعه' })).getAllByRole(
      'article',
    )
    expect(cards).toHaveLength(3)
    const link = within(cards[0]!).getByRole('link', { name: 'مطلب ۱' })
    expect(link).toHaveAttribute('href', '/blog/post-1/')
    expect(screen.getByText('۳ مطلب')).toBeVisible()
    expect(sort()).toHaveValue('added-desc')
    expect(category()).toHaveValue('')
    expect(pageReads()).toEqual([`${READING_LIST}?limit=12`])
  })

  it('reads the search, the category, the sort and the page from the URL and sends them', async () => {
    mocks.search = 'search=گوشی&category=mobile-blog&sort=added-asc&page=2'
    list = () => listPage([savedPost(3)], { count: 13, page: 2, totalPages: 2 })
    renderReadingList()
    await screen.findByRole('article')
    expect(pageReads()).toEqual([
      `${READING_LIST}?search=${encodeURIComponent('گوشی')}&category=mobile-blog&sort=added-asc&page=2&limit=12`,
    ])
    expect(category()).toHaveValue('mobile-blog')
    expect(screen.getByRole('searchbox', { name: 'جستجو در لیست مطالعه' })).toHaveValue('گوشی')
    // Its form, a search landmark named apart from the header's.
    expect(screen.getByRole('search', { name: 'جستجو در لیست مطالعه' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'صفحه قبلی' })).toHaveAttribute(
      'href',
      `/account/reading-list/?search=${encodeURIComponent('گوشی')}&category=mobile-blog&sort=added-asc`,
    )
  })

  it('never sends what the API would refuse or ignore: a bad sort, an unknown category, page 0', async () => {
    mocks.search = 'sort=title&category=no-such&page=0'
    renderReadingList()
    await screen.findAllByRole('article')
    expect(pageReads()).toEqual([`${READING_LIST}?limit=12`])
    expect(sort()).toHaveValue('added-desc')
    expect(category()).toHaveValue('')
  })

  it('a new sort or category goes back to page 1, replacing the URL; a search is a new entry', async () => {
    mocks.search = 'page=2'
    list = () => listPage(POSTS, { count: 15, page: 2, totalPages: 2 })
    const { user } = renderReadingList()
    await screen.findAllByRole('article')
    await user.selectOptions(sort(), 'قدیمی\u{200C}ترین')
    expect(history.replaced().at(-1)).toBe('/account/reading-list/?sort=added-asc')
    await user.selectOptions(category(), 'mobile-blog')
    expect(history.replaced().at(-1)).toBe('/account/reading-list/?category=mobile-blog')
    await user.type(screen.getByRole('searchbox', { name: 'جستجو در لیست مطالعه' }), 'باتری')
    await user.click(screen.getByRole('button', { name: 'جستجو' }))
    expect(history.pushed().at(-1)).toBe(
      `/account/reading-list/?search=${encodeURIComponent('باتری')}`,
    )
  })

  it('a page past the end (404): goes to the last page there is', async () => {
    mocks.search = 'page=7'
    list = (query) =>
      query.page === 7 ? pastTheEnd() : listPage(POSTS, { count: 30, totalPages: 3 })
    renderReadingList()
    await waitFor(() => expect(history.replaced()).toContain('/account/reading-list/?page=3'))
  })

  it('nothing saved: says so, with the way to the blog', async () => {
    list = () => listPage([])
    renderReadingList()
    expect(
      await screen.findByRole('heading', { name: 'هنوز مطلبی در لیست مطالعه ندارید' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: /رفتن به وبلاگ/ })).toHaveAttribute('href', '/blog/')
  })

  it('nothing for a search or category: says so, with a button that clears them', async () => {
    mocks.search = 'search=x&category=buying-guide&sort=added-asc'
    list = () => listPage([])
    const { user } = renderReadingList()
    expect(
      await screen.findByRole('heading', { name: 'مطلبی با این جستجو پیدا نشد' }),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'نمایش همه مطالب' }))
    expect(history.replaced().at(-1)).toBe('/account/reading-list/?sort=added-asc')
  })

  it('a failed read (a 500): «تلاش دوباره» reads it again', async () => {
    let fail: ApiError | null = new ApiError({ status: 500, code: 'server_error' })
    list = () => fail ?? listPage(POSTS.slice(0, 1))
    const { user } = renderReadingList()
    expect(await screen.findByText('لیست مطالعه بارگذاری نشد.')).toBeVisible()
    fail = null
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByRole('article')).toBeInTheDocument()
  })

  it('a 429: asked to wait, and «تلاش دوباره» reads nothing until its retry_after is over', async () => {
    list = () => new ApiError({ status: 429, code: 'throttled', retryAfter: 30 })
    const { user } = renderReadingList()
    expect(await screen.findByText('لطفاً کمی بعد دوباره تلاش کنید.')).toBeVisible()
    const retry = screen.getByRole('button', { name: 'تلاش دوباره' })
    expect(retry).toHaveAttribute('aria-disabled', 'true')
    expect(retry).toHaveAccessibleDescription(/زمان باقی/)
    const reads = pageReads().length
    await user.click(retry)
    expect(pageReads()).toHaveLength(reads)
  })

  it('with the blog switched off: the operator’s reason, and nothing read', async () => {
    renderReadingList({
      features: { blog: { key: 'blog', name: 'وبلاگ', enabled: false, reason: 'تا فردا.' } },
    })
    expect(screen.getByText('وبلاگ موقتاً در دسترس نیست')).toBeVisible()
    expect(screen.getByText('تا فردا.')).toBeVisible()
    expect(pageReads()).toEqual([])
  })
})
