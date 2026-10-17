import { act, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTIFICATIONS_KEY } from '@/features/notifications/notifications-api'
import { renderInbox } from './render-inbox'
import {
  deferred,
  inboxPage,
  listReads,
  newInboxApi,
  notification,
  readIds,
  stubInboxApi,
} from './support'

// Opening a row writes the read at once on screen; a read of the inbox or the count already on
// its way could put the row back. Such a read is stopped and runs again once the write settled,
// except what cannot be stopped without loss: the count's first read (it would be left with
// nothing until the next poll) and «نمایش بیشتر»'s page (it would be dropped).

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({ notify: mocks.notify, toastRegionReady: () => true }))

const SHIPPED = notification(10002, { title: 'سفارش شما ارسال شد' })
const FESTIVAL = notification(10001, { title: 'جشنواره پاییزی آغاز شد', is_read: true })
const READ_NOW = [{ ...SHIPPED, is_read: true }, FESTIVAL]
let api = newInboxApi([SHIPPED, FESTIVAL])

beforeEach(() => {
  vi.clearAllMocks()
  api = newInboxApi([SHIPPED, FESTIVAL])
  stubInboxApi(mocks.bffFetch, api)
})

const shipped = () => screen.findByRole('button', { name: /^سفارش شما ارسال شد/ })
const pageReads = () => listReads(mocks.bffFetch).filter((url) => url.includes('limit=20'))

describe('a read written while the inbox is being read', () => {
  it('the count’s first read on its way still ends in a count, read again after the write', async () => {
    const first = deferred<ReturnType<typeof inboxPage>>()
    let scans = 0
    api.list = (query) => {
      if (query.limit !== 100) return inboxPage([SHIPPED, FESTIVAL])
      scans += 1
      return scans === 1 ? first.promise : inboxPage(READ_NOW, { size: 100 })
    }
    const { user } = renderInbox()
    await user.click(await shipped())
    await waitFor(() => expect(readIds(api)).toEqual([10002]))
    act(() => first.resolve(inboxPage([SHIPPED, FESTIVAL], { size: 100 })))
    expect(await screen.findByText('همهٔ اعلان‌ها خوانده شده است.')).toBeVisible()
  })

  it('«نمایش بیشتر»’s page on its way still lands', async () => {
    const second = deferred<ReturnType<typeof inboxPage>>()
    api.list = (query) =>
      query.limit === 100
        ? inboxPage([SHIPPED], { size: 100 })
        : query.page === 2
          ? second.promise
          : inboxPage([SHIPPED, FESTIVAL], { totalPages: 2, count: 21 })
    const { user } = renderInbox()
    await user.click(await screen.findByRole('button', { name: 'نمایش بیشتر' }))
    await user.click(await shipped())
    await waitFor(() => expect(readIds(api)).toEqual([10002]))
    act(() => second.resolve(inboxPage([notification(3)], { page: 2, totalPages: 2, count: 21 })))
    expect(await screen.findByRole('button', { name: /^اعلان ۳/ })).toBeVisible()
  })

  it('a read of the inbox on its way is stopped, and runs again once the write settled', async () => {
    const { user, client } = renderInbox()
    const button = await shipped()
    const held = deferred<ReturnType<typeof inboxPage>>()
    api.list = (query) => (query.limit === 100 ? inboxPage(READ_NOW, { size: 100 }) : held.promise)
    act(() => void client.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }))
    await waitFor(() => expect(pageReads()).toHaveLength(2))
    api.list = (query) => inboxPage(READ_NOW, { size: query.limit === 100 ? 100 : 20 })
    await user.click(button)
    await waitFor(() => expect(pageReads()).toHaveLength(3))
    // The answer from before the write never puts the row back as unread.
    act(() => held.resolve(inboxPage([SHIPPED, FESTIVAL])))
    await waitFor(() => expect(button).toHaveAccessibleName('سفارش شما ارسال شد'))
  })
})
