import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { contextOf } from '@/features/checkout/placed-order'
import { usePayOrder } from '@/features/checkout/use-pay-order'
import type { PaymentCatalogState } from '@/features/payment/use-payment-catalog'
import { FeatureProvider } from '@/features/settings/feature-context'
import { clientProviders } from '../support/providers'
import { intent, LINK_TOKEN, PAYMENT_UUID, placement } from '../payment/fixtures'

// The placed order paid by card to card: its page is a full page load, and while the browser
// loads it no further `pay()` opens an intent (Review Focus #2; it would only meet the attempt
// just opened: 409 `payment_attempt_open`). A refusal gives the press back.

const LINK_INTENT = `payment/link/${LINK_TOKEN}/intent/`
const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn(), loadPage: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  loadPage: mocks.loadPage,
  reloadPage: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}))

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.loadPage.mockReset()
  localStorage.clear()
})

const catalog = { gateways: [], withdraw: vi.fn() } as unknown as PaymentCatalogState
const ctx = contextOf(placement(), { guest: true, route: 'card_transfer', gatewayCode: null })

function render() {
  const { wrapper: Wrapper } = clientProviders()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FeatureProvider initial={{}}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
  return renderHook(() => usePayOrder(ctx, catalog, { suggest: vi.fn() }), { wrapper })
}

const intents = () => mocks.bffFetch.mock.calls.filter(([path]) => path === LINK_INTENT)

describe('usePayOrder, card to card', () => {
  it('no second intent while the card’s page loads', async () => {
    mocks.bffFetch.mockResolvedValue({ data: intent('card_transfer'), msg: '', status: 201 })
    const { result } = render()
    await act(() => result.current.pay('card_transfer'))
    expect(mocks.loadPage).toHaveBeenCalledWith(`/payment/card-transfer/${PAYMENT_UUID}/`)
    await act(() => result.current.pay('card_transfer'))
    await act(() => result.current.pay('bank_gateway'))
    expect(intents()).toHaveLength(1)
  })

  it('a refusal gives the press back', async () => {
    mocks.bffFetch.mockRejectedValueOnce(new Error('offline'))
    mocks.bffFetch.mockResolvedValue({ data: intent('card_transfer'), msg: '', status: 201 })
    const { result } = render()
    await act(() => result.current.pay('card_transfer'))
    expect(result.current.state.phase).toBe('failed')
    await act(() => result.current.pay('card_transfer'))
    expect(intents()).toHaveLength(2)
  })
})
