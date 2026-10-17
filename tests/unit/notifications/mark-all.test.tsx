import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { progressText } from '@/features/notifications/mark-all-button'
import { NOTIFICATIONS_KEY } from '@/features/notifications/notifications-api'
import type { Inbox } from '@/features/notifications/notifications-cache'
import { UNREAD_NOTIFICATIONS_KEY } from '@/features/notifications/unread'
import { ALL_READ, useMarkAll } from '@/features/notifications/use-mark-all'
import { THROTTLED_MESSAGE } from '@/features/account/lists/list-error'
import { clientProviders } from '../support/providers'
import { apiError, inboxPage, newInboxApi, notification, readIds, stubInboxApi } from './support'

// «علامت‌گذاری همه به‌عنوان خوانده‌شده» (no mark-all endpoint, digest §4.2): the unread ids read
// from every page, then one read request each, in turn; rows and the count change as it goes.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({ notify: mocks.notify, toastRegionReady: () => true }))

// Five notifications, 2 and 4 read already: 1, 3 and 5 are unread.
const ROWS = [1, 2, 3, 4, 5].map((id) => notification(id, { is_read: id % 2 === 0 }))
let api = newInboxApi(ROWS)

beforeEach(() => {
  vi.clearAllMocks()
  api = newInboxApi(ROWS)
  stubInboxApi(mocks.bffFetch, api)
})

function markAll() {
  const providers = clientProviders({ hasSession: true })
  // The inbox on screen (its first page) and the count it found.
  providers.client.setQueryData<Inbox>(NOTIFICATIONS_KEY, {
    pages: [inboxPage(ROWS)],
    pageParams: [1],
  })
  providers.client.setQueryData(UNREAD_NOTIFICATIONS_KEY, 3)
  const hook = renderHook(useMarkAll, { wrapper: providers.wrapper })
  return { ...hook, client: providers.client }
}

const unreadRows = (client: ReturnType<typeof markAll>['client']) =>
  client
    .getQueryData<Inbox>(NOTIFICATIONS_KEY)!
    .pages.flatMap((page) => page.results.filter((row) => !row.is_read).map((row) => row.id))

describe('useMarkAll', () => {
  it('marks every unread id read, once each, one request after the other', async () => {
    const answers: (() => void)[] = []
    api.read.mockImplementation(
      () => new Promise((resolve) => answers.push(() => resolve({ data: {}, status: 200 }))),
    )
    const { result, client } = markAll()
    act(() => result.current.start())
    await waitFor(() => expect(readIds(api)).toEqual([1]))
    expect(result.current.state).toMatchObject({ phase: 'running', done: 0, total: 3 })
    // The next request waits for this one.
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(readIds(api)).toEqual([1])
    await act(async () => answers.shift()!())
    await waitFor(() => expect(readIds(api)).toEqual([1, 3]))
    expect(result.current.state.done).toBe(1)
    expect(progressText(result.current.state)).toBe('۱ از ۳')
    expect(unreadRows(client)).toEqual([3, 5])
    expect(client.getQueryData(UNREAD_NOTIFICATIONS_KEY)).toBe(2)
    await act(async () => answers.shift()!())
    await waitFor(() => expect(readIds(api)).toEqual([1, 3, 5]))
    await act(async () => answers.shift()!())
    await waitFor(() => expect(result.current.state.phase).toBe('idle'))
    expect(api.read).toHaveBeenCalledTimes(3)
    expect(unreadRows(client)).toEqual([])
    expect(mocks.notify.success).toHaveBeenCalledWith(ALL_READ)
  })

  it('reads the unread ids from every page, not only the inbox’s pages on screen', async () => {
    api.list = (query) =>
      query.page === 2
        ? inboxPage([notification(150), notification(151, { is_read: true })], {
            page: 2,
            totalPages: 2,
            size: 100,
          })
        : inboxPage(ROWS, { totalPages: 2, size: 100 })
    const { result } = markAll()
    act(() => result.current.start())
    await waitFor(() => expect(result.current.state.phase).toBe('idle'))
    expect(readIds(api)).toEqual([1, 3, 5, 150])
  })

  it('a 429 waits out retry_after, then goes on with the same notification', async () => {
    vi.useFakeTimers()
    try {
      api.read.mockRejectedValueOnce(apiError(429, 'throttled', { retry_after: 3 }))
      const { result } = markAll()
      act(() => result.current.start())
      await act(() => vi.advanceTimersByTimeAsync(10))
      expect(result.current.state.phase).toBe('waiting')
      expect(readIds(api)).toEqual([1])
      await act(() => vi.advanceTimersByTimeAsync(2_900))
      expect(readIds(api)).toEqual([1])
      await act(() => vi.advanceTimersByTimeAsync(200))
      expect(readIds(api)).toEqual([1, 1, 3, 5])
      expect(result.current.state.phase).toBe('idle')
    } finally {
      vi.useRealTimers()
    }
  })

  it('a 429 longer than a minute: stops and says why', async () => {
    api.read.mockRejectedValueOnce(apiError(429, 'throttled', { retry_after: 600 }))
    const { result } = markAll()
    act(() => result.current.start())
    await waitFor(() => expect(result.current.state.phase).toBe('failed'))
    expect(result.current.state.failure).toBe(THROTTLED_MESSAGE)
    expect(readIds(api)).toEqual([1])
  })

  it('a notification gone meanwhile (404) leaves the inbox; the rest go on', async () => {
    api.read.mockRejectedValueOnce(apiError(404, 'not_found'))
    const { result, client } = markAll()
    act(() => result.current.start())
    await waitFor(() => expect(result.current.state.phase).toBe('idle'))
    expect(readIds(api)).toEqual([1, 3, 5])
    expect(mocks.notify.error).not.toHaveBeenCalled()
    const ids = client
      .getQueryData<Inbox>(NOTIFICATIONS_KEY)!
      .pages[0]!.results.map((row) => row.id)
    expect(ids).toEqual([2, 3, 4, 5])
  })

  it('a session that is gone: login, nothing more is sent', async () => {
    api.read.mockRejectedValueOnce(apiError(401, 'not_authenticated'))
    const { result } = markAll()
    act(() => result.current.start())
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalled())
    expect(readIds(api)).toEqual([1])
  })

  it('leaving the page stops it', async () => {
    let answer: () => void = () => {}
    api.read.mockImplementationOnce(
      () => new Promise((resolve) => (answer = () => resolve({ data: {}, status: 200 }))),
    )
    const { result, unmount } = markAll()
    act(() => result.current.start())
    await waitFor(() => expect(readIds(api)).toEqual([1]))
    unmount()
    answer()
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(readIds(api)).toEqual([1])
  })
})
