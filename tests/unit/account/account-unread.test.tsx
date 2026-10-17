import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountShell } from '@/features/account/layout/account-shell'
import { UNREAD_POLL_MS } from '@/features/notifications/use-notifications'
import { SARA } from '../auth/fixtures'
import { authProviders } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { inboxPage, LIST, notification } from '../notifications/support'
import { ok, summary } from './fixtures'

// The unread count on every account page (controller ruling, Plan 3 final review): the account
// shell counts it (the API has no unread endpoint: a capped scan of the list), so the
// navigation's «اعلان‌ها» badge and the header's dot show it without a visit to the inbox. Read
// again every 5 minutes while the tab is in view; the inbox shares the same query.

const mocks = vi.hoisted(() => ({ pathname: '/account/orders/', bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

const ROWS = [notification(1), notification(2, { is_read: true }), notification(3)]

beforeEach(() => {
  stubBrowserApis()
  vi.clearAllMocks()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  document.cookie = 'ff_auth=1; path=/'
  mocks.bffFetch.mockImplementation(async (path: string) => {
    if (path === 'dashboard/summary/') return ok(summary())
    if (path === 'account/profile/me/') return ok(SARA)
    if (path === LIST) return ok(inboxPage(ROWS, { size: 100 }))
    throw new Error(`unexpected ${path}`)
  })
})

afterEach(() => {
  vi.useRealTimers()
  document.cookie = 'ff_auth=; max-age=0; path=/'
})

const counts = () => mocks.bffFetch.mock.calls.filter(([path]) => path === LIST).length

function renderShell() {
  render(
    <AccountShell>
      <h1>سفارش‌ها</h1>
    </AccountShell>,
    { wrapper: authProviders({ hasSession: true }).wrapper },
  )
}

describe('the unread count in the account area', () => {
  it('shows on «اعلان‌ها» on any account page, without a visit to the inbox', async () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: 'حساب کاربری' })
    expect(
      await within(nav).findByRole('link', { name: 'اعلان‌ها، ۲ اعلان خوانده‌نشده' }),
    ).toBeVisible()
    expect(counts()).toBe(1)
  })

  it('is read again every 5 minutes while the tab is in view, never while hidden', async () => {
    renderShell()
    await vi.waitFor(() => expect(counts()).toBe(1))
    await act(() => vi.advanceTimersByTimeAsync(UNREAD_POLL_MS))
    await vi.waitFor(() => expect(counts()).toBe(2))
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    try {
      await act(() => vi.advanceTimersByTimeAsync(UNREAD_POLL_MS * 2))
      expect(counts()).toBe(2)
    } finally {
      hidden.mockRestore()
    }
  })

  it('the inbox inside the shell shares the count: one scan, not two', async () => {
    mocks.pathname = '/account/notifications/'
    const { NotificationsPage } = await import('@/features/notifications/notifications-page')
    render(
      <AccountShell>
        <NotificationsPage title="اعلان‌ها" />
      </AccountShell>,
      { wrapper: authProviders({ hasSession: true }).wrapper },
    )
    // The inbox's «علامت‌گذاری همه» waits for the count: on once it is in.
    await vi.waitFor(() =>
      expect(screen.getByRole('button', { name: /علامت‌گذاری همه/ })).toBeEnabled(),
    )
    const scans = mocks.bffFetch.mock.calls.filter(
      ([path, options]) => path === LIST && options?.query?.limit === 100,
    )
    expect(scans).toHaveLength(1)
  })
})
