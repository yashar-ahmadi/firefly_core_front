import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubBrowserApis } from '../support/dom-stubs'
import { intent, LINK_TOKEN, PAYMENT_UUID } from './fixtures'
import { payLink } from './link-fixtures'
import {
  LINK_INTENT,
  LINK_READ,
  ok,
  renderLink,
  routesReady,
  serve,
  type Route,
} from './pay-link-support'

// Pressing again while a payment's outcome is on its way (Review Focus #2): card to card is a
// full page load to its page, and a press during that load opens no second intent (it would only
// meet the attempt just opened: 409 `payment_attempt_open`); a wallet payment the server did not
// settle at once reads the order again and gives the press back.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), loadPage: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: vi.fn() }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  loadPage: mocks.loadPage,
  reloadPage: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => `/order/pay/${LINK_TOKEN}/`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.loadPage.mockReset()
  localStorage.clear()
})

const routes = () => screen.getByRole('radiogroup', { name: 'روش\u{200C}های پرداخت' })
const payButton = () => screen.getByRole('button', { name: 'پرداخت سفارش' })

describe('while the page leaves', () => {
  it('card to card: a press during its page’s load opens no second intent', async () => {
    const user = userEvent.setup()
    const pay = vi.fn<Route>(async () => ok(intent('card_transfer'), 201))
    serve(mocks.bffFetch, { [LINK_INTENT]: pay })
    renderLink()
    await routesReady()
    await user.click(within(routes()).getByRole('radio', { name: /کارت به کارت/ }))
    await user.click(payButton())
    await waitFor(() =>
      expect(mocks.loadPage).toHaveBeenCalledWith(`/payment/card-transfer/${PAYMENT_UUID}/`),
    )
    // The browser is still loading the card's page: the button is there, pressed again.
    await user.click(payButton())
    await user.click(payButton())
    expect(pay).toHaveBeenCalledTimes(1)
  })

  it('a wallet payment not settled at once: the order read again, the press given back', async () => {
    const user = userEvent.setup()
    const pending = intent('wallet', {
      status: 'pending',
      payment: { ...intent('wallet').payment!, status: 'pending', settled_at: null },
    })
    const pay = vi.fn<Route>(async () => ok(pending, 201))
    const read = vi.fn<Route>(async () => ok(payLink()))
    serve(mocks.bffFetch, { [LINK_INTENT]: pay, [LINK_READ]: read })
    renderLink({ hasSession: true })
    await routesReady()
    const wallet = await within(routes()).findByRole('radio', { name: /^کیف پول(?! و)/ })
    await waitFor(() => expect(wallet).toBeEnabled())
    await user.click(wallet)
    await user.click(payButton())
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(payButton()).not.toHaveAttribute('aria-busy'))
    expect(payButton()).not.toHaveAttribute('aria-disabled')
  })
})
