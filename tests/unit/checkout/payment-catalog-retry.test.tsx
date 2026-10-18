import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { stubBrowserApis } from '../support/dom-stubs'
import { catalog, gateways, methods } from '../payment/fixtures'
import { calls, ok, onlineCart, placeButton, renderCheckout, serve } from './place-support'

// The payment routes when the server could not read the shop's lists (order digest §3.2.1–3.2.2):
// the step says so, and «تلاش دوباره» reads them through the BFF; the routes then show (their
// labels only: the operator's texts come sanitised from the server alone).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  sessionStorage.clear()
})

const page = <T,>(results: T[]) => ({
  count: results.length,
  total_pages: 1,
  current_page: 1,
  page_size: 100,
  next: null,
  previous: null,
  results,
})

describe('the payment lists the server could not read', () => {
  it('«تلاش دوباره» reads them again; the routes show, the shop’s default chosen', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, () => onlineCart(), {
      'payment/method/list/': async () => ok(page(methods())),
      'payment/gateway/list/': async () => ok(page(gateways())),
    })
    renderCheckout({
      cart: onlineCart(),
      props: { catalog: catalog({ methods: null, gateways: null }) },
    })
    const step = screen.getByRole('region', { name: /۳.*پرداخت/ })
    expect(await within(step).findByText('روش\u{200C}های پرداخت بارگذاری نشد.')).toBeVisible()
    await user.click(within(step).getByRole('button', { name: 'تلاش دوباره' }))
    await waitFor(() => expect(calls(mocks.bffFetch, 'payment/method/list/')).toHaveLength(1))
    expect(calls(mocks.bffFetch, 'payment/gateway/list/')).toHaveLength(1)
    // The default route (the bank) is chosen: the step is done and the review leads.
    await placeButton()
    expect(step).toHaveAttribute('data-state', 'done')
    expect(step).toHaveTextContent('درگاه بانکی')
  })
})
