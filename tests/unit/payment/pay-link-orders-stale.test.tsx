import userEvent from '@testing-library/user-event'
import type { QueryClient } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { ORDERS_KEY } from '@/lib/session/viewer-queries'
import { stubBrowserApis } from '../support/dom-stubs'
import { intent, LINK_TOKEN } from './fixtures'
import { payLink } from './link-fixtures'
import { LINK_INTENT, ok, renderLink, routesReady, serve, type Route } from './pay-link-support'

// An order settled through its link (Plan 4 Task 10 fix round): a signed-in owner's «سفارش‌های
// من» is marked stale (every key under `ORDERS_KEY`; no request while no orders page is open).
// The account's own pay sheet (the uuid door) refreshes them itself (`ordersChanged`).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: vi.fn() }))
vi.mock('@/lib/navigation/hard-navigation', () => ({ loadPage: vi.fn(), reloadPage: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => `/order/pay/${LINK_TOKEN}/`,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
})

const ordersMarked = (spy: MockInstance<QueryClient['invalidateQueries']>) =>
  spy.mock.calls.filter(
    ([filters]) => JSON.stringify(filters?.queryKey) === JSON.stringify(ORDERS_KEY),
  ).length

describe('the orders after a payment through the link', () => {
  it('a pay-on-delivery order confirmed: the orders marked stale', async () => {
    const user = userEvent.setup()
    const confirm = vi.fn<Route>(async () => ok(intent('pay_on_delivery'), 201))
    serve(mocks.bffFetch, { [LINK_INTENT]: confirm })
    const { client } = renderLink({
      hasSession: true,
      link: payLink({
        amount_charged_online: 0,
        amount_outstanding_online: 0,
        amount_to_collect_on_delivery: 1_049_000,
        is_payable: false,
      }),
    })
    const spy = vi.spyOn(client, 'invalidateQueries')
    await routesReady()
    await user.click(screen.getByRole('button', { name: 'تأیید سفارش' }))
    expect(await screen.findByRole('heading', { name: 'سفارش شما تأیید شد' })).toBeVisible()
    expect(ordersMarked(spy)).toBe(1)
  })
})
