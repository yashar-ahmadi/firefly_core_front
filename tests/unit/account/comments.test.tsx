import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubBrowserApis } from '../support/dom-stubs'
import {
  commentsPage,
  PAGE_10001,
  POST_10001,
  PRODUCT_10001,
  PRODUCT_10014,
  SARA_COMMENTS,
} from './comment-fixtures'
import {
  apiError,
  callsTo,
  listReads,
  newCommentsApi,
  renderComments,
  stubCommentsApi,
} from './comments-support'

// «دیدگاه‌های من» (digest §3.6): rows keyed by subject type and id (three of sara's share id
// 10001), and «حذف دیدگاه»: a question first, then `DELETE dashboard/comment/<type>/<id>/delete/`
// (204, no body), the row gone, the list and the summary read again, the focus on the next row.

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
let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  mocks.search = ''
  api = newCommentsApi()
  stubCommentsApi(mocks.bffFetch, api)
  consoleError = vi.spyOn(console, 'error')
})

afterEach(() => {
  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockRestore()
})

// `hidden`: also while the modal dialog hides the page from assistive tech.
const rows = () => screen.getAllByRole('article', { hidden: true })
const row = (subject: string) => screen.getByRole('article', { name: subject, hidden: true })
const DELETE_PATH = 'dashboard/comment/post/10001/delete/'

async function askDelete(user: ReturnType<typeof renderComments>['user'], subject: string) {
  await user.click(within(row(subject)).getByRole('button', { name: /^حذف دیدگاه/ }))
  return screen.findByRole('dialog', { name: 'این دیدگاه حذف شود؟' })
}

describe('CommentsPage', () => {
  it('renders every row, even three that share id 10001 (no key collision)', async () => {
    renderComments()
    await waitFor(() => expect(rows()).toHaveLength(4))
    for (const comment of SARA_COMMENTS) {
      expect(row(comment.subject.name)).toBeInTheDocument()
    }
    const list = screen.getByRole('list', { name: 'دیدگاه‌های من' })
    expect(within(list).getAllByText('تأیید شده')).toHaveLength(4)
  })

  it('asks first, starting on «انصراف», and «انصراف» deletes nothing', async () => {
    const { user } = renderComments()
    await screen.findAllByRole('article')
    const dialog = await askDelete(user, POST_10001.subject.name)
    expect(dialog).toHaveAccessibleDescription(
      'پس از حذف، دیدگاه و پاسخ‌هایش از صفحه برداشته می‌شوند.',
    )
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'انصراف' })).toHaveFocus(),
    )
    await user.click(within(dialog).getByRole('button', { name: 'انصراف' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.remove).not.toHaveBeenCalled()
    expect(rows()).toHaveLength(4)
  })

  it('deletes with DELETE dashboard/comment/<subject_type>/<id>/delete/, once however often pressed', async () => {
    let finish: (value: unknown) => void = () => {}
    api.remove.mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    const { user } = renderComments()
    await screen.findAllByRole('article')
    const dialog = await askDelete(user, POST_10001.subject.name)
    const confirm = within(dialog).getByRole('button', { name: 'حذف دیدگاه' })
    await user.click(confirm)
    await user.click(confirm)
    expect(api.remove).toHaveBeenCalledTimes(1)
    expect(api.remove).toHaveBeenCalledWith('post', 10001)
    expect(callsTo(mocks.bffFetch, DELETE_PATH, 'DELETE')).toHaveLength(1)
    // The row waits while its delete is on its way.
    expect(row(POST_10001.subject.name)).toHaveAttribute('aria-busy', 'true')
    finish({ data: null, msg: '', status: 204 })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('a 204: the row goes at once, the list and the summary are read again, it is said', async () => {
    const { user } = renderComments()
    await screen.findAllByRole('article')
    const listsBefore = listReads(mocks.bffFetch).length
    const summariesBefore = callsTo(mocks.bffFetch, 'dashboard/summary/').length
    // The server's list from now on.
    api.list = () => commentsPage([PAGE_10001, PRODUCT_10014, PRODUCT_10001])
    api.count = 3
    const dialog = await askDelete(user, POST_10001.subject.name)
    await user.click(within(dialog).getByRole('button', { name: 'حذف دیدگاه' }))
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(screen.queryByRole('article', { name: POST_10001.subject.name })).toBeNull()
    // The same id on another subject type stays.
    expect(row(PAGE_10001.subject.name)).toBeInTheDocument()
    expect(row(PRODUCT_10001.subject.name)).toBeInTheDocument()
    await waitFor(() => expect(listReads(mocks.bffFetch).length).toBeGreaterThan(listsBefore))
    await waitFor(() =>
      expect(callsTo(mocks.bffFetch, 'dashboard/summary/').length).toBeGreaterThan(summariesBefore),
    )
    expect(mocks.notify.success).toHaveBeenCalledWith('دیدگاه حذف شد.')
    expect(mocks.notify.error).not.toHaveBeenCalled()
  })

  it('moves the focus to the next row’s heading, else the previous one, else the page’s', async () => {
    const { user } = renderComments()
    await screen.findAllByRole('article')
    // The second row: the next one (the third) takes the focus.
    api.list = () => commentsPage([PAGE_10001, PRODUCT_10014, PRODUCT_10001])
    let dialog = await askDelete(user, POST_10001.subject.name)
    await user.click(within(dialog).getByRole('button', { name: 'حذف دیدگاه' }))
    await waitFor(() =>
      expect(
        within(row(PRODUCT_10014.subject.name)).getByRole('heading', { level: 2 }),
      ).toHaveFocus(),
    )
    // The last row: the previous one takes it.
    api.list = () => commentsPage([PAGE_10001, PRODUCT_10014])
    dialog = await askDelete(user, PRODUCT_10001.subject.name)
    await user.click(within(dialog).getByRole('button', { name: 'حذف دیدگاه' }))
    await waitFor(() =>
      expect(
        within(row(PRODUCT_10014.subject.name)).getByRole('heading', { level: 2 }),
      ).toHaveFocus(),
    )
  })

  it('the only row: the page’s heading takes the focus over the empty state', async () => {
    api.list = () => commentsPage([PRODUCT_10014])
    const { user } = renderComments()
    await screen.findByRole('article')
    api.list = () => commentsPage([])
    api.count = 0
    const dialog = await askDelete(user, PRODUCT_10014.subject.name)
    await user.click(within(dialog).getByRole('button', { name: 'حذف دیدگاه' }))
    expect(await screen.findByRole('heading', { name: 'هنوز دیدگاهی ثبت نکرده‌اید' })).toBeVisible()
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'دیدگاه‌های من' })).toHaveFocus(),
    )
  })

  it('the last row of a page after the first: goes to the page before', async () => {
    mocks.search = 'type=product&page=3'
    api.list = () => commentsPage([PRODUCT_10014], { count: 41, page: 3, totalPages: 3 })
    const { user } = renderComments()
    await screen.findByRole('article')
    api.list = () => commentsPage([PRODUCT_10001], { count: 40, page: 2, totalPages: 2 })
    const dialog = await askDelete(user, PRODUCT_10014.subject.name)
    await user.click(within(dialog).getByRole('button', { name: 'حذف دیدگاه' }))
    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith('/account/comments/?type=product&page=2', {
        scroll: false,
      }),
    )
  })

  it('a 404 (withdrawn already): no error, the dialog closes and the list is read again quietly', async () => {
    api.remove.mockRejectedValue(apiError(404, 'not_found'))
    const { user } = renderComments()
    await screen.findAllByRole('article')
    const before = listReads(mocks.bffFetch).length
    api.list = () => commentsPage([PAGE_10001, PRODUCT_10014, PRODUCT_10001])
    const dialog = await askDelete(user, POST_10001.subject.name)
    await user.click(within(dialog).getByRole('button', { name: 'حذف دیدگاه' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(rows()).toHaveLength(3))
    expect(listReads(mocks.bffFetch).length).toBeGreaterThan(before)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(mocks.notify.error).not.toHaveBeenCalled()
    expect(mocks.notify.success).not.toHaveBeenCalled()
  })

  it('a 429: a calm sentence in the dialog, and the delete waits out retry_after', async () => {
    api.remove.mockRejectedValueOnce(apiError(429, 'throttled', { retry_after: 30 }))
    const { user } = renderComments()
    await screen.findAllByRole('article')
    const dialog = await askDelete(user, POST_10001.subject.name)
    const confirm = within(dialog).getByRole('button', { name: 'حذف دیدگاه' })
    await user.click(confirm)
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'لطفاً کمی بعد دوباره تلاش کنید.',
    )
    expect(confirm).toHaveAttribute('aria-disabled', 'true')
    await user.click(confirm)
    expect(api.remove).toHaveBeenCalledTimes(1)
    expect(rows()).toHaveLength(4)
  })

  it('another failure: the API’s message in the dialog, the row stays', async () => {
    api.remove.mockRejectedValueOnce(apiError(500, 'server_error'))
    const { user } = renderComments()
    await screen.findAllByRole('article')
    const dialog = await askDelete(user, POST_10001.subject.name)
    await user.click(within(dialog).getByRole('button', { name: 'حذف دیدگاه' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('پیام server_error')
    expect(rows()).toHaveLength(4)
    expect(row(POST_10001.subject.name)).not.toHaveAttribute('aria-busy')
  })
})
