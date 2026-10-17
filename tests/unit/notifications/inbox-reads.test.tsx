import { act, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MARK_ALL } from '@/features/notifications/mark-all-button'
import { NOTIFICATIONS_KEY } from '@/features/notifications/notifications-api'
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

  it.each([
    ['answered before the page lands', true],
    ['still on its way when the page lands', false],
  ])(
    '«نمایش بیشتر»’s page on its way still lands, and a row opened meanwhile stays read (its read %s)',
    async (_label, answeredFirst) => {
      const second = deferred<ReturnType<typeof inboxPage>>()
      const read = deferred<unknown>()
      if (!answeredFirst) api.read.mockReturnValueOnce(read.promise)
      api.list = (query) =>
        query.limit === 100
          ? inboxPage([SHIPPED], { size: 100 })
          : query.page === 2
            ? second.promise
            : inboxPage([SHIPPED, FESTIVAL], { totalPages: 2, count: 21 })
      const { user } = renderInbox()
      await screen.findByText('۱ اعلان خوانده‌نشده')
      await user.click(await screen.findByRole('button', { name: 'نمایش بیشتر' }))
      await user.click(await shipped())
      await waitFor(() => expect(readIds(api)).toEqual([10002]))
      // The page left with the pages as they were before the read: it must not put the row back.
      const third = notification(3, { is_read: true })
      act(() => second.resolve(inboxPage([third], { page: 2, totalPages: 2, count: 21 })))
      expect(await screen.findByRole('button', { name: 'اعلان ۳' })).toBeVisible()
      act(() => read.resolve({ data: {}, status: 200 }))
      await waitFor(() => expect(readIds(api)).toEqual([10002]))
      expect(await shipped()).toHaveAccessibleName('سفارش شما ارسال شد')
      expect(screen.getByText('همهٔ اعلان‌ها خوانده شده است.')).toBeVisible()
      // Closed and opened again: read, so nothing more is sent.
      await user.click(await shipped())
      await user.click(await shipped())
      expect(readIds(api)).toEqual([10002])
    },
  )

  it('a 404 while «نمایش بیشتر»’s page is on its way: the page lands, the row stays out', async () => {
    const second = deferred<ReturnType<typeof inboxPage>>()
    const third = notification(3, { is_read: true })
    // The shop deleted it: once its read answered 404, the list has no such row.
    let gone = false
    api.read.mockImplementationOnce(async () => {
      gone = true
      throw apiError(404, 'not_found')
    })
    let secondReads = 0
    api.list = (query) => {
      const first = gone ? [FESTIVAL] : [SHIPPED, FESTIVAL]
      if (query.limit === 100) return inboxPage(gone ? [] : [SHIPPED], { size: 100 })
      if (query.page !== 2) return inboxPage(first, { totalPages: 2, count: 21 })
      secondReads += 1
      return secondReads === 1 ? second.promise : inboxPage([third], { page: 2, totalPages: 2 })
    }
    const { user } = renderInbox()
    await screen.findByText('۱ اعلان خوانده‌نشده')
    await user.click(await screen.findByRole('button', { name: 'نمایش بیشتر' }))
    await user.click(await shipped())
    await waitFor(() => expect(screen.queryByRole('button', { name: /^سفارش شما/ })).toBeNull())
    act(() => second.resolve(inboxPage([third], { page: 2, totalPages: 2, count: 21 })))
    expect(await screen.findByRole('button', { name: 'اعلان ۳' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /^سفارش شما/ })).toBeNull()
    // Read again once the page landed: both pages, so «نمایش بیشتر»’s is not lost.
    await waitFor(() => expect(secondReads).toBe(2))
    expect(screen.getByRole('button', { name: 'اعلان ۳' })).toBeVisible()
  })

  it('«علامت‌گذاری همه» while «نمایش بیشتر»’s page is on its way: the rows it marked stay read', async () => {
    const second = deferred<ReturnType<typeof inboxPage>>()
    const again = deferred<ReturnType<typeof inboxPage>>()
    const third = notification(3, { is_read: true })
    let [firstReads, secondReads] = [0, 0]
    api.list = (query) => {
      const unread = readIds(api).length === 0 ? [SHIPPED] : []
      if (query.limit === 100) return inboxPage(unread, { size: 100 })
      if (query.page === 2) {
        secondReads += 1
        return secondReads === 1 ? second.promise : inboxPage([third], { page: 2, totalPages: 2 })
      }
      firstReads += 1
      // The read again at the end is held: the rows must not wait for it.
      return firstReads === 1 ? inboxPage([SHIPPED, FESTIVAL], { totalPages: 2 }) : again.promise
    }
    const { user } = renderInbox()
    await screen.findByText('۱ اعلان خوانده‌نشده')
    await user.click(await screen.findByRole('button', { name: 'نمایش بیشتر' }))
    await user.click(screen.getByRole('button', { name: MARK_ALL }))
    await waitFor(() => expect(readIds(api)).toEqual([10002]))
    await waitFor(() => expect(screen.getByText('همهٔ اعلان‌ها خوانده شده است.')).toBeVisible())
    act(() => second.resolve(inboxPage([third], { page: 2, totalPages: 2 })))
    expect(await screen.findByRole('button', { name: 'اعلان ۳' })).toBeVisible()
    expect(await shipped()).toHaveAccessibleName('سفارش شما ارسال شد')
    act(() => again.resolve(inboxPage(READ_NOW, { totalPages: 2 })))
    await waitFor(() => expect(secondReads).toBe(2))
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
