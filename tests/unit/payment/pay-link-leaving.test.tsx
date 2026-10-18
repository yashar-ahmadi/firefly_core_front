import { act, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLinkPayment } from '@/features/payment/use-link-payment'
import type { PaymentCatalogState } from '@/features/payment/use-payment-catalog'
import { FeatureProvider } from '@/features/settings/feature-context'
import { LEAVING_MS } from '@/lib/navigation/leaving'
import { clientProviders } from '../support/providers'
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

// The card's page never loaded (Esc, a network failure then Back) or this page came back from
// the back-forward cache: the press must not stay taken for good. It comes back after a bounded
// wait, and at once on a restore (`pageshow` with `persisted`).
describe('useLinkPayment, card to card, the page did not leave after all', () => {
  const catalog = { gateways: [], withdraw: vi.fn() } as unknown as PaymentCatalogState
  const intents = () => mocks.bffFetch.mock.calls.filter(([path]) => path === LINK_INTENT)
  const restore = (persisted: boolean) =>
    act(() => void window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted })))
  function renderPayment() {
    mocks.bffFetch.mockResolvedValue(ok(intent('card_transfer'), 201))
    const { wrapper: Wrapper } = clientProviders()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <FeatureProvider initial={{}}>
        <Wrapper>{children}</Wrapper>
      </FeatureProvider>
    )
    const options = {
      door: { kind: 'link', token: LINK_TOKEN } as const,
      orderCode: '5592580094',
      catalog,
      suggest: vi.fn(),
      onPaid: vi.fn(),
      onAttemptOpen: vi.fn(),
      onStale: vi.fn(),
    }
    return renderHook(() => useLinkPayment(options), { wrapper })
  }

  it('the press comes back after a bounded wait', async () => {
    vi.useFakeTimers()
    try {
      const { result } = renderPayment()
      await act(() => result.current.pay('card_transfer'))
      await act(async () => void (await vi.advanceTimersByTimeAsync(LEAVING_MS - 100)))
      await act(() => result.current.pay('card_transfer'))
      expect(intents()).toHaveLength(1)
      expect(result.current.state.phase).toBe('paying')
      await act(async () => void (await vi.advanceTimersByTimeAsync(100)))
      expect(result.current.state.phase).toBe('idle')
      await act(() => result.current.pay('card_transfer'))
      expect(intents()).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('back from the back-forward cache: the press comes back at once', async () => {
    const { result } = renderPayment()
    await act(() => result.current.pay('card_transfer'))
    await restore(false)
    await act(() => result.current.pay('card_transfer'))
    expect(intents()).toHaveLength(1)
    await restore(true)
    expect(result.current.state.phase).toBe('idle')
    await act(() => result.current.pay('card_transfer'))
    expect(intents()).toHaveLength(2)
  })
})
