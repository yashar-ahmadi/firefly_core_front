import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { contextOf, savePlaced, type PlacedContext } from '@/features/checkout/placed-order'
import { ThanksPage } from '@/features/checkout/thanks/thanks-page'
import { ApiError } from '@/lib/api/errors'
import { ORDERS_KEY, SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { intent, placement } from '../payment/fixtures'

// «تأیید سفارش» again on the thanks page (Plan 4 final fix wave): a signed-in shopper's
// confirmation moves the order (awaiting payment → under way), so «سفارش‌های من» and the
// account's counts are marked stale, as the checkout's own payment and the link page's do
// (3a522c3). Also when the server says it settled meanwhile. A guest has no such lists; a
// refusal changes nothing.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/thanks/5592580094/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

const CODE = '5592580094'

beforeEach(() => {
  mocks.bffFetch.mockReset()
  sessionStorage.clear()
  localStorage.clear()
})

function unconfirmed(guest: boolean): PlacedContext {
  const ctx = contextOf(placement(), { guest, route: 'pay_on_delivery', gatewayCode: null })
  return { ...ctx, outcome: 'unconfirmed', failure: 'خطا.', A: 0, D: 2_438_000 }
}

/** How often each key was invalidated. */
function marked(spy: MockInstance<QueryClient['invalidateQueries']>, key: readonly unknown[]) {
  return spy.mock.calls.filter(
    ([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(key),
  ).length
}

async function confirmOnce({ guest, answer }: { guest: boolean; answer: () => Promise<unknown> }) {
  const user = userEvent.setup()
  savePlaced(unconfirmed(guest))
  mocks.bffFetch.mockImplementationOnce(answer)
  const { client, wrapper } = clientProviders({ hasSession: !guest })
  const spy = vi.spyOn(client, 'invalidateQueries')
  render(<ThanksPage code={CODE} supportPhone={null} />, { wrapper })
  await user.click(await screen.findByRole('button', { name: 'تأیید سفارش' }))
  return spy
}

const confirmed = () => Promise.resolve({ data: intent('pay_on_delivery'), msg: '', status: 201 })

describe('the thanks page’s confirmation and the account’s lists', () => {
  it('signed in, confirmed: the orders and the counts are marked stale', async () => {
    const spy = await confirmOnce({ guest: false, answer: confirmed })
    expect(await screen.findByRole('heading', { name: 'سفارش شما تأیید شد' })).toBeInTheDocument()
    expect(mocks.bffFetch.mock.calls[0]![0]).toBe(`payment/order/${placement().uuid}/intent/`)
    expect(marked(spy, ORDERS_KEY)).toBeGreaterThan(0)
    expect(marked(spy, SUMMARY_KEY)).toBeGreaterThan(0)
  })

  it('signed in, settled meanwhile (409): marked stale too, the order moved', async () => {
    const settled = () =>
      Promise.reject(
        new ApiError({ status: 409, code: 'order_already_settled', detail: 'پرداخت شده است.' }),
      )
    const spy = await confirmOnce({ guest: false, answer: settled })
    await screen.findByText('پرداخت شده است.')
    expect(marked(spy, ORDERS_KEY)).toBeGreaterThan(0)
    expect(marked(spy, SUMMARY_KEY)).toBeGreaterThan(0)
  })

  it('signed in, refused (the bank did not answer): nothing changed, nothing marked', async () => {
    const refused = () =>
      Promise.reject(new ApiError({ status: 503, code: 'gateway_unavailable', detail: 'x' }))
    const spy = await confirmOnce({ guest: false, answer: refused })
    expect(await screen.findByRole('alert')).toHaveTextContent('درگاه بانک پاسخ نداد')
    expect(marked(spy, ORDERS_KEY)).toBe(0)
    expect(marked(spy, SUMMARY_KEY)).toBe(0)
  })

  it('a guest, confirmed: no account lists to mark', async () => {
    const spy = await confirmOnce({ guest: true, answer: confirmed })
    expect(await screen.findByRole('heading', { name: 'سفارش شما تأیید شد' })).toBeInTheDocument()
    expect(marked(spy, ORDERS_KEY)).toBe(0)
    expect(marked(spy, SUMMARY_KEY)).toBe(0)
  })
})
