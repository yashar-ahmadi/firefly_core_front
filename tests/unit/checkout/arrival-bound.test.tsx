import { act, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadBody } from '@/features/checkout/lazy-steps'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { setup } from './checkout-hook-support'
import { address, addressCart, noDestinationCart } from './fixtures'
import { calls, ok, renderCheckout, signedInCart } from './place-support'

// The checkout's arrival, bounded (Plan 5 Task 9, carried from Task 8's re-review). The page
// stays on its skeleton while the choices made on arrival are made (first-visit.test.tsx), but
// a choice that hangs (a read or a write the API does not answer) held it there until the
// server's timeouts: 10 s a try, a lost read tried three times, about 33 s. Now, after about 3 s,
// the skeleton says what is going on (politely, in its own live region, over its own blocks);
// after about 8 s (before a write's own 10 s) the steps show, each with its own skeleton or the
// shopper's way out (the address picker). The reads that feed the choices are tried twice at
// most. The bodies' code is in beforehand (their chunks load by real I/O, not by the fake clock).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

const PREPARING = 'در حال آماده\u{200C}سازی سفارش…'
const book = () => ({ count: 1, total_pages: 1, results: [address()] })
const lost = () => Promise.reject(new ApiError({ status: 0, code: 'network', detail: 'قطع.' }))
const never = () => new Promise(() => {})
/** The fake clock moved on, with every promise and React update it lets through. */
const after = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
const skeleton = () => screen.queryByRole('status', { name: 'در حال بارگذاری' })

beforeAll(async () => {
  await Promise.all(
    ['receiver', 'shipping', 'review'].map((step) => loadBody(step as never, true, true)),
  )
})
beforeEach(() => {
  vi.useFakeTimers()
  mocks.bffFetch.mockReset()
})
afterEach(() => vi.useRealTimers())

describe('the checkout’s arrival, a choice that hangs', () => {
  it('the default address’s write unanswered: named after 3 s, the steps (the picker) after 8 s', async () => {
    mocks.bffFetch.mockImplementation((path: string) => {
      if (path === 'cart/') return Promise.resolve(ok(noDestinationCart()))
      if (path === 'account/address/list/') return Promise.resolve(ok(book()))
      return never()
    })
    renderCheckout({ cart: noDestinationCart(), hasSession: true })
    await after(0)
    expect(calls(mocks.bffFetch, 'cart/destination/')).toHaveLength(1)
    const waiting = skeleton()!
    expect(waiting).not.toHaveTextContent(PREPARING)

    await after(2_900)
    expect(waiting).not.toHaveTextContent(PREPARING)
    await after(100)
    // In the skeleton's own polite region, over its blocks: nothing moves.
    expect(waiting).toHaveTextContent(PREPARING)
    expect(within(waiting).getByText(PREPARING)).toHaveClass('absolute')
    expect(screen.queryByRole('region', { name: /گیرنده و آدرس/ })).toBeNull()

    await after(4_900)
    expect(screen.queryByRole('region', { name: /گیرنده و آدرس/ })).toBeNull()
    await after(100)
    // Before the write's own 10 s: the steps, the shopper free to choose an address meanwhile.
    expect(waiting).not.toBeInTheDocument()
    const receiver = screen.getByRole('region', { name: /گیرنده و آدرس/ })
    expect(within(receiver).getByRole('radiogroup', { name: 'آدرس ارسال' })).toBeInTheDocument()
  })

  it('the options read unanswered: the shipping step’s own named skeleton after 8 s', async () => {
    mocks.bffFetch.mockImplementation((path: string) =>
      path === 'cart/' ? Promise.resolve(ok(addressCart(address()))) : never(),
    )
    renderCheckout({ cart: addressCart(address()), hasSession: true })
    await after(7_900)
    expect(skeleton()).toHaveTextContent(PREPARING)
    await after(100)
    const shipping = screen.getByRole('region', { name: /روش ارسال/ })
    expect(
      within(shipping).getByRole('status', { name: 'در حال انتخاب روش ارسال پیش\u{200C}فرض' }),
    ).toBeInTheDocument()
  })

  it('arrived in time: no named wait, nothing more after 8 s', async () => {
    mocks.bffFetch.mockImplementation((path: string) => {
      if (path === 'cart/') return Promise.resolve(ok(noDestinationCart()))
      if (path === 'account/address/list/') return Promise.resolve(ok(book()))
      // Its address and the shipping chosen with it: the review is the step.
      if (path === 'cart/destination/') return Promise.resolve(ok(signedInCart()))
      return never()
    })
    renderCheckout({ cart: noDestinationCart(), hasSession: true })
    await after(1_000)
    expect(skeleton()).toBeNull()
    expect(screen.queryByText(PREPARING)).toBeNull()
    await after(10_000)
    expect(screen.queryByText(PREPARING)).toBeNull()
  })
})

describe('the reads the automatic choices wait for', () => {
  // The checkout's own hooks (no picker mounted: its own read of the book would add its own).
  it('the address book: a lost read is tried once more, not twice', async () => {
    mocks.bffFetch.mockImplementation((path: string) => {
      if (path === 'cart/') return Promise.resolve(ok(noDestinationCart()))
      if (path === 'account/address/list/') return lost()
      return never()
    })
    setup(noDestinationCart(), true)
    await after(30_000)
    expect(calls(mocks.bffFetch, 'account/address/list/')).toHaveLength(2)
  })

  it('the shipping options: a lost read is tried once more, not twice', async () => {
    mocks.bffFetch.mockImplementation((path: string) => {
      if (path === 'cart/') return Promise.resolve(ok(addressCart(address())))
      if (path === 'cart/shipping/option/list/') return lost()
      return never()
    })
    setup(addressCart(address()), true)
    await after(30_000)
    expect(calls(mocks.bffFetch, 'cart/shipping/option/list/')).toHaveLength(2)
  })

  it('a refused read (4xx) is not tried again; a switched-off feature neither', async () => {
    const refused = [
      new ApiError({ status: 400, code: 'bad_request', detail: 'خطا.' }),
      new ApiError({ status: 503, code: 'feature_disabled', detail: 'خاموش.' }),
    ]
    for (const error of refused) {
      mocks.bffFetch.mockReset()
      mocks.bffFetch.mockImplementation((path: string) => {
        if (path === 'cart/') return Promise.resolve(ok(addressCart(address())))
        if (path === 'cart/shipping/option/list/') return Promise.reject(error)
        return never()
      })
      const { unmount } = setup(addressCart(address()), true)
      await after(30_000)
      expect(calls(mocks.bffFetch, 'cart/shipping/option/list/'), error.code).toHaveLength(1)
      unmount()
    }
  })
})
