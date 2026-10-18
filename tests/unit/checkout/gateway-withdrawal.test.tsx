import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import gatewayUnknown from '../../fixtures/payment-intent-gateway-unknown.json'
import { stubBrowserApis } from '../support/dom-stubs'
import { gateways, intent, LINK_TOKEN } from '../payment/fixtures'
import { ok, onlineCart, PLACE, placeButton, placed, renderCheckout, serve } from './place-support'

// A gateway the shop lists but cannot use (order digest §5.4, §8.3; the dev backend's own state:
// `payment/gateway/list/` lists configurations its resolver refuses): `gateway_unknown` reads the
// gateways again and withdraws the one tried, for this page, so it is never tried again. The
// other gateway is offered; with none left the bank routes close with their reason and the
// support line, as for a bank that is not configured.

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
const list = () => ({ count: 2, total_pages: 1, results: gateways() })

async function placeNow(user: ReturnType<typeof userEvent.setup>) {
  const button = await placeButton()
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
  await user.click(button)
}

describe('a gateway the shop cannot use', () => {
  it('is withdrawn after `gateway_unknown`: the other is offered and tried, never it again', async () => {
    const user = userEvent.setup()
    const pay = vi
      .fn<(body: unknown, init: unknown) => Promise<unknown>>()
      .mockImplementationOnce(unknown)
      .mockImplementationOnce(async () => ok(intent('bank_gateway'), 201))
    serve(mocks.bffFetch, () => onlineCart(), {
      [PLACE]: placed(),
      [LINK_INTENT]: pay,
      [GATEWAYS]: async () => ok(list()),
    })
    renderCheckout({ cart: onlineCart() })
    await placeNow(user)
    const panel = await screen.findByRole('region', { name: 'سفارش شما ثبت شد' })
    expect(await within(panel).findByRole('alert')).toHaveTextContent(UNUSABLE)
    expect(pay.mock.calls[0]![0]).toMatchObject({ gateway_code: 'ZARINPAL' })
    // The bank is still offered, with the other gateway only (no chooser for one).
    expect(within(panel).getByRole('radio', { name: /درگاه بانکی/ })).toBeEnabled()
    expect(within(panel).queryByRole('radio', { name: /زرین پال/ })).not.toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'پرداخت سفارش' }))
    await waitFor(() => expect(pay).toHaveBeenCalledTimes(2))
    expect(pay.mock.calls[1]![0]).toMatchObject({ gateway_code: 'ZIBAL' })
  })

  it('none left: the bank routes close with their reason and the support line', async () => {
    const user = userEvent.setup()
    const pay = vi
      .fn<(body: unknown, init: unknown) => Promise<unknown>>()
      .mockImplementation(unknown)
    serve(mocks.bffFetch, () => onlineCart(), {
      [PLACE]: placed(),
      [LINK_INTENT]: pay,
      [GATEWAYS]: async () => ok(list()),
    })
    renderCheckout({ cart: onlineCart() })
    await placeNow(user)
    const panel = await screen.findByRole('region', { name: 'سفارش شما ثبت شد' })
    await within(panel).findByRole('alert')
    await user.click(within(panel).getByRole('button', { name: 'پرداخت سفارش' }))
    await waitFor(() => expect(pay).toHaveBeenCalledTimes(2))
    const alert = await within(panel).findByText(/پرداخت با درگاه بانکی در این فروشگاه/)
    expect(alert.closest('[role="alert"]')).not.toBeNull()
    expect(within(panel).getByRole('link', { name: /پشتیبانی/ })).toBeInTheDocument()
    const bank = within(panel).getByRole('radio', { name: /درگاه بانکی/ })
    expect(bank).toBeDisabled()
    expect(bank).toHaveAccessibleDescription(/درگاه بانکی در دسترس نیست/)
    // Nothing is tried with a withdrawn gateway: the shopper moves on to another route.
    const codes = pay.mock.calls.map(([body]) => (body as { gateway_code?: string }).gateway_code)
    expect(codes).toEqual(['ZARINPAL', 'ZIBAL'])
  })
})
