import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REFRESH_MESSAGE } from '@/features/pwa/sw-source'
import { FIREBASE, stubPushBrowser, unstubPushBrowser } from '../push/support'
import { renderInbox } from './render-inbox'
import { apiError, inboxPage, listReads, newInboxApi, notification, stubInboxApi } from './support'

// `/account/notifications/` «اعلان‌ها» (dashboard digest §4): the inbox newest first, 20 at a
// time with «نمایش بیشتر», unread rows marked, the unread count, «علامت‌گذاری همه», the empty
// and failed states; web push's switch only for a shop that has it.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({ notify: mocks.notify, toastRegionReady: () => true }))

// sara's inbox (live): her own notification, unread, and a broadcast she has read.
const SHIPPED = notification(10002, {
  title: 'سفارش شما ارسال شد',
  body: 'مرسوله شما تحویل پست شد؛\nکد رهگیری در حساب کاربری قابل مشاهده است. <b>نه HTML</b>',
})
const FESTIVAL = notification(10001, { title: 'جشنواره پاییزی آغاز شد', is_read: true })
let api = newInboxApi([SHIPPED, FESTIVAL])

beforeEach(() => {
  vi.clearAllMocks()
  api = newInboxApi([SHIPPED, FESTIVAL])
  stubInboxApi(mocks.bffFetch, api)
})

afterEach(() => {
  unstubPushBrowser()
  window.history.replaceState(null, '', '/')
})

const MARK_ALL = 'علامت‌گذاری همه به‌عنوان خوانده‌شده'
const rowButton = (title: string) => screen.getByRole('button', { name: new RegExp(`^${title}`) })

describe('NotificationsPage', () => {
  it('lists the inbox: unread ones marked for sight and for screen readers, the count above', async () => {
    renderInbox()
    expect(screen.getByRole('heading', { level: 1, name: 'اعلان‌ها' })).toBeVisible()
    const list = await screen.findByRole('list', { name: 'اعلان‌ها' })
    const rows = within(list).getAllByRole('article')
    expect(rows).toHaveLength(2)
    expect(rowButton('سفارش شما ارسال شد')).toHaveAccessibleName('سفارش شما ارسال شد خوانده‌نشده')
    expect(rowButton('جشنواره پاییزی آغاز شد')).toHaveAccessibleName('جشنواره پاییزی آغاز شد')
    expect(rowButton('سفارش شما ارسال شد')).toHaveAttribute('aria-expanded', 'false')
    expect(within(rows[0]!).getByText(/شهریور ۱۴۰۵/)).toBeVisible()
    // The text as plain text, its line break kept.
    const text = within(rows[0]!).getByText(/مرسوله شما تحویل پست شد/)
    expect(text).toHaveTextContent('<b>نه HTML</b>')
    expect(text).toHaveClass('whitespace-pre-line', 'line-clamp-2')
    expect(await screen.findByText('۱ اعلان خوانده‌نشده')).toBeVisible()
    expect(listReads(mocks.bffFetch)).toEqual([
      'notification/list/?limit=20',
      'notification/list/?limit=100',
    ])
  })

  it('«نمایش بیشتر» reads the next 20', async () => {
    api.list = (query) =>
      query.limit === 100
        ? inboxPage([SHIPPED], { size: 100 })
        : query.page === 2
          ? inboxPage([notification(3)], { page: 2, totalPages: 2, count: 21 })
          : inboxPage([SHIPPED, FESTIVAL], { totalPages: 2, count: 21 })
    const { user } = renderInbox()
    await user.click(await screen.findByRole('button', { name: 'نمایش بیشتر' }))
    expect(await screen.findByRole('button', { name: /^اعلان ۳/ })).toBeVisible()
    expect(listReads(mocks.bffFetch)).toContain('notification/list/?page=2&limit=20')
    expect(screen.queryByRole('button', { name: 'نمایش بیشتر' })).toBeNull()
  })

  it('nothing at all: «اعلانی ندارید», and nothing to mark', async () => {
    api = newInboxApi([])
    stubInboxApi(mocks.bffFetch, api)
    renderInbox()
    expect(await screen.findByRole('heading', { name: 'اعلانی ندارید' })).toBeVisible()
    await waitFor(() => expect(screen.getByRole('button', { name: MARK_ALL })).toBeDisabled())
    expect(screen.queryByText('همهٔ اعلان‌ها خوانده شده است.')).toBeNull()
  })

  it('a failed read: «تلاش دوباره» reads it again', async () => {
    let fail = true
    api.list = (query) =>
      fail && query.limit === 20 ? apiError(500, 'server_error') : inboxPage([SHIPPED, FESTIVAL])
    const { user } = renderInbox()
    expect(await screen.findByText('اعلان‌ها بارگذاری نشد.')).toBeVisible()
    fail = false
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findAllByRole('article')).toHaveLength(2)
  })

  it('a session that is gone: login replaces the page, with it as next', async () => {
    window.history.replaceState(null, '', '/account/notifications/')
    api.list = () => apiError(401, 'not_authenticated')
    renderInbox()
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith('/login/?next=/account/notifications/'),
    )
    expect(screen.queryByText('اعلان‌ها بارگذاری نشد.')).toBeNull()
  })

  it('«علامت‌گذاری همه» shows how far it has gone, then everything reads as read', async () => {
    let answer: () => void = () => {}
    api.read.mockImplementationOnce(
      () => new Promise((resolve) => (answer = () => resolve({ data: {}, status: 200 }))),
    )
    const { user } = renderInbox()
    const button = await screen.findByRole('button', { name: MARK_ALL })
    await waitFor(() => expect(button).toBeEnabled())
    await user.click(button)
    expect(await screen.findByText('۰ از ۱ اعلان خوانده شد.')).toBeVisible()
    expect(screen.getByRole('button', { name: /علامت‌گذاری همه/ })).toHaveAttribute(
      'aria-busy',
      'true',
    )
    api.list = () => inboxPage([{ ...SHIPPED, is_read: true }, FESTIVAL])
    act(() => answer())
    expect(await screen.findByText('همهٔ اعلان‌ها خوانده شده است.')).toBeVisible()
    expect(rowButton('سفارش شما ارسال شد')).toHaveAccessibleName('سفارش شما ارسال شد')
  })

  it('the worker’s word after a click on a notification: the inbox reads itself again', async () => {
    const browser = stubPushBrowser()
    renderInbox()
    await screen.findAllByRole('article')
    const before = listReads(mocks.bffFetch).length
    act(() => browser.postFromWorker({ type: REFRESH_MESSAGE }))
    await waitFor(() => expect(listReads(mocks.bffFetch).length).toBeGreaterThan(before))
  })

  it('web push’s switch only for a shop that has it', async () => {
    const { unmount } = renderInbox()
    await screen.findAllByRole('article')
    expect(screen.queryByRole('switch')).toBeNull()
    unmount()
    stubPushBrowser()
    renderInbox({ firebase: FIREBASE })
    expect(await screen.findByRole('switch', { name: 'دریافت اعلان در مرورگر' })).toBeVisible()
  })
})
