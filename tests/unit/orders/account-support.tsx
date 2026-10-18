import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Mock } from 'vitest'
import { FeatureProvider, type FeatureMap } from '@/features/settings/feature-context'
import type { Paginated } from '@/lib/api/types/common'
import type { DashboardSummary } from '@/lib/api/types/dashboard'
import type { OrderDetail, OrderListItem } from '@/lib/api/types/order-detail'
import type { AwaitingReviewOrder } from '@/lib/api/types/order-review'
import type { PaymentHistoryItem } from '@/lib/api/types/payment'
import { ApiError } from '@/lib/api/errors'
import { clientProviders } from '../support/providers'
import awaiting from '../../fixtures/account-order-awaiting.json'
import awaitingReviews from '../../fixtures/account-awaiting-reviews.json'
import cod from '../../fixtures/account-order-processing-cod.json'
import delivered from '../../fixtures/account-order-delivered.json'
import list from '../../fixtures/account-orders-list.json'
import paymentsCod from '../../fixtures/account-order-payments-cod.json'
import paymentsDelivered from '../../fixtures/account-order-payments-delivered.json'
import summaryFixture from '../../fixtures/account-summary.json'

// What the account orders' tests share: sara's live answers (2026-10-18, uuids and link tokens
// masked; tests/fixtures/account-*.json): her six orders (one awaiting payment and payable, one
// processing paid on delivery, four delivered), three of their details and payments, her summary
// and her purchases awaiting a review. The API through the test file's mocked `bffFetch` (each
// path given answers; any other never does), rendered with the session and the feature switches.

const copy = <T,>(value: unknown): T => structuredClone(value) as T

export const ORDERS = () => copy<{ data: Paginated<OrderListItem> }>(list).data
export const orderItem = (code: string, changes: Partial<OrderListItem> = {}): OrderListItem => ({
  ...ORDERS().results.find((order) => order.order_code === code)!,
  ...changes,
})

const DETAILS = { awaiting, cod, delivered } as const
/** `awaiting` 3067562358 (payable), `cod` 5210924113 (processing), `delivered` 7010868573. */
export const detail = (
  name: keyof typeof DETAILS,
  changes: Partial<OrderDetail> = {},
): OrderDetail => ({ ...copy<{ data: OrderDetail }>(DETAILS[name]).data, ...changes })

/** A pure pay-on-delivery order awaiting its confirmation: nothing online, not payable. */
export const unconfirmedCod = (): OrderDetail => {
  const order = detail('awaiting')
  return {
    ...order,
    is_payable: false,
    cash_on_delivery: true,
    money: {
      ...order.money,
      amount_charged_online: 0,
      amount_outstanding_online: 0,
      amount_to_collect_on_delivery: order.money.total,
    },
  }
}

export const payments = (name: 'delivered' | 'cod') =>
  copy<{ data: Paginated<PaymentHistoryItem> }>(name === 'cod' ? paymentsCod : paymentsDelivered)
    .data

export const summary = (changes: Partial<DashboardSummary> = {}): DashboardSummary => ({
  ...copy<{ data: DashboardSummary }>(summaryFixture).data,
  ...changes,
})

export const reviewsPage = () =>
  copy<{ data: Paginated<AwaitingReviewOrder> }>(awaitingReviews).data

export const page = <T,>(results: T[], count = results.length): Paginated<T> => ({
  count,
  total_pages: Math.max(1, Math.ceil(count / 20)),
  current_page: 1,
  page_size: 20,
  next: null,
  previous: null,
  results,
})

export const ok = (data: unknown, msg = 'درخواست با موفقیت انجام شد.', status = 200) =>
  Promise.resolve({ data, msg, status })

export const refuse = (status: number, code: string, detail = 'رد شد.', extra = {}) =>
  Promise.reject(
    ApiError.fromBody(status, {
      msg: 'خطا',
      code: status,
      data: {
        type: status === 400 ? 'validation_error' : 'client_error',
        errors: [{ code, detail, attr: null }],
        ...extra,
      },
    }),
  )

export type Route = (init: Record<string, unknown>) => Promise<unknown>

export function serve(bffFetch: Mock, routes: Record<string, Route> = {}) {
  bffFetch.mockImplementation((path: string, init: Record<string, unknown> = {}) => {
    const route = routes[path]
    return route ? route(init) : new Promise(() => {})
  })
}

export const calls = (bffFetch: Mock, path: string) =>
  bffFetch.mock.calls.filter(([called]) => called === path)

export function renderAccount(
  node: ReactNode,
  {
    features = {},
    hasSession = true,
  }: { features?: Partial<FeatureMap>; hasSession?: boolean } = {},
) {
  const { client, wrapper: Wrapper } = clientProviders({ hasSession })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FeatureProvider initial={features}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
  return { client, ...render(node, { wrapper }) }
}
