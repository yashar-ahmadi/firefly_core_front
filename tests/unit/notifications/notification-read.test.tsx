import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNREAD_NOTIFICATIONS_KEY } from '@/features/notifications/unread'
import { renderInbox } from './render-inbox'
import {
  apiError,
  deferred,
  inboxPage,
  listReads,
  newInboxApi,
  notification,
  readIds,
  stubInboxApi,
} from './support'

// Opening a notification (a disclosure) shows all of it; an unread one is marked read
// (`POST notification/<id>/read/`) at once on screen, the count with it. A failure puts both
// back; a 404 (the shop deleted it) takes the row out and reads the inbox again.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({ notify: mocks.notify, toastRegionReady: () => true }))

const SHIPPED = notification(10002, {
  title: 'سفارش شما ارسال شد',
  image: 'http://localhost:8000/media/notification/parcel.jpg',
})
const FESTIVAL = notification(10001, { title: 'جشنواره پاییزی آغاز شد', is_read: true })
let api = newInboxApi([SHIPPED, FESTIVAL])

beforeEach(() => {
  vi.clearAllMocks()
  api = newInboxApi([SHIPPED, FESTIVAL])
  stubInboxApi(mocks.bffFetch, api)
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

const shipped = () => screen.getByRole('button', { name: /^سفارش شما ارسال شد/ })
const UNREAD_NAME = 'سفارش شما ارسال شد خوانده‌نشده'

/** The inbox with its count in. */
async function inbox() {
  const view = renderInbox()
  await screen.findByText('۱ اعلان خوانده‌نشده')
  return view
}

describe('opening a notification', () => {
  it('shows all of it and marks it read at once, before the API answers; once only', async () => {
    let answer: () => void = () => {}
    api.read.mockImplementationOnce(
      () => new Promise((resolve) => (answer = () => resolve({ data: {}, status: 200 }))),
    )
    const { user } = await inbox()
    const row = shipped().closest('article')!
    // The picture (decorative: alt="") only once it is open.
    expect(row.querySelector('img')).toBeNull()
    await user.click(shipped())
    expect(shipped()).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(shipped().getAttribute('aria-controls')!)).toBe(
      within(row).getByText(/متن اعلان/).parentElement,
    )
    expect(within(row).getByText(/متن اعلان/)).not.toHaveClass('line-clamp-2')
    expect(row.querySelector('img')).toHaveAttribute('alt', '')
    await waitFor(() => expect(shipped()).toHaveAccessibleName('سفارش شما ارسال شد'))
    expect(screen.getByText('همهٔ اعلان‌ها خوانده شده است.')).toBeVisible()
    expect(readIds(api)).toEqual([10002])
    act(() => answer())
    // Closed and opened again: nothing more is sent.
    await user.click(shipped())
    await user.click(shipped())
    expect(readIds(api)).toEqual([10002])
  })

  it('a read one sends nothing', async () => {
    const { user } = await inbox()
    await user.click(screen.getByRole('button', { name: 'جشنواره پاییزی آغاز شد' }))
    expect(screen.getByRole('button', { name: 'جشنواره پاییزی آغاز شد' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(readIds(api)).toEqual([])
  })

  it('a failure puts it back as unread, the count too, and says why', async () => {
    api.read.mockRejectedValueOnce(apiError(500, 'server_error'))
    const { user } = await inbox()
    await user.click(shipped())
    await waitFor(() => expect(mocks.notify.error).toHaveBeenCalledWith('پیام server_error'))
    expect(shipped()).toHaveAccessibleName(UNREAD_NAME)
    expect(screen.getByText('۱ اعلان خوانده‌نشده')).toBeVisible()
  })

  it('a 429: put back, with a calm word', async () => {
    api.read.mockRejectedValueOnce(apiError(429, 'throttled', { retry_after: 20 }))
    const { user } = await inbox()
    await user.click(shipped())
    await waitFor(() =>
      expect(mocks.notify.error).toHaveBeenCalledWith('لطفاً کمی بعد دوباره تلاش کنید.'),
    )
    expect(shipped()).toHaveAccessibleName(UNREAD_NAME)
  })

  it('a 404 (deleted by the shop): the row goes at once, and the inbox is read again', async () => {
    api.read.mockRejectedValueOnce(apiError(404, 'not_found'))
    const { user } = await inbox()
    const before = listReads(mocks.bffFetch).length
    // The read again is held back: the row must go before it answers.
    const held = deferred<ReturnType<typeof inboxPage>>()
    api.list = () => held.promise
    await user.click(shipped())
    await waitFor(() => expect(listReads(mocks.bffFetch).length).toBeGreaterThan(before))
    await waitFor(() => expect(screen.queryByRole('button', { name: /^سفارش شما/ })).toBeNull())
    expect(screen.getAllByRole('article')).toHaveLength(1)
    act(() => held.resolve(inboxPage([FESTIVAL])))
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(1))
    expect(mocks.notify.error).not.toHaveBeenCalled()
  })

  it('a 404 while the count is being read: the inbox and the count are read again once each', async () => {
    api.read.mockRejectedValueOnce(apiError(404, 'not_found'))
    const { user, client } = await inbox()
    const scans = () => listReads(mocks.bffFetch).filter((url) => url.includes('limit=100'))
    const pages = () => listReads(mocks.bffFetch).filter((url) => url.includes('limit=20'))
    // The count's poll is on its way when the row is opened (it is stopped, then read again).
    const poll = deferred<ReturnType<typeof inboxPage>>()
    api.list = (query) => (query.limit === 100 ? poll.promise : inboxPage([FESTIVAL]))
    act(() => void client.invalidateQueries({ queryKey: UNREAD_NOTIFICATIONS_KEY }))
    await waitFor(() => expect(scans()).toHaveLength(2))
    api.list = (query) => inboxPage([FESTIVAL], { size: Number(query.limit) })
    const [scansBefore, pagesBefore] = [scans().length, pages().length]
    await user.click(shipped())
    await waitFor(() => expect(screen.queryByRole('button', { name: /^سفارش شما/ })).toBeNull())
    await waitFor(() => expect(screen.getByText('همهٔ اعلان‌ها خوانده شده است.')).toBeVisible())
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(scans().length - scansBefore).toBe(1)
    expect(pages().length - pagesBefore).toBe(1)
  })

  it('a session that is gone: login, with the page as next', async () => {
    window.history.replaceState(null, '', '/account/notifications/')
    api.read.mockRejectedValueOnce(apiError(401, 'token_not_valid'))
    const { user } = await inbox()
    await user.click(shipped())
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith('/login/?next=/account/notifications/'),
    )
  })
})
