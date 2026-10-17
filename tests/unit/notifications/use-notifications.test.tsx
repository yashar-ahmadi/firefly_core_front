import { focusManager } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SCAN_PAGE_CAP } from '@/features/notifications/notifications-api'
import { UNREAD_NOTIFICATIONS_KEY } from '@/features/notifications/unread'
import { UNREAD_POLL_MS, useUnreadCount } from '@/features/notifications/use-notifications'
import { clientProviders } from '../support/providers'
import { inboxPage, listReads, newInboxApi, notification, stubInboxApi } from './support'

// The unread count (dashboard digest §4.2: no unread endpoint): the list paged through with
// `limit=100` until `next` is null, `is_read: false` counted, under the key the header's menu and
// the account navigation read. At most 20 pages; read again every 5 minutes, never while hidden.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), router: { replace: vi.fn(), push: vi.fn() } }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

const rows = (from: number, count: number, read: (id: number) => boolean) =>
  Array.from({ length: count }, (_, index) =>
    notification(from + index, { is_read: read(from + index) }),
  )

let api = newInboxApi([])

beforeEach(() => {
  vi.clearAllMocks()
  api = newInboxApi([])
  stubInboxApi(mocks.bffFetch, api)
})

afterEach(() => {
  focusManager.setFocused(undefined)
  vi.useRealTimers()
})

function count() {
  const providers = clientProviders({ hasSession: true })
  return { ...renderHook(useUnreadCount, { wrapper: providers.wrapper }), client: providers.client }
}

describe('useUnreadCount', () => {
  it('sums the unread over every page, 100 at a time until `next` is null', async () => {
    // Page 1: 100 rows, the even ids read (50 unread); page 2: 30 rows, 3 unread.
    api.list = (query) =>
      query.page === 2
        ? inboxPage(
            rows(101, 30, (id) => id > 103),
            { page: 2, totalPages: 2, size: 100 },
          )
        : inboxPage(
            rows(1, 100, (id) => id % 2 === 0),
            { totalPages: 2, size: 100 },
          )
    const { result, client } = count()
    await waitFor(() => expect(result.current.data).toBe(53))
    expect(listReads(mocks.bffFetch)).toEqual([
      'notification/list/?limit=100',
      'notification/list/?page=2&limit=100',
    ])
    // Where the header's dot and the navigation's badge read it.
    expect(client.getQueryData(UNREAD_NOTIFICATIONS_KEY)).toBe(53)
  })

  it(`stops after ${SCAN_PAGE_CAP} pages (the visitor's own request budget)`, async () => {
    api.list = (query) =>
      inboxPage(
        rows(Number(query.page ?? 1) * 1000, 100, () => false),
        {
          page: Number(query.page ?? 1),
          totalPages: 50,
          size: 100,
        },
      )
    const { result } = count()
    await waitFor(() => expect(result.current.data).toBe(SCAN_PAGE_CAP * 100))
    expect(listReads(mocks.bffFetch)).toHaveLength(SCAN_PAGE_CAP)
  })

  it('reads again every 5 minutes while the tab is in view, never while it is hidden', async () => {
    vi.useFakeTimers()
    api.list = () => inboxPage([notification(1)], { size: 100 })
    const { result } = count()
    await act(() => vi.advanceTimersByTimeAsync(10))
    expect(result.current.data).toBe(1)
    const reads = () => listReads(mocks.bffFetch).length
    expect(reads()).toBe(1)
    await act(() => vi.advanceTimersByTimeAsync(UNREAD_POLL_MS))
    expect(reads()).toBe(2)
    act(() => focusManager.setFocused(false))
    await act(() => vi.advanceTimersByTimeAsync(UNREAD_POLL_MS * 3))
    expect(reads()).toBe(2)
    act(() => focusManager.setFocused(true))
    await act(() => vi.advanceTimersByTimeAsync(UNREAD_POLL_MS))
    expect(reads()).toBe(3)
  })

  it('asks nothing without a session', async () => {
    const providers = clientProviders({ hasSession: false })
    renderHook(useUnreadCount, { wrapper: providers.wrapper })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })
})
