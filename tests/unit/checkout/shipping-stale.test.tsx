import { act, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import type { Cart } from '@/lib/api/types/cart'
import { stubBrowserApis } from '../support/dom-stubs'
import { tehranOptions } from './fixtures'
import { chosen, ok, OPTIONS, renderSection } from './shipping-support'

// A choice the API can no longer price (`shipping.is_selected && !is_available`, cart digest
// §6.8): its reason is on screen and read out politely, once per reason. The cart read again
// with the same stale choice says nothing more; a new reason is read out; a choice the API can
// price again is not stale.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), announce: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/components/ui/live-announcer', () => ({
  announce: mocks.announce,
  LiveAnnouncer: () => null,
}))

stubBrowserApis()

const REASON = 'این روش ارسال برای این مقصد فعال نیست.'
const stale = (reason: string | null = REASON) =>
  chosen({ is_available: false, reason, cash_on_delivery: false })
const staleSentence = (reason: string) =>
  `روش ارسال «پیک موتوری تهران» دیگر در دسترس نیست: ${reason} روش دیگری انتخاب کنید.`

/** The announcements of a stale choice (not the options read or a choice made). */
const staleAnnouncements = () =>
  mocks.announce.mock.calls.map(([text]) => text).filter((text) => text.includes('دیگر در دسترس'))

/** The cart the API answers (`cart/` read again on mount): the one the test put last. */
let served: Cart
function serve(cart: Cart) {
  served = cart
  mocks.bffFetch.mockImplementation((path: string) => {
    if (path === 'cart/') return Promise.resolve(ok(served))
    if (path === OPTIONS) return Promise.resolve(ok(tehranOptions()))
    return new Promise(() => {})
  })
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.announce.mockReset()
})

describe('ShippingSection’s stale choice', () => {
  it('shows its reason and reads it out once, again only when the reason changes', async () => {
    serve(stale())
    const { client } = renderSection(stale())
    const put = (cart: Cart) => {
      served = cart
      client.setQueryData(CART_KEY, cart)
    }
    expect(await screen.findByText(staleSentence(REASON))).toBeInTheDocument()
    expect(staleAnnouncements()).toEqual([staleSentence(REASON)])

    // The cart read again, the same stale choice in a new object: nothing more is said.
    await act(async () => put(stale()))
    expect(staleAnnouncements()).toHaveLength(1)

    const other = 'ظرفیت ارسال امروز تکمیل شده است.'
    await act(async () => put(stale(other)))
    await waitFor(() => expect(screen.getByText(staleSentence(other))).toBeInTheDocument())
    expect(staleAnnouncements()).toEqual([staleSentence(REASON), staleSentence(other)])

    // Priced again: not stale; nothing is said.
    await act(async () => put(chosen({ cash_on_delivery: false })))
    await waitFor(() => expect(screen.queryByText(/دیگر در دسترس نیست/)).not.toBeInTheDocument())
    expect(staleAnnouncements()).toHaveLength(2)
  })

  it('without a reason, it still says the choice is gone', async () => {
    serve(stale(null))
    renderSection(stale(null))
    const sentence = 'روش ارسال «پیک موتوری تهران» دیگر در دسترس نیست. روش دیگری انتخاب کنید.'
    expect(await screen.findByText(sentence)).toBeInTheDocument()
    expect(staleAnnouncements()).toEqual([sentence])
  })
})
