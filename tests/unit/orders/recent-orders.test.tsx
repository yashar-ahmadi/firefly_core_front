import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GUEST_ORDERS_KEY, readGuestOrders } from '@/features/orders/guest-orders'
import {
  codeField,
  fill,
  keepGuestOrder,
  mobileField,
  renderTrack,
  serve,
  submit,
  trackCalls,
  tracked,
} from './track-support'

// «سفارش‌های اخیر شما» (Plan 4 Global Constraints: the last 10 guest orders in `ff-guest-orders`):
// each with its code, date and total, for one-tap tracking. A tap fills the code in and asks for
// the mobile: the number is never kept on the device (a shared one), so it is typed every time.
// «حذف از این دستگاه» forgets one. Without storage, the page simply has no such list.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), announce: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/order/track/',
}))

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mocks.bffFetch.mockReset()
  mocks.announce.mockReset()
  serve(mocks.bffFetch)
})
afterEach(() => vi.restoreAllMocks())

const list = () => screen.getByRole('list', { name: 'سفارش‌های اخیر شما' })

describe('the recent guest orders of this device', () => {
  it('each with its code, its date and its total; newest first', async () => {
    keepGuestOrder({ orderCode: '1111111111', placedAt: '2026-10-10T10:00:00+03:30' })
    keepGuestOrder()
    await renderTrack()
    expect(screen.getByRole('heading', { name: 'سفارش‌های اخیر شما' })).toBeVisible()
    const rows = within(list()).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('۳۰۶۷۵۶۲۳۵۸')
    expect(rows[0]).toHaveTextContent('۲۶ مهر ۱۴۰۵')
    expect(rows[0]).toHaveTextContent('۵۳٬۷۹۰٬۰۰۰ تومان')
    expect(rows[1]).toHaveTextContent('۱۱۱۱۱۱۱۱۱۱')
  })

  it('an order this device kept over 30 days ago: not listed, and gone from the storage', async () => {
    keepGuestOrder()
    const [current] = JSON.parse(localStorage.getItem(GUEST_ORDERS_KEY)!) as object[]
    const old = { ...current, orderCode: '1111111111', savedAt: Date.now() - 31 * 86_400_000 }
    localStorage.setItem(GUEST_ORDERS_KEY, JSON.stringify([current, old]))
    await renderTrack()
    expect(within(list()).getAllByRole('listitem')).toHaveLength(1)
    expect(localStorage.getItem(GUEST_ORDERS_KEY)).not.toContain('1111111111')
  })

  it('an entry kept before totals were kept: no total, never one made up', async () => {
    keepGuestOrder({ total: undefined })
    await renderTrack()
    expect(within(list()).getByRole('listitem')).not.toHaveTextContent('تومان')
  })

  it('none kept: no such section', async () => {
    await renderTrack()
    expect(screen.queryByRole('heading', { name: 'سفارش‌های اخیر شما' })).toBeNull()
  })

  it('«پیگیری»: the code filled in, the mobile asked for (focused), nothing sent yet', async () => {
    const user = userEvent.setup()
    keepGuestOrder()
    await renderTrack()
    await user.click(within(list()).getByRole('button', { name: /پیگیری سفارش ۳۰۶۷۵۶۲۳۵۸/ }))
    expect(codeField()).toHaveValue('3067562358')
    expect(mobileField()).toHaveValue('')
    await waitFor(() => expect(mobileField()).toHaveFocus())
    expect(trackCalls(mocks.bffFetch)).toHaveLength(0)
  })

  it('«پیگیری» after a lookup: the order found before goes (not shown under another code)', async () => {
    const user = userEvent.setup()
    keepGuestOrder()
    await renderTrack()
    await fill(user)
    await user.click(submit())
    expect(await screen.findByRole('heading', { name: /سفارش ۲۵۸۳۹۷۳۸۷۷/ })).toBeVisible()
    await user.click(within(list()).getByRole('button', { name: /پیگیری سفارش ۳۰۶۷۵۶۲۳۵۸/ }))
    expect(codeField()).toHaveValue('3067562358')
    expect(screen.queryByRole('heading', { name: /سفارش ۲۵۸۳۹۷۳۸۷۷/ })).toBeNull()
    expect(trackCalls(mocks.bffFetch)).toHaveLength(1)
  })

  it('«پیگیری» while a lookup is on its way: it is aborted, its answer never shown', async () => {
    const user = userEvent.setup()
    let answer: (value: unknown) => void = () => {}
    serve(mocks.bffFetch, () => new Promise((resolve) => (answer = resolve)))
    keepGuestOrder()
    await renderTrack()
    await fill(user)
    await user.click(submit())
    await user.click(within(list()).getByRole('button', { name: /پیگیری سفارش ۳۰۶۷۵۶۲۳۵۸/ }))
    const [, init] = trackCalls(mocks.bffFetch)[0]!
    expect((init as { signal: AbortSignal }).signal.aborted).toBe(true)
    await act(async () => answer({ data: tracked('delivered'), msg: '', status: 200 }))
    expect(screen.queryByRole('heading', { name: /سفارش ۲۵۸۳۹۷۳۸۷۷/ })).toBeNull()
    expect(submit()).not.toHaveAttribute('aria-busy')
    // The next press looks the tapped order up.
    await user.clear(mobileField())
    await user.type(mobileField(), '09121234501')
    await user.click(submit())
    expect(trackCalls(mocks.bffFetch)).toHaveLength(2)
  })

  it('«حذف از این دستگاه» forgets that one order, says so, and keeps the focus in the list', async () => {
    const user = userEvent.setup()
    keepGuestOrder({ orderCode: '1111111111' })
    keepGuestOrder()
    await renderTrack()
    await user.click(within(list()).getByRole('button', { name: /حذف از این دستگاه.*۳۰۶۷۵۶۲۳۵۸/ }))
    expect(readGuestOrders().map((order) => order.orderCode)).toEqual(['1111111111'])
    expect(within(list()).getAllByRole('listitem')).toHaveLength(1)
    expect(mocks.announce).toHaveBeenCalledWith(expect.stringContaining('از این دستگاه حذف شد'))
    expect(list()).toContainElement(document.activeElement as HTMLElement)
  })

  it('the last one removed: the section goes, the focus to the form', async () => {
    const user = userEvent.setup()
    keepGuestOrder()
    await renderTrack()
    await user.click(within(list()).getByRole('button', { name: /از این دستگاه/ }))
    expect(screen.queryByRole('heading', { name: 'سفارش‌های اخیر شما' })).toBeNull()
    expect(localStorage.getItem(GUEST_ORDERS_KEY)).toBe('[]')
    await waitFor(() => expect(codeField()).toHaveFocus())
  })

  it('the mobile typed is never kept on the device', async () => {
    const user = userEvent.setup()
    keepGuestOrder()
    await renderTrack()
    await fill(user, { code: '3067562358', mobile: '09121234501' })
    await user.click(submit())
    await screen.findByRole('heading', { level: 2, name: /^سفارش\s[۰-۹]/ })
    const stored = [
      ...Object.keys(localStorage).map((key) => localStorage.getItem(key)),
      ...Object.keys(sessionStorage).map((key) => sessionStorage.getItem(key)),
    ].join('\n')
    expect(stored).not.toContain('09121234501')
    expect(stored).not.toContain('9121234501')
  })
})

describe('signed in', () => {
  it('«سفارش‌های من» is offered as the better place; a guest is not shown it', async () => {
    const { unmount } = await renderTrack({ hasSession: true })
    expect(screen.getByRole('link', { name: 'سفارش‌های من' })).toHaveAttribute(
      'href',
      '/account/orders/',
    )
    unmount()
    await renderTrack()
    expect(screen.queryByRole('link', { name: 'سفارش‌های من' })).toBeNull()
  })
})

describe('without storage', () => {
  it('a storage that refuses: no list, and the form works', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    await renderTrack()
    expect(screen.queryByRole('heading', { name: 'سفارش‌های اخیر شما' })).toBeNull()
    await fill(user)
    await user.click(submit())
    await act(async () => {})
    expect(trackCalls(mocks.bffFetch)).toHaveLength(1)
  })
})
