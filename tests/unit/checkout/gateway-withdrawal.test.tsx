import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import gatewayUnknown from '../../fixtures/payment-intent-gateway-unknown.json'
import { stubBrowserApis } from '../support/dom-stubs'
import { gateways, intent, LINK_TOKEN } from '../payment/fixtures'
import { ok, onlineCart, PLACE, placeButton, placed, renderCheckout, serve } from './place-support'

// A gateway refused as unknown at intent time (order digest §5.4, §8.3): the gateway list names
// only the gateways an intent can use (BACKEND-ISSUES M-4, fixed), so `gateway_unknown` means the
// page's list is out of date. The page withdraws nothing itself: it reads the list again and
// offers what that list holds; read again without any gateway, the bank routes close with their
// reason.

const LINK_INTENT = `payment/link/${LINK_TOKEN}/intent/`
const GATEWAYS = 'payment/gateway/list/'
const UNUSABLE = 'این درگاه در حال حاضر در دسترس نیست؛ درگاه یا روش دیگری را انتخاب کنید'
const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: vi.fn() }))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  sessionStorage.clear()
  localStorage.clear()
})

const unknown = () => Promise.reject(ApiError.fromBody(400, gatewayUnknown))
const list = (codes: string[]) => {
  const results = gateways().filter(({ code }) => codes.includes(code))
  return { count: results.length, total_pages: 1, results }
}

async function placeNow(user: ReturnType<typeof userEvent.setup>) {
  const button = await placeButton()
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
  await user.click(button)
}

describe('a gateway refused as unknown', () => {
  it('the list read again: the gateway it no longer holds is not offered, the next press uses the other', async () => {
    const user = userEvent.setup()
    const pay = vi
      .fn<(body: unknown, init: unknown) => Promise<unknown>>()
      .mockImplementationOnce(unknown)
      .mockImplementationOnce(async () => ok(intent('bank_gateway'), 201))
    const read = vi.fn(async () => ok(list(['ZIBAL'])))
    serve(mocks.bffFetch, () => onlineCart(), {
      [PLACE]: placed(),
      [LINK_INTENT]: pay,
      [GATEWAYS]: read,
    })
    renderCheckout({ cart: onlineCart() })
    await placeNow(user)
    const panel = await screen.findByRole('region', { name: 'سفارش شما ثبت شد' })
    expect(await within(panel).findByRole('alert')).toHaveTextContent(UNUSABLE)
    expect(pay.mock.calls[0]![0]).toMatchObject({ gateway_code: 'ZARINPAL' })
    expect(read).toHaveBeenCalledTimes(1)
    // The bank is still offered, with the gateway the list now holds (no chooser for one).
    expect(within(panel).getByRole('radio', { name: /درگاه بانکی/ })).toBeEnabled()
    await waitFor(() =>
      expect(within(panel).queryByRole('radio', { name: /زرین پال/ })).not.toBeInTheDocument(),
    )
    await user.click(within(panel).getByRole('button', { name: 'پرداخت سفارش' }))
    await waitFor(() => expect(pay).toHaveBeenCalledTimes(2))
    expect(pay.mock.calls[1]![0]).toMatchObject({ gateway_code: 'ZIBAL' })
  })

  it('the list read again holds none: the bank routes close with their reason', async () => {
    const user = userEvent.setup()
    const pay = vi
      .fn<(body: unknown, init: unknown) => Promise<unknown>>()
      .mockImplementation(unknown)
    serve(mocks.bffFetch, () => onlineCart(), {
      [PLACE]: placed(),
      [LINK_INTENT]: pay,
      [GATEWAYS]: async () => ok(list([])),
    })
    renderCheckout({ cart: onlineCart() })
    await placeNow(user)
    const panel = await screen.findByRole('region', { name: 'سفارش شما ثبت شد' })
    await within(panel).findByRole('alert')
    const bank = within(panel).getByRole('radio', { name: /درگاه بانکی/ })
    await waitFor(() => expect(bank).toBeDisabled())
    expect(bank).toHaveAccessibleDescription(/درگاه بانکی در دسترس نیست/)
    // Nothing more is sent to the bank: the shopper moves on to another route.
    expect(pay).toHaveBeenCalledTimes(1)
  })
})
