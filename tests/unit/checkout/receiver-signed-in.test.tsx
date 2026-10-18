import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { ApiError } from '@/lib/api/errors'
import type { Address } from '@/lib/api/types/cart'
import { stubBrowserApis } from '../support/dom-stubs'
import { address, addressCart, NEW_ADDRESS, noDestinationCart } from './fixtures'
import { destinations, renderSection, serve } from './receiver-support'

// «گیرنده و آدرس» signed in (cart digest §6.6, §7.4): the saved addresses as radios (the cart's
// own chosen, else the default chosen for the shopper), the address book's own sheet to add or
// edit one, an empty book opening it at once, and a throttled destination waiting its turn.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
// The address book's own sheet is tested on its own (tests/unit/account/address-sheet.test.tsx):
// here a stand-in that saves at once.
vi.mock('@/features/account/addresses/lazy-overlays', async () => {
  const { NEW_ADDRESS: saved } = await import('./fixtures')
  return {
    preloadAddressSheet: () => {},
    LazyAddressSheet: ({
      open,
      initial,
      onSaved,
    }: {
      open: boolean
      initial?: Address
      onSaved: (address: Address) => void
    }) =>
      open ? (
        <div role="dialog" aria-label={initial ? 'ویرایش آدرس' : 'افزودن آدرس جدید'}>
          <button type="button" onClick={() => onSaved(initial ?? saved)}>
            ذخیرهٔ آدرس
          </button>
        </div>
      ) : null,
  }
})

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  sessionStorage.clear()
})

describe('ReceiverSection, signed in', () => {
  const home = address()
  const work = address({ id: 10019, title: 'محل کار', is_default: false })

  it('lists the addresses as radios, the cart’s own chosen; another one is posted', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, addressCart(work), [home, work])
    renderSection(addressCart(work))
    const group = await screen.findByRole('radiogroup', { name: 'آدرس ارسال' })
    expect(within(group).getByRole('radio', { name: /محل کار/ })).toBeChecked()
    await user.click(within(group).getByRole('radio', { name: /خانه/ }))
    await waitFor(() => expect(destinations(mocks.bffFetch)).toEqual([{ address: home.id }]))
  })

  it('a cart without one gets the default (the first) for the shopper', async () => {
    serve(mocks.bffFetch, noDestinationCart(), [home, work])
    renderSection(noDestinationCart())
    await waitFor(() => expect(destinations(mocks.bffFetch)).toEqual([{ address: home.id }]))
  })

  it('«افزودن آدرس جدید» opens the address sheet; the saved address becomes the destination', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, addressCart(home), [home])
    renderSection(addressCart(home))
    await user.click(await screen.findByRole('button', { name: 'افزودن آدرس جدید' }))
    const sheet = screen.getByRole('dialog', { name: 'افزودن آدرس جدید' })
    await user.click(within(sheet).getByRole('button', { name: 'ذخیرهٔ آدرس' }))
    await waitFor(() => expect(destinations(mocks.bffFetch)).toEqual([{ address: NEW_ADDRESS.id }]))
  })

  it('«ویرایش» edits an address in the sheet; the cart and its options are read again', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, addressCart(home), [home, work])
    const { client } = renderSection(addressCart(home))
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    await user.click(await screen.findByRole('button', { name: 'ویرایش آدرس خانه' }))
    const sheet = screen.getByRole('dialog', { name: 'ویرایش آدرس' })
    await user.click(within(sheet).getByRole('button', { name: 'ذخیرهٔ آدرس' }))
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: CART_KEY })),
    )
    expect(destinations(mocks.bffFetch)).toEqual([])
  })

  it('an empty book opens the sheet at once, with a word of why', async () => {
    serve(mocks.bffFetch, noDestinationCart(), [])
    renderSection(noDestinationCart())
    expect(await screen.findByRole('dialog', { name: 'افزودن آدرس جدید' })).toBeInTheDocument()
    expect(screen.getByText(/هنوز آدرسی ثبت نکرده‌اید/)).toBeInTheDocument()
  })

  it('a throttled destination (429): said calmly, the addresses wait out `retry_after`', async () => {
    const user = userEvent.setup()
    const throttled = new ApiError({ status: 429, code: 'throttled', detail: '…', retryAfter: 30 })
    serve(mocks.bffFetch, addressCart(work), [home, work], () => Promise.reject(throttled))
    renderSection(addressCart(work))
    const group = await screen.findByRole('radiogroup', { name: 'آدرس ارسال' })
    await user.click(within(group).getByRole('radio', { name: /خانه/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent('لطفاً کمی بعد دوباره تلاش کنید.')
    expect(within(group).getByRole('radio', { name: /خانه/ })).toBeDisabled()
    expect(screen.getByText(/زمان باقی‌مانده تا تلاش دوباره/)).toBeInTheDocument()
    expect(destinations(mocks.bffFetch)).toHaveLength(1)
  })
})
