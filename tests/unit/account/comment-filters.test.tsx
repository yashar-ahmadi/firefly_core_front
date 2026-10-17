import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loginHref } from '@/lib/links/login'
import { stubBrowserApis } from '../support/dom-stubs'
import { spyOnHistory } from '../support/history'
import { commentsPage, PENDING_QUESTION, POST_10001, SARA_COMMENTS } from './comment-fixtures'
import {
  apiError,
  listReads,
  newCommentsApi,
  renderComments,
  stubCommentsApi,
} from './comments-support'

// «دیدگاه‌های من»'s filters live in the URL (`?type=post&status=pending&page=2`): the subject
// tabs send `subject_type` (repeated for several, none for «همه»), the status chips `status`;
// a value the API would refuse (400) is never sent. The page's states: nothing at all, nothing
// for the filter, a page past the end, a 429.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  search: '',
  replace: vi.fn(),
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
  usePathname: () => '/account/comments/',
  useSearchParams: () => new URLSearchParams(mocks.search),
}))
vi.mock('@/components/ui/toaster', () => ({ notify: mocks.notify, toastRegionReady: () => true }))

let api = newCommentsApi()

let history = spyOnHistory()

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  history = spyOnHistory()
  mocks.search = ''
  api = newCommentsApi()
  stubCommentsApi(mocks.bffFetch, api)
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

const LIST = 'dashboard/comment/list/'
const tabs = () => screen.getByRole('navigation', { name: 'نوع دیدگاه' })
const statuses = () => screen.getByRole('group', { name: 'وضعیت دیدگاه' })

describe('CommentsPage filters', () => {
  it('«همه» sends no subject_type nor status; every tab and chip is a link that resets the page', async () => {
    mocks.search = 'page=2'
    api.list = () => commentsPage(SARA_COMMENTS, { count: 24, page: 2, totalPages: 2 })
    renderComments()
    await screen.findAllByRole('article')
    expect(listReads(mocks.bffFetch)).toEqual([`${LIST}?page=2`])
    const all = within(tabs()).getByRole('link', { name: 'همه' })
    expect(all).toHaveAttribute('aria-current', 'page')
    expect(within(tabs()).getByRole('link', { name: 'محصولات' })).toHaveAttribute(
      'href',
      '/account/comments/?type=product',
    )
    expect(within(tabs()).getByRole('link', { name: 'مطالب وبلاگ' })).toHaveAttribute(
      'href',
      '/account/comments/?type=post',
    )
    expect(within(tabs()).getByRole('link', { name: 'صفحات' })).toHaveAttribute(
      'href',
      '/account/comments/?type=page',
    )
    expect(within(statuses()).getByRole('link', { name: 'همه' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(within(statuses()).getByRole('link', { name: 'در انتظار تأیید' })).toHaveAttribute(
      'href',
      '/account/comments/?status=pending',
    )
    expect(within(statuses()).getByRole('link', { name: 'تأیید شده' })).toHaveAttribute(
      'href',
      '/account/comments/?status=accepted',
    )
    expect(within(statuses()).getByRole('link', { name: 'رد شده' })).toHaveAttribute(
      'href',
      '/account/comments/?status=declined',
    )
  })

  it('a tab and a status from the URL: both sent, both marked, each link keeps the other', async () => {
    mocks.search = 'type=post&status=pending'
    api.list = () => commentsPage([{ ...POST_10001, status: 'pending' }])
    renderComments()
    await screen.findByRole('article')
    expect(listReads(mocks.bffFetch)).toEqual([`${LIST}?subject_type=post&status=pending`])
    expect(within(tabs()).getByRole('link', { name: 'مطالب وبلاگ' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(tabs()).getByRole('link', { name: 'همه' })).not.toHaveAttribute('aria-current')
    expect(within(tabs()).getByRole('link', { name: 'محصولات' })).toHaveAttribute(
      'href',
      '/account/comments/?type=product&status=pending',
    )
    expect(within(statuses()).getByRole('link', { name: 'در انتظار تأیید' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    expect(within(statuses()).getByRole('link', { name: 'رد شده' })).toHaveAttribute(
      'href',
      '/account/comments/?type=post&status=declined',
    )
    expect(within(statuses()).getByRole('link', { name: 'همه' })).toHaveAttribute(
      'href',
      '/account/comments/?type=post',
    )
  })

  it('several types: subject_type repeated, never comma-joined', async () => {
    mocks.search = 'type=post&type=page'
    renderComments()
    await screen.findAllByRole('article')
    expect(listReads(mocks.bffFetch)).toEqual([`${LIST}?subject_type=post&subject_type=page`])
  })

  it('values the API would refuse fall back to the defaults: never sent', async () => {
    mocks.search = 'type=review&type=post,page&status=approved&page=abc'
    renderComments()
    await screen.findAllByRole('article')
    expect(listReads(mocks.bffFetch)).toEqual([LIST])
    expect(within(tabs()).getByRole('link', { name: 'همه' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('a page past the end (404): goes to the last page there is', async () => {
    mocks.search = 'status=accepted&page=9'
    api.list = (query) =>
      query.page === 9
        ? apiError(404, 'not_found')
        : commentsPage(SARA_COMMENTS, { count: 44, totalPages: 3 })
    renderComments()
    await waitFor(() =>
      expect(history.replaced()).toContain('/account/comments/?status=accepted&page=3'),
    )
    expect(screen.queryByText('دیدگاه‌ها بارگذاری نشد.')).toBeNull()
  })

  it('no comment at all: «هنوز دیدگاهی ثبت نکرده‌اید»', async () => {
    api.list = () => commentsPage([])
    api.count = 0
    renderComments()
    expect(await screen.findByRole('heading', { name: 'هنوز دیدگاهی ثبت نکرده‌اید' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'نمایش همه' })).toBeNull()
  })

  it('none for the filter: says so, and «نمایش همه» clears the filters', async () => {
    mocks.search = 'type=page&status=declined'
    api.list = () => commentsPage([])
    renderComments()
    expect(
      await screen.findByRole('heading', { name: 'دیدگاهی با این فیلترها پیدا نشد' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: 'نمایش همه' })).toHaveAttribute(
      'href',
      '/account/comments/',
    )
  })

  it('a failed read: «تلاش دوباره» reads it again', async () => {
    let fail = true
    api.list = () => (fail ? apiError(500, 'server_error') : commentsPage([PENDING_QUESTION]))
    const { user } = renderComments()
    expect(await screen.findByText('دیدگاه‌ها بارگذاری نشد.')).toBeVisible()
    fail = false
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByRole('article')).toBeInTheDocument()
  })

  it('a 429: a calm sentence, and «تلاش دوباره» waits out retry_after', async () => {
    api.list = () => apiError(429, 'throttled', { retry_after: 20 })
    const { user } = renderComments()
    expect(await screen.findByText('لطفاً کمی بعد دوباره تلاش کنید.')).toBeVisible()
    const retry = screen.getByRole('button', { name: 'تلاش دوباره' })
    expect(retry).toHaveAttribute('aria-disabled', 'true')
    const reads = listReads(mocks.bffFetch).length
    await user.click(retry)
    expect(listReads(mocks.bffFetch)).toHaveLength(reads)
  })

  it('the session gone (401) on a delete: login, with this page as next', async () => {
    window.history.replaceState(null, '', '/account/comments/?type=post')
    mocks.search = 'type=post'
    api.list = () => commentsPage([POST_10001])
    api.remove.mockRejectedValue(apiError(401, 'token_not_valid'))
    const { user } = renderComments()
    await user.click(await screen.findByRole('button', { name: /^حذف دیدگاه/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'حذف دیدگاه' }))
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(loginHref('/account/comments/?type=post')),
    )
    expect(mocks.notify.error).not.toHaveBeenCalled()
  })
})
